-- Everyone edits their own name and photo, nothing else; photos only in their own folder.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(9);

update auth.users set raw_user_meta_data = raw_user_meta_data || '{"avatar_url":"https://lh3.googleusercontent.com/a/setter"}'::jsonb
where id = '22222222-2222-4222-8222-222222222222';

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(public.mia_foto_google(), 'https://lh3.googleusercontent.com/a/setter', 'ognuno legge la propria foto Google');

select lives_ok(
  $$ select public.aggiorna_mio_profilo('Loris DM', 'https://lh3.googleusercontent.com/a/setter') $$,
  'il setter mette la sua foto Google e cambia nome'
);
select lives_ok(
  $$ select public.aggiorna_mio_profilo('Loris DM',
       'http://127.0.0.1:54321/storage/v1/object/public/avatari/22222222-2222-4222-8222-222222222222/nuova.webp') $$,
  'o una foto nella sua cartella'
);
select is(
  (select row(nome, foto_url like '%/avatari/22222222-2222-4222-8222-222222222222/nuova.webp')::text
   from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  '("Loris DM",t)',
  'nome e foto salvati'
);
select throws_ok(
  $$ select public.aggiorna_mio_profilo('Loris DM',
       'http://127.0.0.1:54321/storage/v1/object/public/avatari/11111111-1111-4111-8111-111111111111/altrui.webp') $$,
  '22023', 'Foto non valida',
  'non la foto nella cartella di un altro'
);
select throws_ok(
  $$ select public.aggiorna_mio_profilo('Loris DM', 'https://tracker.example.com/pixel.gif') $$,
  '22023', 'Foto non valida',
  'né un indirizzo qualsiasi'
);
-- no update policy for non-admins: the statement touches no row
update public.profiles set ruolo = 'admin' where id = '22222222-2222-4222-8222-222222222222';
select is(
  (select ruolo::text from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'setter',
  'il ruolo resta fuori portata'
);

-- storage: writing in someone else's folder is refused by RLS
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatari', '11111111-1111-4111-8111-111111111111/intrusa.webp', '22222222-2222-4222-8222-222222222222') $$,
  '42501', null,
  'non si carica nella cartella di un altro'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('avatari', '22222222-2222-4222-8222-222222222222/mia.webp', '22222222-2222-4222-8222-222222222222') $$,
  'nella propria sì'
);

select * from finish();
rollback;
