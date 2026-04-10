-- ============================================================
-- AUTO-PROFILE TRIGGER
-- Run this in Supabase SQL Editor ONCE after your main schema.
-- It creates a user_profiles row automatically whenever a new
-- auth.users row is inserted, so the profile always exists even
-- if the JS insert races or fails.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, first_name, last_name, role, user_code)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce(new.raw_user_meta_data->>'user_code', 'USR' || upper(substring(gen_random_uuid()::text, 1, 6)))
  )
  on conflict (user_id) do nothing;  -- safe to call multiple times
  return new;
end;
$$;

-- Drop existing trigger if any, then recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
