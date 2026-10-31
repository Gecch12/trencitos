-- Separate from active_games and its writer lease. Run once in the Auth project.
begin;
create table if not exists public.game_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nickname text not null default 'Jugador' check (length(trim(nickname)) between 1 and 24),
  color text not null default '#d45748' check (color ~ '^#[a-f0-9]{6}$'),
  avatar text not null default 'person' check (avatar = 'person'),
  initialized boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.game_profiles enable row level security;
revoke all on public.game_profiles from anon, authenticated;

-- No email/photo/name metadata is copied. One account UUID survives provider linking.
-- Check revocation in addition to JWT validity: access tokens otherwise live to expiry.
create or replace function public.game_profile()
returns table(id uuid, nickname text, color text, avatar text, initialized boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from auth.sessions s where s.user_id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after > now())
  ) then raise sqlstate '42501' using message = 'Session expired'; end if;
  insert into public.game_profiles(auth_user_id) values(auth.uid()) on conflict(auth_user_id) do nothing;
  return query select p.id,p.nickname,p.color,p.avatar,p.initialized from public.game_profiles p where p.auth_user_id = auth.uid();
end $$;

create or replace function public.game_update_profile(p_nickname text, p_color text)
returns table(id uuid, nickname text, color text, avatar text, initialized boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.game_profile(); -- verified, live session and own profile only
  if length(trim(p_nickname)) not between 1 and 24 or p_nickname ~ '[<>"''&[:cntrl:]]'
     or p_color !~ '^#[a-f0-9]{6}$' or p_nickname is null or p_color is null then
    raise sqlstate '22023' using message = 'Invalid profile';
  end if;
  update public.game_profiles p set nickname=trim(p_nickname),color=p_color,initialized=true where p.auth_user_id=auth.uid();
  return query select p.id,p.nickname,p.color,p.avatar,p.initialized from public.game_profiles p where p.auth_user_id=auth.uid();
end $$;
revoke all on function public.game_profile() from public, anon;
revoke all on function public.game_update_profile(text,text) from public, anon;
grant execute on function public.game_profile() to authenticated;
grant execute on function public.game_update_profile(text,text) to authenticated;
commit;
