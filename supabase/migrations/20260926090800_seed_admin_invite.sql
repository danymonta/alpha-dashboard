-- First admin: without this invite nobody can sign in (the gate in
-- handle_new_user rejects every uninvited address).
insert into public.invites (email, ruolo)
values ('danielemontagnolo@gmail.com', 'admin')
on conflict (email) do update
  set ruolo = 'admin',
      revocato = false;
