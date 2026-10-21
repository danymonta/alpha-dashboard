-- The content calendar (1.32.0, Dany 08/10/2026): Notion's "Instagram Posts"
-- in marketing_contenuti. Admin, video editor and marketing read and write it;
-- admin and marketing delete (the editor sets "Canceled"); nobody else sees a
-- row. Who created a row and its Notion page are written only by the admin.
-- instagram_shortcode comes from URL with the same rule as
-- lib/marketing/shortcode.ts, and a section is saved only over the text the
-- person read (salva_sezione_contenuto).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(67);

-- helper: rows touched by an update or a delete, under the current role
create or replace function pg_temp.righe(p_sql text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- People: nutrizione, dev and a deactivated marketing account, invited as usual
insert into public.invites (email, ruolo) values
  ('nutrizione67@alpha.test', 'nutrizione'),
  ('dev67@alpha.test', 'dev'),
  ('marketing67@alpha.test', 'marketing');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990167',
   'authenticated', 'authenticated', 'nutrizione67@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Nora Sessantasette"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990267',
   'authenticated', 'authenticated', 'dev67@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Davide Sessantasette"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990367',
   'authenticated', 'authenticated', 'marketing67@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Monica Sessantasette"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990367';

-- Rows written as postgres (no session): the trigger leaves them as they are
insert into public.marketing_contenuti (id, tipo, nome, stato, finale, created_by, created_at, updated_at, notion_page_id) values
  ('67670000-0000-4000-8000-000000000001', 'reel', 'Contenuto 67 base', 'not_started', null,
   '11111111-1111-4111-8111-111111111111', '2026-01-01', '2026-01-01', null),
  ('67670000-0000-4000-8000-000000000002', 'reel', 'Contenuto 67 da eliminare', 'not_started', null,
   '11111111-1111-4111-8111-111111111111', '2026-01-01', '2026-01-01', null),
  ('67670000-0000-4000-8000-000000000003', 'carousel', 'Contenuto 67 dell''admin da eliminare', 'not_started', null,
   '11111111-1111-4111-8111-111111111111', '2026-01-01', '2026-01-01', null),
  ('67670000-0000-4000-8000-000000000004', 'reel', 'Contenuto 67 importato', 'posted', null,
   '11111111-1111-4111-8111-111111111111', '2026-01-02', '2026-01-02', '67670000-0000-4000-8000-0000000000f4'),
  ('67670000-0000-4000-8000-000000000005', 'reel', 'Contenuto 67 sezioni', 'to_be_recorded', 'Testo iniziale',
   '11111111-1111-4111-8111-111111111111', '2026-01-01', '2026-01-01', null),
  ('67670000-0000-4000-8000-000000000006', 'reel', 'Contenuto 67 testo uguale', 'to_be_recorded', 'Uguale',
   '11111111-1111-4111-8111-111111111111', '2026-01-01', '2026-01-01', null);

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select enum_has_labels('public', 'contenuto_tipo', array['reel', 'carousel'],
  'i due modelli di Notion: Reel Topic e Carousel Topic');
-- Reel Type and Format are options in marketing_opzioni since 20261024090000 (test 95)
select is(
  (select array_agg(valore order by ordine) from public.marketing_opzioni where campo = 'reel_type'
     and valore in ('attraction', 'education', 'converting', 'radio', 'workshop')),
  array['attraction', 'education', 'converting', 'radio', 'workshop'],
  'Reel Type con le opzioni di Notion');
select is(
  (select array_agg(valore order by ordine) from public.marketing_opzioni where campo = 'formato'
     and valore in ('text_opinion', 'check_caption', 'split', 'reaction', 'b_roll',
        'green_screen', 'raw_talking_head', 'storytelling', 'transformation', 'show_and_tell')),
  array['text_opinion', 'check_caption', 'split', 'reaction', 'b_roll',
        'green_screen', 'raw_talking_head', 'storytelling', 'transformation', 'show_and_tell'],
  'Format con le opzioni di Notion');
select enum_has_labels('public', 'contenuto_status',
  array['not_started', 'to_be_recorded', 'to_be_edited', 'to_be_posted', 'posted', 'canceled'],
  'Status nell''ordine del lavoro');
select has_table('public', 'marketing_contenuti', 'la tabella del calendario c''è');
select col_is_unique('public', 'marketing_contenuti', 'notion_page_id',
  'una pagina di Notion si importa una volta sola');
select policies_are('public', 'marketing_contenuti',
  array['marketing_contenuti_lettura', 'marketing_contenuti_inserimento',
        'marketing_contenuti_modifica', 'marketing_contenuti_eliminazione'],
  'quattro policy, nessun''altra');
select has_function('public', 'salva_sezione_contenuto', array['uuid', 'text', 'text', 'text'],
  'salva_sezione_contenuto c''è');
select table_privs_are('public', 'marketing_contenuti', 'anon', array[]::text[],
  'anon non ha nessun permesso sulla tabella');
select function_privs_are('public', 'vede_marketing', array[]::name[], 'anon', array[]::text[],
  'anon non esegue vede_marketing');
select function_privs_are('public', 'salva_sezione_contenuto', array['uuid', 'text', 'text', 'text']::name[],
  'anon', array[]::text[], 'anon non esegue salva_sezione_contenuto');

-- ---------------------------------------------------------------------------
-- 2. Access by role: admin, video editor and marketing read, create, change
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ insert into public.marketing_contenuti (nome) values ('Contenuto 67 dell''admin') $$,
  'l''admin crea un contenuto');
select is((select count(*)::integer from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000001'), 1,
  'l''admin lo legge');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'Audio admin' where id = '67670000-0000-4000-8000-000000000001' $$), 1,
  'l''admin lo modifica');

set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select lives_ok($$ insert into public.marketing_contenuti (nome, tipo) values ('Contenuto 67 del video editor', 'carousel') $$,
  'il video editor crea un contenuto');
select is((select count(*)::integer from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000001'), 1,
  'il video editor lo legge');
select is(pg_temp.righe($$ update public.marketing_contenuti set stato = 'to_be_edited' where id = '67670000-0000-4000-8000-000000000001' $$), 1,
  'il video editor lo modifica');

set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select lives_ok($$ insert into public.marketing_contenuti (nome, post_date) values ('Contenuto 67 del marketing', '2026-10-20') $$,
  'il marketing crea un contenuto');
select is((select count(*)::integer from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000001'), 1,
  'il marketing lo legge');
select is(pg_temp.righe($$ update public.marketing_contenuti set view_count = 100 where id = '67670000-0000-4000-8000-000000000001' $$), 1,
  'il marketing lo modifica');

-- Everybody else: nothing, not even a row
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_contenuti), 0, 'il setter non legge nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Del setter') $$, '42501', null,
  'il setter non crea');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'x' where id = '67670000-0000-4000-8000-000000000001' $$), 0,
  'il setter non modifica');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_contenuti), 0, 'il closer non legge nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Del closer') $$, '42501', null,
  'il closer non crea');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'x' where id = '67670000-0000-4000-8000-000000000001' $$), 0,
  'il closer non modifica');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_contenuti), 0, 'il coach non legge nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Del coach') $$, '42501', null,
  'il coach non crea');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'x' where id = '67670000-0000-4000-8000-000000000001' $$), 0,
  'il coach non modifica');

set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990167","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_contenuti), 0, 'la nutrizione non legge nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Della nutrizione') $$, '42501', null,
  'la nutrizione non crea');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'x' where id = '67670000-0000-4000-8000-000000000001' $$), 0,
  'la nutrizione non modifica');

set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990267","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_contenuti), 0, 'lo sviluppo non legge nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Dello sviluppo') $$, '42501', null,
  'lo sviluppo non crea');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'x' where id = '67670000-0000-4000-8000-000000000001' $$), 0,
  'lo sviluppo non modifica');

set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990367","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_contenuti), 0, 'un marketing disattivato non legge nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Del disattivato') $$, '42501', null,
  'non crea');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'x' where id = '67670000-0000-4000-8000-000000000001' $$), 0,
  'non modifica');

-- ---------------------------------------------------------------------------
-- 3. Delete: admin and marketing; the video editor sets "Canceled"
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is(pg_temp.righe($$ delete from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000002' $$), 0,
  'il video editor non elimina');
select is((select count(*)::integer from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000002'), 1,
  'e il contenuto resta');

set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.righe($$ delete from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000002' $$), 1,
  'il marketing elimina');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.righe($$ delete from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000003' $$), 1,
  'l''admin elimina');

-- ---------------------------------------------------------------------------
-- 4. Who created it and the Notion page: only the admin writes them
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
insert into public.marketing_contenuti (id, nome, created_by, created_at, notion_page_id) values
  ('67670000-0000-4000-8000-000000000007', 'Contenuto 67 autore', '11111111-1111-4111-8111-111111111111',
   '2020-01-01', '67670000-0000-4000-8000-0000000000f7');
select is(
  (select row(created_by, created_at = now(), notion_page_id is null)::text
   from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000007'),
  row('61616161-6161-4161-8161-616161616161'::uuid, true, true)::text,
  'il marketing che crea ne risulta l''autore, adesso, senza pagina di Notion'
);

set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
update public.marketing_contenuti
set id = '67670000-0000-4000-8000-000000000099', created_by = '55555555-5555-4555-8555-555555555555',
    created_at = '2020-01-01', notion_page_id = null, nome = 'Contenuto 67 importato e corretto'
where id = '67670000-0000-4000-8000-000000000004';
select is(
  (select row(nome, created_by, created_at, notion_page_id)::text
   from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000004'),
  row('Contenuto 67 importato e corretto', '11111111-1111-4111-8111-111111111111'::uuid,
      '2026-01-02'::timestamptz, '67670000-0000-4000-8000-0000000000f4'::uuid)::text,
  'il video editor corregge il nome ma non id, autore, data di creazione e pagina di Notion'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.marketing_contenuti
set created_by = '55555555-5555-4555-8555-555555555555', created_at = '2025-05-05',
    notion_page_id = '67670000-0000-4000-8000-0000000000f5'
where id = '67670000-0000-4000-8000-000000000004';
select is(
  (select row(created_by, created_at, notion_page_id)::text
   from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000004'),
  row('55555555-5555-4555-8555-555555555555'::uuid, '2025-05-05'::timestamptz,
      '67670000-0000-4000-8000-0000000000f5'::uuid)::text,
  'l''admin li corregge (l''import gira come lui; elimina_persona e unisci_profili)'
);

-- ---------------------------------------------------------------------------
-- 5. instagram_shortcode, from URL only (lib/marketing/shortcode.ts: same cases)
-- ---------------------------------------------------------------------------
reset role;
insert into public.marketing_contenuti (nome, url) values
  ('Shortcode 01', 'https://www.instagram.com/reel/ABCdef12345/'),
  ('Shortcode 02', 'https://www.instagram.com/reels/ABCdef12346/'),
  ('Shortcode 03', 'https://www.instagram.com/p/Cxyz_-12347/'),
  ('Shortcode 04', 'https://www.instagram.com/tv/TVabc12348/'),
  ('Shortcode 05', 'https://www.instagram.com/some.user_name/reel/USRabc12349/'),
  ('Shortcode 06', 'https://www.instagram.com/reel/IGSHabc1235/?igsh=MWx0bXo5bTlh'),
  ('Shortcode 07', 'https://m.instagram.com/reel/MOBabc12351/'),
  ('Shortcode 08', 'https://instagr.am/p/SHORTabc1252/'),
  ('Shortcode 09', 'https://www.instagram.com/share/reel/SHAREabc123/'),
  ('Shortcode 10', 'https://www.instagram.com/reels/audio/123456789012345/'),
  ('Shortcode 11', 'https://www.instagram.com/stories/qualcuno/3456789012345678901/'),
  ('Shortcode 12', 'https://www.instagram.com/qualcuno/'),
  ('Shortcode 13', 'https://www.tiktok.com/@qualcuno/video/7234567890123456789');
select results_eq(
  $$ select nome, instagram_shortcode from public.marketing_contenuti
     where nome between 'Shortcode 01' and 'Shortcode 08' order by nome $$,
  $$ values ('Shortcode 01', 'ABCdef12345'), ('Shortcode 02', 'ABCdef12346'), ('Shortcode 03', 'Cxyz_-12347'),
            ('Shortcode 04', 'TVabc12348'), ('Shortcode 05', 'USRabc12349'), ('Shortcode 06', 'IGSHabc1235'),
            ('Shortcode 07', 'MOBabc12351'), ('Shortcode 08', 'SHORTabc1252') $$,
  'shortcode da /reel/, /reels/, /p/, /tv/, /utente/reel/, con ?igsh, da m.instagram.com e instagr.am'
);
select is(
  (select count(*)::integer from public.marketing_contenuti
   where nome between 'Shortcode 09' and 'Shortcode 13' and instagram_shortcode is null),
  5,
  'nessuno shortcode da un link /share/, una pagina audio, una storia, un profilo, un video di TikTok'
);
select throws_ok(
  $$ insert into public.marketing_contenuti (nome, url) values ('Shortcode doppio', 'https://instagram.com/reel/ABCdef12345?utm_source=ig_web') $$,
  '23505', null,
  'lo stesso post non sta su due contenuti'
);

-- ---------------------------------------------------------------------------
-- 6. Checks
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.marketing_contenuti (nome, inspiration) values ('Check 1', 'www.instagram.com/reel/abc') $$,
  '23514', null, 'Inspiration vuole l''indirizzo intero, con https://');
select throws_ok($$ insert into public.marketing_contenuti (nome, url) values ('Check 2', 'https://www.instagram.com/reel/ab cd') $$,
  '23514', null, 'un URL con uno spazio non passa');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('   ') $$,
  '23514', null, 'un Name di soli spazi non passa');
select throws_ok($$ insert into public.marketing_contenuti (nome, view_count) values ('Check 4', -1) $$,
  '23514', null, 'View Count mai negativo');

-- ---------------------------------------------------------------------------
-- 7. salva_sezione_contenuto: only over the text the person read
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';

create temp table esito_sezione on commit drop as
select public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000005', 'finale',
  E'\n  \n\nNuovo testo  \n\n', md5('Testo iniziale')) as r;
select is(
  (select row(r ->> 'esito', r ->> 'impronta')::text from esito_sezione),
  row('salvata', md5('Nuovo testo'))::text,
  'con l''impronta giusta salva e restituisce l''impronta nuova'
);
select ok(
  (select (e.r ->> 'versione')::timestamptz = c.updated_at and c.updated_at = now()
   from esito_sezione e, public.marketing_contenuti c where c.id = '67670000-0000-4000-8000-000000000005'),
  'e la versione nuova della riga (updated_at)'
);
select is(
  (select finale from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000005'),
  'Nuovo testo',
  'senza le righe vuote in testa e gli spazi in coda'
);
select is(
  public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000005', 'finale',
    E'\n\tRientro della prima riga\n', md5('Nuovo testo')) ->> 'esito',
  'salvata',
  'salva un testo con la prima riga rientrata'
);
select is(
  (select finale from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000005'),
  E'\tRientro della prima riga',
  'e il rientro della prima riga resta (è Markdown)'
);
select is(
  public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000005', 'finale',
    E'   \n  ', md5(E'\tRientro della prima riga')) ->> 'esito',
  'salvata',
  'solo spazi si salva'
);
select is(
  (select finale from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000005'),
  null,
  'e la sezione torna vuota (null)'
);

-- someone else saved in between: nothing written, the saved text comes back
select is(
  (select row(r ->> 'esito', r ->> 'attuale', r ->> 'impronta', (r ->> 'versione')::timestamptz = now())::text
   from (select public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000005', 'messaggio',
           'Il mio testo', md5('Un testo che non c''è')) as r) x),
  row('cambiata', null::text, md5(''), true)::text,
  'con l''impronta sbagliata: cambiata, con il testo salvato, la sua impronta e la versione'
);
select is(
  (select messaggio from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000005'),
  null,
  'e non scrive niente'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000005', 'finale', 'Del setter', md5('')) ->> 'esito',
  'sparito',
  'il setter non vede il contenuto: per lui non c''è'
);
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(
  public.salva_sezione_contenuto('67670000-0000-4000-8000-0000000000ff', 'finale', 'Testo', md5('')) ->> 'esito',
  'sparito',
  'un contenuto che non c''è: sparito'
);
select throws_ok(
  $$ select public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000005', 'nome', 'Testo', md5('')) $$,
  '22023', 'Sezione non valida.',
  'solo le quattro sezioni del modello'
);
select throws_ok(
  $$ select public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000005', 'bozza', repeat('a', 30001), md5('')) $$,
  '22023', 'Il testo supera i 30.000 caratteri: accorcialo.',
  'al massimo 30.000 caratteri'
);

-- the same text again: nothing written, the version stays
select ok(
  (select (r ->> 'esito') = 'salvata' and (r ->> 'versione')::timestamptz = '2026-01-01'::timestamptz
   from (select public.salva_sezione_contenuto('67670000-0000-4000-8000-000000000006', 'finale',
           'Uguale  ', md5('Uguale')) as r) x),
  'lo stesso testo: salvata, con la versione di prima'
);
select is(
  (select updated_at from public.marketing_contenuti where id = '67670000-0000-4000-8000-000000000006'),
  '2026-01-01'::timestamptz,
  'e la riga non cambia (updated_at)'
);

reset role;
select * from finish();
rollback;
