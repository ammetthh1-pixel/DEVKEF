-- ═══════════════════════════════════════════════════════════
-- DEVKËF — Schéma Supabase
-- À coller intégralement dans : Supabase Dashboard > SQL Editor > New query > Run
-- ═══════════════════════════════════════════════════════════

-- ── Table des profils (1 ligne par joueur, visible pour le classement) ──
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  xp integer not null default 0,
  streak integer not null default 1,
  last_active_day date,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Les profils sont visibles par tous (classement)"
  on public.profiles for select
  using (true);

create policy "Un joueur crée seulement son propre profil"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Un joueur modifie seulement son propre profil"
  on public.profiles for update
  using (auth.uid() = id);

-- ── Table de la progression détaillée (1 ligne par niveau complété) ──
create table if not exists public.level_progress (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  track text not null check (track in ('web','python','c')),
  level_id integer not null,
  xp_earned integer not null,
  completed_at timestamptz not null default now(),
  unique (user_id, track, level_id)
);

alter table public.level_progress enable row level security;

create policy "Un joueur voit seulement sa propre progression"
  on public.level_progress for select
  using (auth.uid() = user_id);

create policy "Un joueur ajoute seulement sa propre progression"
  on public.level_progress for insert
  with check (auth.uid() = user_id);

create policy "Un joueur modifie seulement sa propre progression"
  on public.level_progress for update
  using (auth.uid() = user_id);

-- ── Création automatique du profil à l'inscription ──
-- Fonctionne pour email/mot de passe ET Google/GitHub (OAuth).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, xp, streak)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1),
      'Joueur'
    ),
    0, 1
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Index pour un classement rapide ──
create index if not exists profiles_xp_idx on public.profiles (xp desc);
