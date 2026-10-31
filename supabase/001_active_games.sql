-- Run once in the Supabase SQL Editor. No browser/user role may read secrets,
-- hands, decks or destinations. The Node server is the only database client.
begin;
create table if not exists public.ferrovia_checkpoint (
  id boolean primary key default true check (id),
  schema_version integer not null default 1 check (schema_version = 1),
  version bigint not null default 0 check (version >= 0),
  writer uuid,
  last_commit uuid,
  rooms jsonb not null default '[]'::jsonb check (jsonb_typeof(rooms) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.ferrovia_checkpoint enable row level security;
revoke all on public.ferrovia_checkpoint from public, anon, authenticated;
grant select, insert, update on public.ferrovia_checkpoint to service_role;
insert into public.ferrovia_checkpoint(id) values (true) on conflict do nothing;

-- Fencing: a new deployment takes ownership atomically with reading the latest
-- state. The old process can no longer overwrite it during a rolling deploy.
create or replace function public.ferrovia_claim_checkpoint(p_writer uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.ferrovia_checkpoint;
begin
  if p_writer is null then raise exception 'Missing writer'; end if;
  update public.ferrovia_checkpoint set writer = p_writer where id = true returning * into strict r;
  return jsonb_build_object('schema_version', r.schema_version, 'version', r.version, 'rooms', r.rooms);
end;
$$;

create or replace function public.ferrovia_save_checkpoint(p_writer uuid, p_version bigint, p_commit uuid, p_rooms jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.ferrovia_checkpoint;
begin
  if p_commit is null or p_writer is null or p_version is null or p_rooms is null
     or jsonb_typeof(p_rooms) <> 'array' or octet_length(p_rooms::text) > 10485760 then
    raise exception 'Invalid checkpoint';
  end if;
  select * into strict r from public.ferrovia_checkpoint where id = true for update;
  if r.writer is distinct from p_writer then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
  if r.last_commit = p_commit then
    return jsonb_build_object('version', r.version, 'commit', r.last_commit);
  end if;
  if r.version <> p_version then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
  update public.ferrovia_checkpoint set rooms = p_rooms, version = version + 1,
    last_commit = p_commit, updated_at = now() where id = true returning * into r;
  return jsonb_build_object('version', r.version, 'commit', r.last_commit);
end;
$$;
revoke all on function public.ferrovia_claim_checkpoint(uuid) from public, anon, authenticated;
revoke all on function public.ferrovia_save_checkpoint(uuid, bigint, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ferrovia_claim_checkpoint(uuid) to service_role;
grant execute on function public.ferrovia_save_checkpoint(uuid, bigint, uuid, jsonb) to service_role;
commit;
