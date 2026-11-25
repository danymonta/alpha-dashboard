-- 1.86.0: the rules step as Dany wants it, and the onboarding always speaks as «noi»
-- (Dany, 25/11/2026: «Regole e indicazioni per sfruttare il percorso al 100%», «spunta ogni regola
-- per presa lettura», «non delegare al coach la comunicazione ma parla sempre al noi durante
-- l'onboarding», «solitamente rispondiamo entro 24h», «una spunta più generica di mantenere la
-- comunicazione attiva», a video after the rules on the mindset, «rispetto per tutti» written by us,
-- «togli Niente foto del fisico qui», «tieni solo le info essenziali»).
--
-- Only contents: no table, no function, no permission changes.
-- * Rules: rewritten in place while they are still the seed's words (their ids do not change), the
--   ones merged into another are unpublished (pubblicato = false: percorso_avanza and the Regole tab
--   read only published rules), never deleted.
-- * The video «Cliente che ottiene risultati vs cliente che non li ottiene» is added once, after the
--   rules, with the placeholder id XXXXXXXXXXX: Dany pastes the YouTube link in Impostazioni ›
--   Onboarding › Contenuti (the area does not open while a placeholder is there).
-- * «il tuo coach» becomes «noi» in the steps and on the page after the launch: a phrase is replaced
--   only where it is still written, so a block Dany edited keeps the rest of his words.
-- * The notice «Niente foto del fisico qui…» of the questionnaire is unpublished, and the sentences that
--   only describe what the client already sees on the screen are taken out («tieni solo le info essenziali»).

create function pg_temp.riscrivi(
  p_passo text,
  p_ordine int,
  p_titolo_prima text,
  p_corpo_prima text,
  p_titolo text,
  p_corpo text,
  p_ordine_nuovo int default null
) returns void
language sql
as $$
  update public.contenuti_blocchi b
  set titolo = p_titolo,
      corpo = p_corpo,
      ordine = coalesce(p_ordine_nuovo, b.ordine)
  where b.versione_flusso = 1
    and b.pagina = 'passo'
    and b.passo = p_passo
    and b.ordine = p_ordine
    and b.titolo is not distinct from p_titolo_prima
    and b.corpo is not distinct from p_corpo_prima;
$$;

create function pg_temp.nascondi(p_passo text, p_titolo text, p_corpo text) returns void
language sql
as $$
  update public.contenuti_blocchi b
  set pubblicato = false
  where b.versione_flusso = 1
    and b.pagina = 'passo'
    and b.passo = p_passo
    and b.titolo is not distinct from p_titolo
    and b.corpo is not distinct from p_corpo;
$$;

create function pg_temp.sostituisci(p_pagina text, p_passo text, p_vecchio text, p_nuovo text) returns void
language sql
as $$
  update public.contenuti_blocchi b
  set titolo = replace(b.titolo, p_vecchio, p_nuovo),
      corpo = replace(b.corpo, p_vecchio, p_nuovo)
  where b.versione_flusso = 1
    and b.pagina = p_pagina
    and b.passo is not distinct from p_passo
    and (strpos(coalesce(b.titolo, ''), p_vecchio) > 0 or strpos(coalesce(b.corpo, ''), p_vecchio) > 0);
$$;

-- ---------------------------------------------------------------------------
-- 1. The rules: essential, ticked for acknowledgement, in our voice
-- ---------------------------------------------------------------------------
select pg_temp.riscrivi('regole', 1,
  'Le regole del percorso',
  'Poche regole, chiare: servono a te per avere risposte veloci e a noi per seguirti bene. Spuntale una per una.',
  'Le regole del percorso',
  'Servono a te per avere risposte veloci e a noi per seguirti bene. Spunta ogni regola per presa lettura.');

select pg_temp.riscrivi('regole', 2,
  'Telegram per imprevisti e dubbi',
  'Per un imprevisto o un dubbio scrivi nel tuo gruppo privato su Telegram: è lì che ti rispondiamo.',
  'Mantieni la comunicazione attiva',
  'Per qualsiasi cosa scrivici nel tuo gruppo privato su Telegram: un imprevisto, un allenamento saltato, un dubbio. '
  || 'Più comunicazione c''è, più riuscirai a trarre da questo percorso. Tieni attive le notifiche, così non perdi i nostri messaggi.');

select pg_temp.riscrivi('regole', 10,
  'Sempre testo, mai vocali',
  'Scrivi al tuo coach con un messaggio di testo: ti risponde più in fretta e senza perdere dettagli. Se non ti risponde entro 24 ore, riscrivigli: non perde messaggi.',
  'Sempre testo, mai vocali',
  'Scrivici sempre con un messaggio di testo: rispondiamo più in fretta e senza perdere dettagli. '
  || 'Di solito rispondiamo entro 24 ore: se capita che un messaggio non venga visto, riscrivici senza problemi.',
  3);

select pg_temp.riscrivi('regole', 3,
  'Coach Plus per i dati',
  'Misure, foto, allenamenti e questionario giornaliero vanno su Coach Plus, non in chat.',
  'Coach Plus per i dati',
  'Misure, foto, allenamenti e questionario giornaliero vanno su Coach Plus, non in chat.',
  4);

select pg_temp.riscrivi('regole', 4,
  'Le call si confermano',
  'Ogni call la confermi tu: una call non confermata non resta in calendario.',
  'Le call si confermano',
  'Ogni call la confermi tu: una call non confermata non resta in calendario. Se devi spostarla, avvisaci almeno 24-48 ore prima.',
  5);

select pg_temp.riscrivi('regole', 7,
  'Nella community ci si presenta',
  'Appena entri nella community ti presenti nel topic «Presentazioni».',
  'Nella community ci si presenta',
  'Appena entri nella community ti presenti nel topic «Presentazioni». Lì vanno le domande utili a tutti; quelle su di te nel tuo gruppo privato.');

select pg_temp.riscrivi('regole', 9,
  'Rispetto per tutti',
  '[Da scrivere: le regole della community, come nel messaggio fissato.]',
  'Rispetto per tutti',
  'Nella community e nel tuo gruppo si parla con rispetto: niente offese, niente spam, niente promozioni. Siamo qui per crescere insieme.');

-- merged into the rules above
select pg_temp.nascondi('regole', 'Preavviso di 24-48 ore',
  'Se devi spostare una call, avvisa almeno 24-48 ore prima.');
select pg_temp.nascondi('regole', 'Notifiche di Telegram attive',
  'Tieni attive le notifiche del gruppo privato, così non perdi i messaggi del tuo coach.');
select pg_temp.nascondi('regole', 'Le domande personali nel gruppo privato',
  'Nella community le domande utili a tutti; quelle su di te nel tuo gruppo privato.');
select pg_temp.nascondi('regole', 'Se salti un allenamento, avvisa',
  'Appena sai che salti un allenamento scrivilo nel tuo gruppo Telegram: basta un messaggio, e il coach adatta il programma. Un giorno saltato non è un problema, una settimana in silenzio sì.');

-- the video on the mindset, after the rules (ordine 20: the page shows the blocks after the first rule
-- below the list)
insert into public.contenuti_blocchi (versione_flusso, pagina, passo, ordine, tipo, titolo, corpo, youtube_id, obbligatorio)
select 1, 'passo', 'regole', 20, 'video',
  'Cliente che ottiene risultati vs cliente che non li ottiene',
  'In questo video ti spiego l''approccio mentale che devi avere per ottenere il massimo, in termini di risultati, da questo percorso.',
  'XXXXXXXXXXX', false
where not exists (
  select 1 from public.contenuti_blocchi b
  where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'regole' and b.tipo = 'video'
    and b.titolo = 'Cliente che ottiene risultati vs cliente che non li ottiene'
);

-- ---------------------------------------------------------------------------
-- 2. The questionnaire: no more notice on the photos of the body
-- ---------------------------------------------------------------------------
select pg_temp.nascondi('questionario', null, 'Niente foto del fisico qui: quelle vanno su Coach Plus.');

-- ---------------------------------------------------------------------------
-- 3. «noi», never «il tuo coach», in the steps and on the page after the launch
-- ---------------------------------------------------------------------------
select pg_temp.sostituisci('passo', 'benvenuto',
  'Ti seguono il tuo coach e le persone del team che lavorano con lui: chi rivede i video dei tuoi allenamenti e il tuo Personal Success Manager. Le trovi qui con foto e ruolo.',
  'Ti seguiamo noi: il tuo coach e le persone del team che lavorano con lui, chi rivede i video dei tuoi allenamenti e il tuo Personal Success Manager. Ci trovi qui con foto e ruolo.');

select pg_temp.sostituisci('passo', 'questionario',
  'Queste domande servono al tuo coach per costruire',
  'Queste domande ci servono per costruire');

select pg_temp.sostituisci('passo', 'prenotazione',
  'nel calendario del tuo coach, il giorno',
  'nel nostro calendario, il giorno');
select pg_temp.sostituisci('passo', 'prenotazione',
  'Il tuo coach conferma la call e ti scrive sul tuo gruppo Telegram',
  'Confermiamo la call e ti scriviamo sul tuo gruppo Telegram');
select pg_temp.sostituisci('passo', 'prenotazione',
  '**Call di onboarding con il tuo coach, 30 minuti su Google Meet**',
  '**Call di onboarding, 30 minuti su Google Meet**');

select pg_temp.sostituisci('passo', 'obiettivo',
  'Dopo la call il tuo coach scrive su Coach Plus',
  'Dopo la call scriviamo su Coach Plus');

select pg_temp.sostituisci('passo', 'test',
  'Questa è la fase che serve al tuo coach per costruire',
  'Questa è la fase che ci serve per costruire');
select pg_temp.sostituisci('passo', 'test',
  '1. Registrati su Coach Plus e avvisa il tuo coach',
  '1. Registrati su Coach Plus e avvisaci');
select pg_temp.sostituisci('passo', 'test',
  'Coach Plus è l''app dove il tuo coach ti carica i test',
  'Coach Plus è l''app dove ti carichiamo i test');
select pg_temp.sostituisci('passo', 'test',
  'così non perdi i commenti del tuo coach.',
  'così non perdi i nostri commenti.');
select pg_temp.sostituisci('passo', 'test',
  '4. Scrivi al tuo coach nel gruppo Telegram che ti sei registrato: ti carica i test in app.',
  '4. Scrivici nel gruppo Telegram che ti sei registrato: ti carichiamo i test in app.');
select pg_temp.sostituisci('passo', 'test',
  'non sono quelle che seguirai. Ne parli con il tuo coach.',
  'non sono quelle che seguirai: quelle te le diamo noi.');
select pg_temp.sostituisci('passo', 'test',
  'Gli esercizi dei test te li carica il tuo coach su Coach Plus.',
  'Gli esercizi dei test te li carichiamo noi su Coach Plus.');
select pg_temp.sostituisci('passo', 'test',
  'Se il tuo coach ti chiede una sbarra',
  'Se ti chiediamo una sbarra');

select pg_temp.sostituisci('passo', 'programma',
  'Il tuo coach ti ha preparato il programma.',
  'Ti abbiamo preparato il programma.');

select pg_temp.sostituisci('dopo_lancio', null,
  'Da qui in avanti lavori su Coach Plus con il tuo coach.',
  'Da qui in avanti lavoriamo insieme su Coach Plus.');
select pg_temp.sostituisci('dopo_lancio', null,
  'scrivi al tuo coach su Telegram prima di iniziare',
  'scrivici su Telegram prima di iniziare');
select pg_temp.sostituisci('dopo_lancio', null,
  'Il coach li guarda tutti e ti risponde sotto il video.',
  'Li guardiamo tutti e ti rispondiamo sotto il video.');
select pg_temp.sostituisci('dopo_lancio', null,
  '**Come scrivere al coach:** sempre testo, mai vocali. Se non ti risponde entro 24 ore, riscrivigli.',
  '**Come scriverci:** sempre testo, mai vocali. Di solito rispondiamo entro 24 ore: se un messaggio non viene visto, riscrivici senza problemi.');
select pg_temp.sostituisci('dopo_lancio', null,
  'così il coach adatta il programma.',
  'così adattiamo il programma.');

-- ---------------------------------------------------------------------------
-- 4. Only the essential: out the sentences the screen already says
-- ---------------------------------------------------------------------------
select pg_temp.sostituisci('passo', 'benvenuto', ' Ci trovi qui con foto e ruolo.', '');
-- the rules of the community are now «Rispetto per tutti», among the rules: the placeholder goes
select pg_temp.nascondi('community', null, '[Da scrivere: le regole della community da ricordare prima di presentarsi.]');
select pg_temp.sostituisci('passo', 'questionario',
  E'Rispondi con calma: si salva tutto da solo e puoi riprendere anche da un altro dispositivo.\n\nLe foto della tua attrezzatura, la vecchia scheda e il piano alimentare li carichi qui, insieme alle risposte.',
  'Si salva tutto da solo: puoi riprendere quando vuoi, anche da un altro dispositivo.');
select pg_temp.sostituisci('passo', 'prenotazione',
  'Scegli qui sotto, nel nostro calendario, il giorno e l''ora che ti vanno meglio, poi segna quello che hai scelto.',
  'Scegli il giorno e l''ora che ti vanno meglio e segnali qui.');
select pg_temp.sostituisci('passo', 'prenotazione',
  'Se non trovi un orario che ti va bene, scrivilo nel tuo gruppo privato su Telegram.',
  'Non trovi un orario che ti va bene? Scrivicelo nel tuo gruppo privato su Telegram.');
select pg_temp.sostituisci('passo', 'community',
  ' Tre passi: scrivi il tuo username di Telegram, chiedi l''accesso con «Entra nella community» e, quando sei dentro, presentati nel canale «Presentazioni».',
  '');
select pg_temp.sostituisci('passo', 'test', E'\n\nQuando hai finito un compito, spuntalo.', '');
select pg_temp.sostituisci('passo', 'test',
  'Per qualsiasi dubbio sull''app scrivi nel tuo gruppo Telegram.',
  'Per qualsiasi dubbio sull''app scrivici nel tuo gruppo Telegram.');
select pg_temp.sostituisci('passo', 'obiettivo',
  'In questo video Dany ti mostra passo dopo passo come definire il tuo obiettivo in modo chiaro, realistico e potente.',
  'Passo dopo passo, come definire il tuo obiettivo in modo chiaro, realistico e potente.');

drop function pg_temp.riscrivi(text, int, text, text, text, text, int);
drop function pg_temp.nascondi(text, text, text);
drop function pg_temp.sostituisci(text, text, text, text);
