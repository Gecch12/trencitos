-- State database, after 005_checkpoint_delta.sql. Atomic result projection;
-- no replay frames are read or rewritten. Re-running the backfill is safe.
begin;
-- Server-only metadata reader also resolves claimed guests in the selected
-- matches, so personal groups work when friends signed up after playing.
create or replace function public.trencitos_read_archive_summary(p_guest text,p_account uuid,p_match uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 with selected as (
  select m.metadata from public.trencitos_matches m
  where (p_match is not null and m.id=p_match) or (p_match is null and exists(
   select 1 from jsonb_array_elements(m.metadata->'players') p
   left join public.trencitos_guest_claims c on c.guest_id=p->>'guestId'
   where (p->>'bot')::boolean=false and
    ((p_account is not null and ((p->>'accountId')::uuid=p_account or c.account_id=p_account))
     or (p_guest is not null and p->>'guestId'=p_guest and c.guest_id is null))
  ))
 )
 select jsonb_build_object(
  'matches',coalesce((select jsonb_agg(metadata order by (metadata->>'startedAt')::bigint desc) from selected),'[]'::jsonb),
  'claims',coalesce((select jsonb_object_agg(c.guest_id,c.account_id) from public.trencitos_guest_claims c
   where c.guest_id=p_guest or c.account_id=p_account or exists(
    select 1 from selected s cross join lateral jsonb_array_elements(s.metadata->'players') p where p->>'guestId'=c.guest_id
   )),'{}'::jsonb))
$$;
revoke all on function public.trencitos_read_archive_summary(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.trencitos_read_archive_summary(text,uuid,uuid) to service_role;
create table if not exists public.trencitos_player_results (
 match_id uuid not null references public.trencitos_matches(id) on delete cascade,
 seat integer not null, account_id uuid, guest_id text, bot boolean not null,
 map_id text not null, rules_version text not null, player_count integer not null,
 mode text not null, ended_at bigint, status text not null, score numeric,
 eligible boolean not null, penalized boolean not null, abandoned boolean not null,
 primary key(match_id,seat)
);
create index if not exists trencitos_results_account on public.trencitos_player_results(account_id,ended_at desc);
create index if not exists trencitos_results_cohort on public.trencitos_player_results(map_id,rules_version,player_count,mode,ended_at);
alter table public.trencitos_player_results enable row level security;
revoke all on public.trencitos_player_results from public,anon,authenticated;
grant select,insert,update,delete on public.trencitos_player_results to service_role;
create or replace function public.trencitos_project_results() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb:=new.metadata; p jsonb; s jsonb; n integer:=0; humans integer; mode_name text;
begin
 select count(*) into humans from jsonb_array_elements(m->'players') entry where not coalesce((entry->>'bot')::boolean,false);
 mode_name:=case when m->>'mode'='Práctica' or humans<2 then 'practice' when humans<jsonb_array_length(m->'players') then 'mixed' else 'humans' end;
 for p in select value from jsonb_array_elements(m->'players') loop
  select value into s from jsonb_array_elements(m->'scores') where (value->>'seat')::integer=n;
  insert into public.trencitos_player_results values(new.id,n,nullif(p->>'accountId','')::uuid,p->>'guestId',coalesce((p->>'bot')::boolean,false),coalesce(m->'mapRef'->>'id','unknown'),coalesce(m->>'rulesVersion','unknown'),jsonb_array_length(m->'players'),mode_name,coalesce((m->>'closedAt')::bigint,(m->>'updatedAt')::bigint),m->>'status',
   case when m->>'status'='completed' and not coalesce((s->>'partial')::boolean,false) and p->'participation'->>'penalizedAt' is null and not coalesce((p->'participation'->>'definitive')::boolean,false) then (s->>'score')::numeric else null end,
   coalesce((m->'commitment'->>'eligible')::boolean,false),p->'participation'->>'penalizedAt' is not null,coalesce((p->'participation'->>'definitive')::boolean,false) or p->'participation'->>'penalizedAt' is not null)
  on conflict(match_id,seat) do update set account_id=excluded.account_id,guest_id=excluded.guest_id,ended_at=excluded.ended_at,status=excluded.status,score=excluded.score,eligible=excluded.eligible,penalized=excluded.penalized,abandoned=excluded.abandoned;
  n:=n+1;
 end loop;
 return new;
end $$;
drop trigger if exists trencitos_project_results on public.trencitos_matches;
create trigger trencitos_project_results after insert or update of metadata on public.trencitos_matches for each row execute function public.trencitos_project_results();
-- Fire only the derived projection; immutable historical frames/digests stay intact.
update public.trencitos_matches set metadata=metadata;

create table if not exists public.trencitos_global_snapshots (
 day date not null, cohort text not null, filters jsonb not null, metrics jsonb not null, updated_at timestamptz not null default now(),primary key(day,cohort)
);
alter table public.trencitos_global_snapshots enable row level security;
revoke all on public.trencitos_global_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.trencitos_global_snapshots to service_role;
create or replace function public.trencitos_refresh_statistics() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.trencitos_global_snapshots where day=current_date;
 -- GROUPING SETS are expressed through optional dimensions. They aggregate
 -- results, never combinations of friends. Histograms preserve exact values.
 insert into public.trencitos_global_snapshots(day,cohort,filters,metrics,updated_at)
 with source as (
  select r.*,coalesce(r.account_id,c.account_id) player from public.trencitos_player_results r left join public.trencitos_guest_claims c on c.guest_id=r.guest_id
  where r.status='completed' and r.score is not null and not r.bot and r.map_id not in ('laboratory','unknown') and coalesce(r.account_id,c.account_id) is not null
 ), expanded as (
  select jsonb_build_object('map',a.v,'rules',b.v,'players',d.v,'mode',e.v,'period',period.v) f,s.score,s.player from source s
  cross join lateral (select s.map_id v union all select null) a
  cross join lateral (select s.rules_version v union all select null) b
  cross join lateral (select s.player_count v union all select null) d
  cross join lateral (select s.mode v union all select 'all') e
  cross join (values('all'),('30'),('90')) period(v)
  where period.v='all' or s.ended_at>=extract(epoch from now()-make_interval(days=>case when period.v='all' then 0 else period.v::integer end))*1000
 ), overall as (
  select f,count(*) sample,count(distinct player) players,avg(score) average,percentile_cont(0.5) within group(order by score) median,max(score) best from expanded group by f
 ), score_hist as (
  select f,jsonb_object_agg(score,n) hist from (select f,score,count(*) n from expanded group by f,score) a group by f
 ), player_means as (
  select f,player,avg(score) average from expanded group by f,player having count(*)>=5
 ), player_hist as (
  select f,sum(n) qualified,jsonb_object_agg(average,n) hist from (select f,average,count(*) n from player_means group by f,average) a group by f
 )
 select current_date,o.f::text,o.f,jsonb_build_object('sample',o.sample,'players',o.players,'qualifiedPlayers',coalesce(p.qualified,0),'average',o.average,'median',o.median,'best',o.best,'scoreDistribution',s.hist,'playerDistribution',coalesce(p.hist,'{}'::jsonb),'updatedAt',floor(extract(epoch from now())*1000)),now() from overall o join score_hist s using(f) left join player_hist p using(f)
 on conflict(day,cohort) do update set metrics=excluded.metrics,updated_at=excluded.updated_at;
 delete from public.trencitos_global_snapshots where day<current_date-90;
end $$;
create or replace function public.trencitos_statistics_snapshot(p_filters jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select metrics from public.trencitos_global_snapshots where cohort=p_filters::text and day=(select max(day) from public.trencitos_global_snapshots) limit 1
$$;
revoke all on function public.trencitos_project_results(),public.trencitos_refresh_statistics(),public.trencitos_statistics_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.trencitos_refresh_statistics(),public.trencitos_statistics_snapshot(jsonb) to service_role;
select public.trencitos_refresh_statistics();
commit;
