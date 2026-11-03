-- Incremental room transfer. Keeps the existing writer lease, one atomic
-- checkpoint/archive and idempotent commit ID; old servers remain compatible.
begin;
create or replace function public.ferrovia_claim_checkpoint(p_writer uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ferrovia_checkpoint;
begin
 if p_writer is null then raise exception 'Missing writer'; end if;
 update public.ferrovia_checkpoint set writer=p_writer where id=true returning * into strict r;
 return jsonb_build_object('schema_version',r.schema_version,'version',r.version,'rooms',r.rooms,'capabilities',jsonb_build_object('roomDelta',1));
end;
$$;
create or replace function public.ferrovia_save_checkpoint_delta(p_writer uuid,p_version bigint,p_commit uuid,p_changed jsonb,p_removed jsonb,p_saved_at bigint,p_archive jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ferrovia_checkpoint; merged jsonb;
begin
 select * into strict r from public.ferrovia_checkpoint where id=true for update;
 if r.writer is distinct from p_writer then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
 if r.last_commit=p_commit then return jsonb_build_object('version',r.version,'commit',r.last_commit); end if;
 if r.version<>p_version then raise exception 'FERROVIA_WRITER_CONFLICT'; end if;
 if p_changed is null or jsonb_typeof(p_changed)<>'array' or p_removed is null or jsonb_typeof(p_removed)<>'array' or p_saved_at is null or p_saved_at<0
    or exists(select 1 from jsonb_array_elements(p_changed) x where jsonb_typeof(x)<>'object' or coalesce(x->>'code','')='')
    or exists(select 1 from jsonb_array_elements(p_removed) x where jsonb_typeof(x)<>'string')
    or (select count(*) from jsonb_array_elements(p_changed))<>(select count(distinct x->>'code') from jsonb_array_elements(p_changed) x)
    or exists(select 1 from jsonb_array_elements(p_changed) x where p_removed ? (x->>'code')) then raise exception 'Invalid room delta'; end if;
 select coalesce(jsonb_agg(value||jsonb_build_object('savedAt',p_saved_at) order by value->>'code'),'[]'::jsonb) into merged from (
  select old.value from jsonb_array_elements(r.rooms) old where not p_removed ? (old.value->>'code') and not exists(select 1 from jsonb_array_elements(p_changed) c where c->>'code'=old.value->>'code')
  union all select value from jsonb_array_elements(p_changed)
 ) rooms;
 return public.ferrovia_save_checkpoint_v2(p_writer,p_version,p_commit,merged,p_archive);
end;
$$;
revoke all on function public.ferrovia_save_checkpoint_delta(uuid,bigint,uuid,jsonb,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.ferrovia_save_checkpoint_delta(uuid,bigint,uuid,jsonb,jsonb,bigint,jsonb) to service_role;
commit;
