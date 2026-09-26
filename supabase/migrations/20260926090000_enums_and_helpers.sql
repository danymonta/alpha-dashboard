-- Enums and shared helpers.
-- Business dates are always evaluated in Europe/Rome (see public.oggi()).

-- Roles: the whole app shell, not only Economics (time tracking will reuse them).
create type public.app_role as enum (
  'admin', 'setter', 'closer', 'coach', 'editor', 'nutrizione', 'dev'
);

create type public.lead_source as enum (
  'dm_inbound', 'dm_outbound', 'referral', 'organico', 'ads', 'altro'
);

create type public.lead_status as enum ('call_fissata', 'cliente', 'perso');

create type public.call_type as enum ('discovery', 'strategy');

create type public.call_status as enum (
  'programmata', 'svolta', 'no_show', 'cancellata', 'riprogrammata'
);

create type public.call_outcome as enum ('chiusa', 'follow_up', 'persa');

create type public.sale_type as enum ('nuovo', 'rinnovo', 'upsell');

create type public.payment_method as enum (
  'bonifico', 'stripe', 'paypal', 'carta', 'contanti', 'altro'
);

create type public.payment_status as enum (
  'prevista', 'incassata', 'fallita', 'rimborsata'
);

create type public.expense_category as enum (
  'team', 'software', 'ads', 'formazione', 'altro'
);

create type public.audit_action as enum ('insert', 'update', 'delete');

-- Business "today". Never use current_date directly: the server runs in UTC.
create or replace function public.oggi()
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone 'Europe/Rome')::date);
$$;

comment on function public.oggi() is
  'Business today in Europe/Rome. Use instead of current_date.';

-- updated_at maintenance, attached to every table below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
