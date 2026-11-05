-- Auth database, after 002_identity.sql. No state-writer secret is used by these RPCs.
begin;
alter table public.game_profiles add column if not exists username text;
alter table public.game_profiles add column if not exists display_name text;
alter table public.game_profiles add column if not exists secondary_color text;
alter table public.game_profiles add column if not exists username_changed_at timestamptz;
-- Preserve legacy nickname verbatim for compatibility; the new public field is
-- populated only if it fits. Owners explicitly choose a unique handle.
update public.game_profiles set display_name=nickname where display_name is null and length(nickname)<=20;
alter table public.game_profiles drop constraint if exists game_profiles_avatar_check;
alter table public.game_profiles add constraint game_profiles_avatar_check check (avatar in ('person','capybara'));
create unique index if not exists game_profiles_username_unique on public.game_profiles(username) where username is not null;
create table if not exists public.game_username_reservations (
 username text primary key, profile_id uuid not null references public.game_profiles(id) on delete cascade, until_at timestamptz not null
);
alter table public.game_username_reservations enable row level security;
revoke all on public.game_username_reservations from public,anon,authenticated;

create or replace function public.game_profile_v2() returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.game_profiles;
begin
 perform public.game_profile();
 select * into p from public.game_profiles where auth_user_id=auth.uid();
 return jsonb_build_object('id',p.id,'nickname',p.nickname,'display_name',coalesce(p.display_name,''),'username',p.username,'color',p.color,'secondary_color',p.secondary_color,'avatar',p.avatar,'initialized',p.initialized,'username_changed_at',p.username_changed_at);
end $$;
create or replace function public.game_update_profile_v2(p_username text,p_display_name text,p_color text,p_secondary_color text,p_avatar text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.game_profiles; handle text:=lower(trim(p_username)); locked_name text;
 palette constant text[]:=array['#d45748','#458ad4','#4b9d76','#ddaf40','#9a75ba','#88583d','#b88929','#242831','#7c8796','#c43d92','#1baaa6','#253b73','#782f49','#78833c','#e4dcc2','#ed897c','#b9ace2','#9ed7ed','#71bba0','#6269c7'];
begin
 perform public.game_profile();
 select * into p from public.game_profiles where auth_user_id=auth.uid() for update;
 if handle is not null and (handle !~ '^[a-z][a-z0-9_]{2,19}$' or handle ~ '^(guest_|bot_|trencitos_)' or handle=any(array['admin','administrator','administrador','support','soporte','moderator','moderador','trencitos','system','sistema','bot','guest','invitado','deleted','null','undefined'])) then raise sqlstate '22023' using message='USERNAME_INVALID'; end if;
 if p_display_name is null or length(trim(p_display_name))>20 or p_display_name ~ '[<>"''&[:cntrl:]]' or p_display_name ~ U&'[\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\2028-\202E\2060-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]' then raise sqlstate '22023' using message='DISPLAY_NAME_INVALID'; end if;
 if p_color is null or not p_color=any(palette) or (p_secondary_color is not null and (not p_secondary_color=any(palette) or p_secondary_color=p_color)) or p_avatar is null or p_avatar not in ('person','capybara') then raise sqlstate '22023' using message='PREFERENCES_INVALID'; end if;
 if handle is distinct from p.username then
  if handle is null then raise sqlstate '22023' using message='USERNAME_REQUIRED'; end if;
  if p.username_changed_at is not null and p.username_changed_at>now()-interval '30 days' then raise sqlstate '22023' using message='USERNAME_COOLDOWN'; end if;
  -- Serialize claims of the same handle, including its reservation check.
  for locked_name in select distinct n from unnest(array[handle,p.username]) n where n is not null order by n loop
   perform pg_advisory_xact_lock(hashtextextended(locked_name,0));
  end loop;
  if exists(select 1 from public.game_username_reservations r where r.username=handle and r.until_at>now() and r.profile_id<>p.id) then raise unique_violation using message='USERNAME_TAKEN'; end if;
  if p.username is not null then insert into public.game_username_reservations values(p.username,p.id,now()+interval '30 days') on conflict(username) do update set profile_id=excluded.profile_id,until_at=excluded.until_at; end if;
 end if;
 update public.game_profiles set username=handle,display_name=trim(p_display_name),nickname=coalesce(nullif(trim(p_display_name),''),handle,'Jugador'),color=p_color,secondary_color=p_secondary_color,avatar=p_avatar,initialized=true,username_changed_at=case when handle is distinct from p.username then now() else p.username_changed_at end where id=p.id;
 return public.game_profile_v2();
end $$;

create table if not exists public.game_friendships (
 low_id uuid not null references public.game_profiles(id) on delete cascade,
 high_id uuid not null references public.game_profiles(id) on delete cascade,
 requester uuid not null references public.game_profiles(id) on delete cascade,
 status text not null check(status in ('pending','accepted','removed')),
 updated_at timestamptz not null default now(), primary key(low_id,high_id), check(low_id<high_id),check(requester in(low_id,high_id))
);
create table if not exists public.game_blocks (
 owner_id uuid not null references public.game_profiles(id) on delete cascade,
 target_id uuid not null references public.game_profiles(id) on delete cascade,
 primary key(owner_id,target_id),check(owner_id<>target_id)
);
create table if not exists public.game_social_requests (
 owner_id uuid not null references public.game_profiles(id) on delete cascade, at timestamptz not null default now()
);
create index if not exists game_social_requests_owner_time on public.game_social_requests(owner_id,at);
create table if not exists public.game_friend_groups (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.game_profiles(id) on delete cascade,
 name text not null check(length(name) between 1 and 40), members uuid[] not null, created_at timestamptz not null default now()
);
alter table public.game_friendships enable row level security;
alter table public.game_blocks enable row level security;
alter table public.game_social_requests enable row level security;
alter table public.game_friend_groups enable row level security;
revoke all on public.game_friendships,public.game_blocks,public.game_social_requests,public.game_friend_groups from public,anon,authenticated;
create or replace function public.game_public_profile(p public.game_profiles) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p.id,'username',p.username,'displayName',coalesce(p.display_name,''),'avatar',p.avatar,'color',p.color)
$$;
revoke all on function public.game_public_profile(public.game_profiles) from public,anon,authenticated;
create or replace function public.game_social(p_action text default 'list',p_target uuid default null,p_username text default null,p_name text default null,p_members uuid[] default null,p_group uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare own uuid; lo uuid; hi uuid; f public.game_friendships; target public.game_profiles; roster uuid[]; output jsonb;
begin
 own:=(public.game_profile_v2()->>'id')::uuid;
 -- Advisory owner locks protect limits without blocking foreign-key checks
 -- on the other profile during simultaneous reciprocal requests.
 perform pg_advisory_xact_lock(hashtextextended(own::text,2));
 if p_action in ('find','profile') then
  select * into target from public.game_profiles where (p_action='profile' and id=p_target) or (p_action='find' and (username=lower(trim(p_username)) or exists(select 1 from public.game_username_reservations r where r.profile_id=game_profiles.id and r.username=lower(trim(p_username)) and r.until_at>now())));
  if target.id is null or exists(select 1 from public.game_blocks where (owner_id=own and target_id=target.id) or (owner_id=target.id and target_id=own)) then raise sqlstate 'P0002' using message='PLAYER_NOT_FOUND'; end if;
  select * into f from public.game_friendships where low_id=least(own,target.id) and high_id=greatest(own,target.id);
  return public.game_public_profile(target)||jsonb_build_object('relationship',case when target.id=own then 'self' when f.status='accepted' then 'accepted' when f.status='pending' and f.requester=own then 'sent' when f.status='pending' then 'received' else 'none' end);
 end if;
 if p_action in ('request','accept','reject','cancel','remove','block','unblock') then
  if p_target is null or p_target=own then raise sqlstate '22023' using message='INVALID_TARGET'; end if;
  select * into target from public.game_profiles where id=p_target;
  if target.id is null or target.username is null then raise sqlstate 'P0002' using message='PLAYER_NOT_FOUND'; end if;
  lo:=least(own,p_target);hi:=greatest(own,p_target);
  perform pg_advisory_xact_lock(hashtextextended(lo::text||hi::text,1));
  select * into f from public.game_friendships where low_id=lo and high_id=hi;
  if p_action='block' then
   insert into public.game_blocks values(own,p_target) on conflict do nothing;
   update public.game_friendships set status='removed',updated_at=now() where low_id=lo and high_id=hi;
  elsif p_action='unblock' then delete from public.game_blocks where owner_id=own and target_id=p_target;
  else
   if exists(select 1 from public.game_blocks where (owner_id=own and target_id=p_target) or (owner_id=p_target and target_id=own)) then raise sqlstate '22023' using message='PLAYER_UNAVAILABLE'; end if;
   if p_action='request' then
    if (select username is null from public.game_profiles where id=own) then raise sqlstate '22023' using message='USERNAME_REQUIRED'; end if;
    if f.status in ('pending','accepted') then return jsonb_build_object('ok',true); end if;
    if f.updated_at>now()-interval '24 hours' then raise sqlstate '22023' using message='REQUEST_COOLDOWN'; end if;
    delete from public.game_social_requests where at<now()-interval '1 day';
    if (select count(*) from public.game_social_requests where owner_id=own and at>now()-interval '1 hour')>=20 then raise sqlstate '22023' using message='REQUEST_LIMIT'; end if;
    insert into public.game_social_requests(owner_id) values(own);
    insert into public.game_friendships values(lo,hi,own,'pending',now()) on conflict(low_id,high_id) do update set requester=own,status='pending',updated_at=now();
   elsif p_action='accept' then
    if f.status='accepted' then return jsonb_build_object('ok',true); end if;
    if f.status is distinct from 'pending' or f.requester=own then raise sqlstate '22023' using message='REQUEST_NOT_RECEIVED'; end if;
    update public.game_friendships set status='accepted',updated_at=now() where low_id=lo and high_id=hi;
   else
    if p_action='reject' and (f.status is distinct from 'pending' or f.requester=own) or p_action='cancel' and (f.status is distinct from 'pending' or f.requester<>own) or p_action='remove' and f.status is distinct from 'accepted' then raise sqlstate '22023' using message='INVALID_RELATIONSHIP'; end if;
    update public.game_friendships set status='removed',updated_at=now() where low_id=lo and high_id=hi;
   end if;
  end if;
 elsif p_action='create_group' then
  if p_name is null or length(trim(p_name)) not between 1 and 40 or p_name ~ '[<>"''&[:cntrl:]]' then raise sqlstate '22023' using message='GROUP_NAME_INVALID'; end if;
  select array_agg(distinct x order by x) into roster from unnest(array_append(p_members,own)) x;
  if array_position(roster,null) is not null or cardinality(roster) not between 2 and 5 or exists(select 1 from unnest(roster) x where x<>own and not exists(select 1 from public.game_friendships where low_id=least(own,x) and high_id=greatest(own,x) and status='accepted')) then raise sqlstate '22023' using message='GROUP_FRIENDS_REQUIRED'; end if;
  if (select count(*) from public.game_friend_groups where owner_id=own)>=20 then raise sqlstate '22023' using message='GROUP_LIMIT'; end if;
  insert into public.game_friend_groups(owner_id,name,members) values(own,trim(p_name),roster);
 elsif p_action='delete_group' then delete from public.game_friend_groups where id=p_group and owner_id=own;
 elsif p_action<>'list' then raise sqlstate '22023' using message='INVALID_ACTION';
 end if;
 select jsonb_build_object(
  'players',coalesce((select jsonb_agg(public.game_public_profile(p)||jsonb_build_object('relationship',case when rel.status='accepted' then 'accepted' when rel.requester=own then 'sent' else 'received' end)) from public.game_friendships rel join public.game_profiles p on p.id=case when rel.low_id=own then rel.high_id else rel.low_id end where own in(rel.low_id,rel.high_id) and rel.status in('pending','accepted') and not exists(select 1 from public.game_blocks b where (b.owner_id=own and b.target_id=p.id) or (b.owner_id=p.id and b.target_id=own))),'[]'::jsonb),
  'blocked',coalesce((select jsonb_agg(public.game_public_profile(p)) from public.game_blocks b join public.game_profiles p on p.id=b.target_id where b.owner_id=own),'[]'::jsonb),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'members',g.members)) from public.game_friend_groups g where g.owner_id=own),'[]'::jsonb)
 ) into output;
 return output;
end $$;
revoke all on function public.game_profile_v2(),public.game_update_profile_v2(text,text,text,text,text),public.game_social(text,uuid,text,text,uuid[],uuid) from public,anon;
grant execute on function public.game_profile_v2(),public.game_update_profile_v2(text,text,text,text,text),public.game_social(text,uuid,text,text,uuid[],uuid) to authenticated;
commit;
