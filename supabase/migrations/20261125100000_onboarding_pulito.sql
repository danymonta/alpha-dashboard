-- 1.86.1: the onboarding read as a client who enters for the first time (Dany, 25/11/2026: «ipotizza di
-- essere un cliente… così mi dici se torna tutto ed è fluido ed è tutto chiaro»).
--
-- Only contents: no table, no function, no permission changes. Each change applies only while the
-- block still has the words it replaces, so a block Dany edited stays as he wrote it.
-- * The first block of five steps repeated the step's own heading in other words («Settimana test» over
--   «La settimana test»): its title goes, the heading of the step stays.
-- * The welcome said «Benvenuto» three times in a row: «Benvenuto a bordo, [Nome].» goes, the rest stays.
-- * «Si salva tutto da solo» was written under the button too; «Scegli il giorno e l'ora…» repeated the
--   numbered steps of the booking just below.
-- * A typo of the test week: two colons in a row.
-- * The first task of the test week asked to register on Coach Plus, which the objective step already
--   asks: it becomes «turn on the notifications and tell us», with the registration link as a fallback.
-- * The health consent said «scrivendo al mio coach»: a new version says «scrivendo a Percorso Alpha»
--   (lib/percorso/consensi.ts, same sha256). Whoever accepted the old one accepts it again before the
--   questionnaire, as with the version of 1.82.0.

update public.contenuti_blocchi b
set titolo = null
where b.versione_flusso = 1 and b.pagina = 'passo' and b.tipo = 'testo' and b.ordine = 1
  and (b.passo, b.titolo) in (
    ('benvenuto', 'Benvenuto a bordo'),
    ('questionario', 'Il questionario'),
    ('prenotazione', 'Prenota la tua call di onboarding'),
    ('community', 'Entra nella community'),
    ('test', 'La settimana test')
  );

update public.contenuti_blocchi b
set corpo = replace(b.corpo, 'Benvenuto a bordo, [Nome]. Questo sarà', 'Questo sarà')
where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'benvenuto'
  and strpos(b.corpo, 'Benvenuto a bordo, [Nome]. Questo sarà') > 0;

update public.contenuti_blocchi b
set corpo = replace(b.corpo, ' Si salva tutto da solo: puoi riprendere quando vuoi, anche da un altro dispositivo.', '')
where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'questionario'
  and strpos(b.corpo, ' Si salva tutto da solo: puoi riprendere quando vuoi, anche da un altro dispositivo.') > 0;

update public.contenuti_blocchi b
set corpo = replace(b.corpo, 'Scegli il giorno e l''ora che ti vanno meglio e segnali qui. ', '')
where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'prenotazione'
  and strpos(b.corpo, 'Scegli il giorno e l''ora che ti vanno meglio e segnali qui. ') > 0;

update public.contenuti_blocchi b
set corpo = replace(b.corpo,
  'sono una stima: non sono quelle che seguirai: quelle te le diamo noi.',
  'sono una stima, non quelle che seguirai: quelle te le diamo noi.')
where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'test'
  and strpos(b.corpo, 'sono una stima: non sono quelle che seguirai: quelle te le diamo noi.') > 0;

update public.contenuti_blocchi b
set titolo = '1. Attiva le notifiche su Coach Plus e avvisaci',
    corpo = E'Coach Plus è l''app dove ti carichiamo i test, gli allenamenti e le indicazioni alimentari.\n\n'
      || E'1. Apri l''app ed entra con il tuo account.\n'
      || E'2. Attiva le notifiche, così non perdi i nostri commenti.\n'
      || E'3. Scrivici nel gruppo Telegram che sei pronto: ti carichiamo i test in app.\n\n'
      || E'Non ti sei ancora registrato? Fallo da [questo link](https://coachplus.app/register-client?coachId=1af66566-5c89-4a69-bb70-ec262643370a&coachName=Ivan%20Montagnolo) e scarica l''app: [iPhone](https://apps.apple.com/it/app/coachplus/id1576158679) oppure [Android](https://play.google.com/store/apps/details?id=com.coachplus.app).\n\n'
      || 'Come si usa l''app: [guarda il video](https://youtube.com/shorts/WPmJr02_jLQ).'
where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'test' and b.tipo = 'voce'
  and b.titolo = '1. Registrati su Coach Plus e avvisaci';

update public.clienti_consensi_testi t set in_vigore = false where t.tipo = 'salute' and t.in_vigore;
insert into public.clienti_consensi_testi (tipo, versione, testo_sha256, in_vigore) values
  ('salute', '2026-11-25', '4573367ea2c7c2f57b4cd28e3a86e719063dce3c1f122d90d264ca8d371e2255', true);
