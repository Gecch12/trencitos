-- After 007. Additive storage; legacy claim reconstructs a complete checkpoint
-- before an older server resumes. No historical frames or games are discarded.
begin;
alter table public.ferrovia_checkpoint add column if not exists room_mode boolean not null default false;
create table if not exists public.trencitos_rooms (
 code text primary key, version bigint not null default 0 check(version>=0),
 room jsonb, last_commit uuid, fingerprint text, updated_at timestamptz not null default now()
);
alter table public.trencitos_rooms enable row level security;
revoke all on public.trencitos_rooms from public,anon,authenticated;
grant select,insert,update on public.trencitos_rooms to service_role;

create or replace function public.ferrovia_claim_checkpoint(p_writer uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ferrovia_checkpoint; current_rooms jsonb;
begin
 if p_writer is null then raise exception 'Missing writer'; end if;
 select * into strict r from public.ferrovia_checkpoint where id=true for update;
 if r.room_mode then
  select coalesce(jsonb_agg(room order by code),'[]'::jsonb) into current_rooms from public.trencitos_rooms where room is not null;
 else current_rooms:=r.rooms; end if;
 update public.ferrovia_checkpoint set writer=p_writer,rooms=current_rooms,room_mode=false where id=true returning * into r;
 return jsonb_build_object('schema_version',r.schema_version,'version',r.version,'rooms',r.rooms,
  'capabilities',jsonb_build_object('roomDelta',1,'roomTransactions',1));
end $$;

create or replace function public.ferrovia_save_checkpoint(p_writer uuid, p_version bigint, p_commit uuid, p_rooms jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.ferrovia_checkpoint;
begin
  if p_commit is null or p_writer is null or p_version is null or p_rooms is null
     or jsonb_typeof(p_rooms) <> 'array' or octet_length(p_rooms::text) > 10485760 then
    raise exception 'Invalid checkpoint';
  end if;
  select * into strict r from public.ferrovia_checkpoint where id = true for update;
  if r.room_mode or r.writer is distinct from p_writer then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
  if r.last_commit = p_commit then
    return jsonb_build_object('version', r.version, 'commit', r.last_commit);
  end if;
  if r.version <> p_version then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
  update public.ferrovia_checkpoint set rooms = p_rooms, version = version + 1,
    last_commit = p_commit, updated_at = now() where id = true returning * into r;
  return jsonb_build_object('version', r.version, 'commit', r.last_commit);
end;
$$;

create or replace function public.trencitos_claim_rooms(p_writer uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ferrovia_checkpoint;
begin
 select * into strict r from public.ferrovia_checkpoint where id=true for update;
 if r.writer is distinct from p_writer then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
 if not r.room_mode then
  insert into public.trencitos_rooms(code,version,room)
   select x->>'code',1,x from jsonb_array_elements(r.rooms) x
   on conflict(code) do update set room=excluded.room,version=trencitos_rooms.version+1,updated_at=now();
  update public.trencitos_rooms t set room=null,version=version+1,updated_at=now()
   where room is not null and not exists(select 1 from jsonb_array_elements(r.rooms) x where x->>'code'=t.code);
  -- A new writer fences all old retries. Tombstone versions need not occupy
  -- the new process's memory; reuse starts at zero for these empty slots.
  update public.trencitos_rooms set version=0,last_commit=null,fingerprint=null where room is null;
  update public.ferrovia_checkpoint set room_mode=true where id=true;
 end if;
 return jsonb_build_object('versions',coalesce((select jsonb_object_agg(code,version) from public.trencitos_rooms where room is not null),'{}'::jsonb));
end $$;

create or replace function public.trencitos_save_rooms(p_writer uuid,p_commit uuid,p_changes jsonb,p_archive jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb; entry jsonb; frame jsonb; archive_match_id uuid; current_room public.trencitos_rooms; versions jsonb:='{}';
 signature text; retried boolean:=false; fresh boolean:=false;
begin
 if p_writer is null or p_commit is null or p_changes is null or jsonb_typeof(p_changes)<>'array'
  or p_archive is null or jsonb_typeof(p_archive)<>'array' or octet_length(p_changes::text)>10485760
  or (select count(*) from jsonb_array_elements(p_changes))<>(select count(distinct x->>'code') from jsonb_array_elements(p_changes) x)
  or exists(select 1 from jsonb_array_elements(p_changes) x where coalesce(x->>'code','')='' or x->>'version' is null
   or (x->>'version')::bigint<0 or (x->'room'<>'null'::jsonb and (jsonb_typeof(x->'room')<>'object' or x->'room'->>'code' is distinct from x->>'code')) or not x ? 'room')
 then raise exception 'Invalid room transaction'; end if;
 -- Shared ownership lock allows distinct rooms to commit concurrently. Claim
 -- takes the exclusive lock and cannot fence a partially committed operation.
 perform 1 from public.ferrovia_checkpoint where id=true and writer=p_writer and room_mode for share;
 if not found then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
 signature:=md5(p_changes::text||p_archive::text);
 for c in select value from jsonb_array_elements(p_changes) order by value->>'code' loop
  insert into public.trencitos_rooms(code) values(c->>'code') on conflict do nothing;
  select * into strict current_room from public.trencitos_rooms where code=c->>'code' for update;
  if current_room.last_commit=p_commit then
   if current_room.fingerprint is distinct from signature or current_room.version<>(c->>'version')::bigint+1 then raise exception 'Room commit ID reused'; end if;
   retried:=true;
  else
   if current_room.version<>(c->>'version')::bigint then raise exception 'FERROVIA_ROOM_CONFLICT'; end if;
   fresh:=true;
  end if;
  versions:=versions||jsonb_build_object(c->>'code',(c->>'version')::bigint+1);
 end loop;
 if retried and fresh then raise exception 'Partial room retry'; end if;
 if retried then return jsonb_build_object('commit',p_commit,'versions',versions); end if;
 for c in select value from jsonb_array_elements(p_changes) loop
  update public.trencitos_rooms set room=nullif(c->'room','null'::jsonb),version=version+1,last_commit=p_commit,fingerprint=signature,updated_at=now() where code=c->>'code';
 end loop;
 for entry in select value from jsonb_array_elements(p_archive) loop
  if not exists(select 1 from jsonb_array_elements(p_changes) changed where changed->>'code'=entry->'match'->>'code') then raise exception 'Archive outside room transaction'; end if;
  archive_match_id:=(entry->'match'->>'id')::uuid;
  insert into public.trencitos_matches(id,metadata) values(archive_match_id,entry->'match')
   on conflict(id) do update set metadata=excluded.metadata,updated_at=now();
  for frame in select value from jsonb_array_elements(entry->'frames') loop
   insert into public.trencitos_match_frames(match_id,seq,data) values(archive_match_id,(frame->>'seq')::integer,frame) on conflict do nothing;
   if (select data from public.trencitos_match_frames f where f.match_id=archive_match_id and seq=(frame->>'seq')::integer) is distinct from frame then raise exception 'Archive sequence conflict'; end if;
   if (frame->>'seq')::integer>0 and not exists(select 1 from public.trencitos_match_frames f where f.match_id=archive_match_id and seq=(frame->>'seq')::integer-1) then raise exception 'Archive sequence gap'; end if;
  end loop;
 end loop;
 return jsonb_build_object('commit',p_commit,'versions',versions);
end $$;
create or replace function public.trencitos_read_room(p_writer uuid,p_code text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.trencitos_rooms;
begin
 perform 1 from public.ferrovia_checkpoint where id=true and writer=p_writer and room_mode for share;
 if not found then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
 select * into r from public.trencitos_rooms where code=p_code for share;
 return jsonb_build_object('room',r.room,'version',coalesce(r.version,0));
end $$;
revoke all on function public.trencitos_claim_rooms(uuid),public.trencitos_save_rooms(uuid,uuid,jsonb,jsonb),public.trencitos_read_room(uuid,text) from public,anon,authenticated;
grant execute on function public.trencitos_claim_rooms(uuid),public.trencitos_save_rooms(uuid,uuid,jsonb,jsonb),public.trencitos_read_room(uuid,text) to service_role;
commit;
