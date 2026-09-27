-- Seed accounts are not first-timers: the tour would sit on top of every
-- e2e test and screenshot. e2e/tutorial.spec.ts clears the flag it needs.
update public.profiles set tutorial_visto = true;
