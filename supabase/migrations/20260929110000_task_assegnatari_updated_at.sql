-- pm_task_assegnatari follows the convention of every table (CLAUDE.md section 8):
-- updated_at with the set_updated_at trigger. The pairs are added and removed,
-- rarely changed (merging two profiles moves them): the column says when.

alter table public.pm_task_assegnatari
  add column updated_at timestamptz not null default now();

-- the rows already there: last touched when they were made
update public.pm_task_assegnatari set updated_at = created_at;

create trigger pm_task_assegnatari_set_updated_at before update on public.pm_task_assegnatari
  for each row execute function public.set_updated_at();
