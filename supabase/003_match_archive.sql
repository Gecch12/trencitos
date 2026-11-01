-- Durable match archive, atomic with the active-room checkpoint. Server only.
begin;
create table if not exists public.trencitos_matches (
 id uuid primary key,
 metadata jsonb not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.trencitos_match_frames (
 match_id uuid not null references public.trencitos_matches(id),
 seq integer not null check(seq>=0),
 data jsonb not null,
 primary key(match_id,seq)
);
create table if not exists public.trencitos_guest_claims (
 guest_id text primary key check(guest_id ~ '^[a-f0-9]{64}$'),
 account_id uuid not null,
 claimed_at timestamptz not null default now()
);
alter table public.trencitos_matches enable row level security;
alter table public.trencitos_match_frames enable row level security;
alter table public.trencitos_guest_claims enable row level security;
revoke all on public.trencitos_matches,public.trencitos_match_frames,public.trencitos_guest_claims from public,anon,authenticated;
grant select,insert,update on public.trencitos_matches,public.trencitos_match_frames,public.trencitos_guest_claims to service_role;

create or replace function public.ferrovia_save_checkpoint_v2(p_writer uuid,p_version bigint,p_commit uuid,p_rooms jsonb,p_archive jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; entry jsonb; frame jsonb; archive_match_id uuid; previous public.ferrovia_checkpoint;
begin
 select * into strict previous from public.ferrovia_checkpoint where id=true for update;
 -- The existing function enforces writer fencing and idempotent commit IDs.
 saved:=public.ferrovia_save_checkpoint(p_writer,p_version,p_commit,p_rooms);
 if previous.last_commit=p_commit then return saved; end if;
 if jsonb_typeof(p_archive)<>'array' then raise exception 'Invalid archive batch'; end if;
 for entry in select value from jsonb_array_elements(p_archive) loop
  archive_match_id:=(entry->'match'->>'id')::uuid;
  insert into public.trencitos_matches(id,metadata) values(archive_match_id,entry->'match')
    on conflict(id) do update set metadata=excluded.metadata,updated_at=now();
  for frame in select value from jsonb_array_elements(entry->'frames') loop
   insert into public.trencitos_match_frames(match_id,seq,data) values(archive_match_id,(frame->>'seq')::integer,frame)
    on conflict(match_id,seq) do nothing;
   if (select data from public.trencitos_match_frames where match_id=archive_match_id and seq=(frame->>'seq')::integer) is distinct from frame then raise exception 'Archive sequence conflict'; end if;
   if (frame->>'seq')::integer>0 and not exists(select 1 from public.trencitos_match_frames where match_id=archive_match_id and seq=(frame->>'seq')::integer-1) then raise exception 'Archive sequence gap'; end if;
  end loop;
 end loop;
 return saved;
end;
$$;
create or replace function public.trencitos_claim_guest(p_guest text,p_account uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner uuid;
begin
 if p_guest is null or p_account is null then raise exception 'Missing identity'; end if;
 insert into public.trencitos_guest_claims(guest_id,account_id) values(p_guest,p_account) on conflict do nothing;
 select account_id into strict owner from public.trencitos_guest_claims where guest_id=p_guest;
 if owner<>p_account then raise exception 'GUEST_ALREADY_CLAIMED'; end if;
 return jsonb_build_object('ok',true);
end;
$$;
create or replace function public.trencitos_read_archive(p_guest text,p_account uuid,p_match uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'matches',coalesce((select jsonb_agg(m.metadata || case when p_match is not null then jsonb_build_object('frames',coalesce((select jsonb_agg(f.data order by f.seq) from public.trencitos_match_frames f where f.match_id=m.id),'[]'::jsonb)) else '{}'::jsonb end order by (m.metadata->>'startedAt')::bigint desc)
 from public.trencitos_matches m where (p_match is not null and m.id=p_match) or (p_match is null and exists(
 select 1 from jsonb_array_elements(m.metadata->'players') p left join public.trencitos_guest_claims c on c.guest_id=p->>'guestId'
 where (p->>'bot')::boolean=false and ((p_account is not null and ((p->>'accountId')::uuid=p_account or c.account_id=p_account)) or (p_guest is not null and p->>'guestId'=p_guest and c.guest_id is null))
 ))),'[]'::jsonb),
 'claims',coalesce((select jsonb_object_agg(guest_id,account_id) from public.trencitos_guest_claims where guest_id=p_guest or account_id=p_account),'{}'::jsonb));
$$;
revoke all on function public.ferrovia_save_checkpoint_v2(uuid,bigint,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.trencitos_claim_guest(text,uuid) from public,anon,authenticated;
revoke all on function public.trencitos_read_archive(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ferrovia_save_checkpoint_v2(uuid,bigint,uuid,jsonb,jsonb) to service_role;
grant execute on function public.trencitos_claim_guest(text,uuid) to service_role;
grant execute on function public.trencitos_read_archive(text,uuid,uuid) to service_role;
create or replace function public.trencitos_close_missing(p_writer uuid,p_live jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.ferrovia_checkpoint where id=true and writer=p_writer for update;
 if not found then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
 update public.trencitos_matches set metadata=metadata || jsonb_build_object('status','abandoned','closedAt',floor(extract(epoch from now())*1000),'endReason','La sala caducó sin reconexión.')
 where metadata->>'status'='active' and not p_live ? id::text;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.trencitos_close_missing(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.trencitos_close_missing(uuid,jsonb) to service_role;
commit;
