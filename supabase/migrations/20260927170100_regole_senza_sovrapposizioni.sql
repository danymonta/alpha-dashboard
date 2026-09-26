-- Rules can now be edited after the fact. Whatever the edit, a person never has
-- two rules in force on the same day: the commission would be counted twice.
create or replace function public.guard_commission_rules_sovrapposte()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.valida_al is not null and new.valida_al < new.valida_dal then
    raise exception 'La regola finisce prima di cominciare' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.commission_rules r
    where r.profile_id = new.profile_id
      and r.id <> new.id
      and daterange(r.valida_dal, r.valida_al, '[]') && daterange(new.valida_dal, new.valida_al, '[]')
  ) then
    raise exception 'Le date si sovrappongono a un''altra regola della stessa persona: accorcia prima quella'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger commission_rules_senza_sovrapposizioni
  before insert or update of profile_id, valida_dal, valida_al on public.commission_rules
  for each row execute function public.guard_commission_rules_sovrapposte();
