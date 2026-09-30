-- The reason for not closing is the closer's (Dany, 30/09/2026): the setter
-- sees it on the calls he booked, so he knows why his leads did not close,
-- but never writes it. His RLS policies let him update his own calls (date,
-- closer, notes), and RLS works by row, not by column: a trigger guards the
-- one column. The admin and the closer write it; seeds and imports (no
-- session, no role) are untouched.
create or replace function public.calls_motivo_solo_closer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_role() is distinct from 'setter' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.obiezione_principale is not null)
     or (tg_op = 'UPDATE' and new.obiezione_principale is distinct from old.obiezione_principale) then
    raise exception 'Il motivo di non chiusura lo scrive il closer' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.calls_motivo_solo_closer() is
  'The setter reads the reason for not closing on his calls but never writes it.';

create trigger calls_motivo_solo_closer
  before insert or update on public.calls
  for each row execute function public.calls_motivo_solo_closer();
