-- A deactivated member must still read their own profile row. Without it the
-- app cannot tell "deactivated" from "no session" (current_role() is null for
-- them) and bounces between / and /login instead of showing "Account
-- disattivato". Their own row only: current_role() stays null, so every other
-- policy keeps denying them everything else.
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));
