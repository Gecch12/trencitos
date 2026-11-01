-- Read summaries first; transfer replay frames in bounded pages after authorization.
begin;
create or replace function public.trencitos_read_archive_summary(p_guest text,p_account uuid,p_match uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'matches',coalesce((select jsonb_agg(m.metadata order by (m.metadata->>'startedAt')::bigint desc)
 from public.trencitos_matches m where (p_match is not null and m.id=p_match) or (p_match is null and exists(
 select 1 from jsonb_array_elements(m.metadata->'players') p left join public.trencitos_guest_claims c on c.guest_id=p->>'guestId'
 where (p->>'bot')::boolean=false and ((p_account is not null and ((p->>'accountId')::uuid=p_account or c.account_id=p_account)) or (p_guest is not null and p->>'guestId'=p_guest and c.guest_id is null))
 ))),'[]'::jsonb),
 'claims',coalesce((select jsonb_object_agg(guest_id,account_id) from public.trencitos_guest_claims where guest_id=p_guest or account_id=p_account),'{}'::jsonb));
$$;
create or replace function public.trencitos_read_frames(p_match uuid,p_from integer,p_count integer)
returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(f.data order by f.seq),'[]'::jsonb)
 from (select seq,data from public.trencitos_match_frames
 where match_id=p_match and seq>=greatest(p_from,0)
 order by seq limit least(greatest(p_count,0),16)) f;
$$;
revoke all on function public.trencitos_read_archive_summary(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.trencitos_read_frames(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.trencitos_read_archive_summary(text,uuid,uuid) to service_role;
grant execute on function public.trencitos_read_frames(uuid,integer,integer) to service_role;
commit;
