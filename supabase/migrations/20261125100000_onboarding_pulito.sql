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
