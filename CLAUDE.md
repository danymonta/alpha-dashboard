# Alpha Management: specifica di progetto per Claude Code

Nome dell'app: **Alpha Management**, il gestionale di Percorso Alpha (deciso da Dany il 27/09/2026; prima "Alpha Economics", nome rimasto all'area Economics della navigazione e agli agenti di sezione 12). Nome e descrizioni stanno in `lib/brand/nome.ts`.

Questo file è la fonte di verità del progetto. Leggilo per intero all'inizio di ogni sessione. Se una richiesta contraddice questo file, fermati e segnalalo prima di scrivere codice.

## 1. Contesto

Percorso Alpha è un coaching online di trasformazione fisica per uomini 25+, allenamento a corpo libero a casa. Il titolare è Dany (admin, closer, full stack developer: TypeScript, Angular, Node, NestJS, Docker). Il team: Loris (setter, lavora i DM Instagram), Lorenzo (coach), un video editor. Circa 26 allievi attivi.

Oggi il setting e le vendite si tracciano in un Excel (`MMM x Percorso Alpha DM Tracking.xlsx`, un foglio per mese più un foglio "Setter Payments"). L'Excel ha tre limiti che questa app deve risolvere:

1. Registra cash e revenue come totali giornalieri, senza cliente. Non si sa chi ha pagato cosa, quali rate mancano, chi ha rinnovato.
2. Le provvigioni del setter (5% del cash) si calcolano a mano e non sono ricostruibili: a luglio il cash registrato è 4.500€, la base provvigionale pagata al 25/08 è 3.750€, e nessun dato spiega la differenza.
3. Diverse formule sono rotte (`#REF!` in "Avg Cash Per DM", "Total Cash Collected" fisso a 0) e i rinnovi non esistono come concetto.

## 2. Obiettivo

Una web app con login personale in cui:

- il setter inserisce ogni giorno dal telefono i numeri del setting e registra le call che fissa;
- il closer registra l'esito di ogni call e le vendite chiuse;
- l'admin registra vendite nuove, rinnovi, piani di pagamento, incassi e costi;
- l'admin vede ogni mese quanto ha incassato, da chi, da quale fonte, quanto resta da incassare, quanto deve in provvigioni e qual è il margine operativo.

Domanda a cui la dashboard deve rispondere in 5 secondi: **"Questo mese quanto ho incassato, quanto è nuovo e quanto è rinnovo, e quanto mi resta dopo provvigioni e costi?"**

Tutto è salvato su database. Nessun dato vive solo nel browser.

## 3. Relazione con il resto del progetto

Questa app è la prima area di un'unica app shell che in seguito ospiterà anche il time tracking del team (Sistema B). Quindi:

- la tabella `clients` definita qui è la stessa che userà il time tracking: non duplicarla mai;
- i ruoli (`app_role`) includono già quelli del time tracking;
- la navigazione ha due aree: **Economics** (admin, setter, closer) e **Progetti** (tutti i ruoli).

Il project management con il time tracking è stato chiesto da Dany il 27/09/2026 ed è costruito (sezione 18).

## 4. Stack (deciso, non riaprire)

| Livello | Scelta |
|---|---|
| Framework | Next.js App Router, TypeScript strict. Usa la versione installata da `create-next-app`, non fare downgrade |
| UI | Tailwind CSS + shadcn/ui. Grafici: componenti chart di shadcn (Recharts) |
| Form | React Hook Form + Zod. Lo stesso schema Zod valida client e server action |
| Database | Supabase Postgres, regione EU (Frankfurt) |
| Auth | Supabase Auth con Google OAuth2. Accesso solo su invito |
| Permessi | Row Level Security su ogni tabella. Il frontend nasconde, RLS protegge |
| Hosting | Vercel |
| Test | Vitest (logica), pgTAP via `supabase test db` (RLS), Playwright (e2e e screenshot) |
| Package manager | npm |
| AI (Alfire) | AI SDK v7 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`), endpoint OpenAI-compatibile. Default: Groq piano gratuito, `openai/gpt-oss-120b`, voce `whisper-large-v3-turbo` (sezione 20) |

Librerie Supabase: `@supabase/supabase-js` e `@supabase/ssr`. Tre client distinti in `lib/supabase/`: `server.ts` (Server Components e Server Actions, cookie), `client.ts` (browser), `admin.ts` (secret key, importabile solo da codice server, con `import 'server-only'`).

## 5. Variabili d'ambiente

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # equivale alla legacy "anon key"
SUPABASE_SECRET_KEY=                    # equivale alla legacy "service_role", SOLO server
NEXT_PUBLIC_APP_URL=
CRON_SECRET=                            # protegge /api/cron/keep-alive
ENABLE_DEV_LOGIN=                       # "true" solo in locale, mai su Vercel
RESEND_API_KEY=                         # email di invito (Resend), SOLO server; vuota = link da copiare
EMAIL_MITTENTE=                         # es. "Percorso Alpha <team@dominio-verificato>"
ALFIRE_API_KEY=                         # chiave Groq (o altro fornitore), SOLO server; vuota = Alfire spenta
ALFIRE_BASE_URL=                        # facoltativa, default https://api.groq.com/openai/v1
ALFIRE_MODEL=                           # facoltativa, default openai/gpt-oss-120b
ALFIRE_MODEL_VOCE=                      # facoltativa, default whisper-large-v3-turbo
ALFIRE_PIANO=                           # facoltativa: vuota = il piano lo dice Groq; "developer" o "gratuito" lo forzano
```

Regole:
- Mai chiedere a Dany di incollare valori di chiavi in chat. Se succede, digli di ruotarle.
- `.env.local` è in `.gitignore` dal primo commit. Crea `.env.example` con i soli nomi.
- `SUPABASE_SECRET_KEY` non ha mai prefisso `NEXT_PUBLIC_` e non viene mai importata in un file con `'use client'`.
- Su Vercel le variabili di Production possono essere forzate come segrete, e allora il prefisso `NEXT_PUBLIC_` non è accettato: per i tre valori pubblici (URL del progetto, chiave publishable, URL dell'app) valgono anche `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `APP_URL`, che `next.config.ts` passa al browser al momento della build. Nessun segreto va mai in quella lista.

## 6. Ruoli e permessi

Enum `app_role`: `admin`, `setter`, `closer`, `coach`, `editor`, `nutrizione`, `dev`.

In Economics contano `admin`, `setter`, `closer`. Tutti i ruoli hanno l'area Progetti: coach, editor, nutrizione e dev atterrano su `/progetti`.

| Dato | admin | setter | closer |
|---|---|---|---|
| Report giornalieri setting | tutti, lettura e scrittura | solo i propri; compila e corregge qualsiasi giorno passato, mai il futuro | nessuno |
| Lead | tutti; ne crea fissando una call (il lead va al setter della call) | solo quelli creati da lui; ne aggiorna lo stato | quelli con call assegnate a lui; ne aggiorna lo stato |
| Call | tutte; le fissa anche lui, per sé o per un setter, comprese quelle già fatte (29/09/2026); scrive tutto, esito e le due note comprese | le proprie: le fissa, le sposta (data e ora), le riassegna e scrive le sue "Note del setter"; mai importi. Stato, esito, qualificata, motivo di non chiusura e note aggiuntive del closer li legge e non li scrive mai (Dany, 30/09/2026: "Solo il closer registra l'esito, e le note del closer non le può modificare il setter"; trigger `calls_esito_solo_closer`) | quelle assegnate a lui: esito (stato, qualificata, chiusa o no; con Follow-up o Persa sempre il motivo di non chiusura, 30/09/2026), le sue "Note aggiuntive" (`note_closer`), data, dettagli (link, performance, prodotto proposto); legge le note del setter e non le cambia; non ne fissa |
| Importo proposto in call (`call_pitch`) | tutti | nessuno | solo delle call assegnate a lui |
| Clienti | tutti | nome e stato dei clienti nati da suoi lead, niente contatti | clienti nati da sue call |
| Vendite e rate | tutte | solo quelle dove è il setter, cioè i clienti nuovi che ha portato (rinnovi e upsell nascono senza setter): cliente, revenue, rate e incassi, in sola lettura | solo le vendite chiuse da lui |
| Provvigioni | tutte | il proprio totale mensile maturato e pagato, e la provvigione di ogni incasso delle sue vendite | nessuna |
| Giornata del closer (call, qualificate, no show, follow up, cancellate, chiuse, cash, revenue; cash e revenue solo dei clienti nuovi) | tutte (`giornate_closer`) | solo gli esiti delle call fissate da lui, e cash e revenue dei clienti nuovi che ha portato lui (`giornate_setter`) | la propria (`giornate_closer`) |
| Costi, margine, compensi | tutto | nessuno | nessuno |
| Gestione utenti, prodotti, impostazioni | tutto | nessuno | nessuno |

Requisito duro: un collaboratore non vede mai quanto paga un singolo cliente, il compenso di un altro collaboratore, i costi o il margine. Unica eccezione (Dany, 27/09/2026): il setter vede quanto hanno pagato i clienti che ha portato lui (vendite con il suo `setter_id`), in quante rate, la revenue e la provvigione di ogni incasso, così sa quanto gli spetta; mai contatti, metodo o note, mai le vendite di altri. Dal 29/09/2026 sono solo i clienti nuovi: rinnovi e upsell nascono senza setter, se non vengono da una call fissata (sezione 8), quindi il setter non li vede e non ci matura provvigione. Le vendite già registrate col setter restano come sono. Passa solo dalla RPC `mie_vendite_setter()` (`security definer`, filtrata su `auth.uid()`): il setter non ha policy su `sales` e `payments`.

**Dany è admin e closer** (28/09/2026): ha il ruolo `admin` (etichetta "Admin · Closer"), è il closer predefinito delle call e la scheda Closer mostra i suoi numeri. Il ruolo `closer` resta per un closer assunto in futuro, che vede solo i propri. **E a volte setter** (29/09/2026): l'admin fissa call come il setter, per sé (predefinito) o per un setter attivo, e registra le call già fatte che nell'app mancano (`fissa_call`, sezione 8).

Regole di implementazione:
- I dati sensibili stanno in **tabelle separate**, non in colonne nascoste: RLS lavora per riga, non per colonna. Esempio: la percentuale provvigionale sta in `commission_rules`, non in `profiles`.
- Funzione helper `public.current_role()` `security definer`, `stable`, `set search_path = ''`, che legge il ruolo da `profiles` (ruolo attivo e utente attivo). Usala nelle policy.
- Ogni view è creata `with (security_invoker = true)`. Una view senza questa opzione gira coi permessi del proprietario e **bypassa RLS**. È il bug di sicurezza più probabile di questo progetto.
- Le funzioni RPC che restituiscono aggregati economici controllano esplicitamente `current_role() = 'admin'` o filtrano per `auth.uid()`.
- Il closer non ha una policy di update sui lead: lo stato si cambia con la RPC `aggiorna_stato_lead` (`security definer`), che tocca solo la colonna `stato` e verifica chi chiama.
- **Tutto ciò che si inserisce resta modificabile** (decisione di Dany, 27/09/2026): lead, call, report, clienti, vendite, rate e incassi, costi, pagamenti e regole provvigionali hanno la loro schermata di modifica, nei limiti della tabella qui sopra. Il setter corregge i propri report di qualsiasi giorno passato.

## 7. Autenticazione e gestione utenti

- Login solo con Google. Pagina `/login` con un solo bottone.
- **Accesso su invito.** Tabella `invites`. Un trigger `after insert on auth.users` (o l'auth hook "Before User Created" se disponibile nel progetto Supabase) blocca con errore qualsiasi email non presente in `invites` con `revocato = false`. Se l'email è invitata, crea la riga in `profiles` con il ruolo dell'invito e marca l'invito come usato.
- L'utente che fa login ma è `attivo = false` viene disconnesso e vede "Account disattivato, contatta l'amministratore".
- La sessione resta nei cookie del dominio: chi è già entrato e apre `/login` va dritto dove stava andando (`da`, solo percorsi interni). Il ritorno da Google e i link d'invito usano il dominio su cui si sta (se è nostro, altrimenti `APP_URL`): `lib/auth/origine.ts`.
- Pagina admin **Team** (`/settings/team`): lista utenti con ruolo e stato, invita per email e ruolo, cambia ruolo, disattiva e riattiva, revoca inviti pendenti. Dany non può disattivare sé stesso né togliersi il ruolo admin.
- L'invito parte come email con il logo (`lib/email/invito.ts`, inviata via Resend REST da `lib/email/invia.ts`). Senza `RESEND_API_KEY` l'invito si salva lo stesso e l'app offre il link da copiare.
- L'admin può **eliminare** una persona (`elimina_persona`: via i suoi report, regole e pagamenti di provvigioni; vendite, call e lead restano senza il suo nome) o **unirla** a un altro profilo (`unisci_profili`: tutto passa al secondo, poi il primo sparisce). Serve per il profilo segnaposto dell'import Excel. Nessuno elimina o unisce sé stesso.
- Il primo admin (Dany) viene creato da una migration seed che inserisce il suo invito con ruolo `admin`.
- **Solo in locale**: se `ENABLE_DEV_LOGIN=true`, `/login` mostra anche un login email e password per gli utenti seed (serve a Playwright e agli screenshot). Il codice verifica anche `process.env.NODE_ENV !== 'production'`. Un test garantisce che in build di produzione il form non esista.

## 8. Modello dati

Convenzioni: `snake_case`, chiavi `uuid default gen_random_uuid()`, `created_at` e `updated_at timestamptz` su ogni tabella con trigger per `updated_at`, `created_by uuid references profiles`. Importi `numeric(12,2)`, mai `float`. Date di business in `date`; "oggi" si calcola in `Europe/Rome`. Valuta unica EUR.

### Utenti

```
profiles            id (= auth.users.id), email, nome, ruolo app_role, attivo bool default true
invites             email (pk, lowercase), ruolo app_role, invitato_da, usato_at, revocato bool
```

### Setting

```
setter_daily_reports
  id, setter_id -> profiles, data date,
  dm_outbound int, dm_inbound int, conversazioni int,
  call_proposte int, discovery_prenotate int, discovery_svolte int,
  call_qualificate int, strategy_prenotate int, follow_up int,
  contenuto_pubblicato bool, note text,
  lead_in_target enum quota_in_target null (quasi_tutti, circa_meta, pochi),
  qualita_conversazioni enum qualita_conversazioni null (buone, medie, scarse),
  cosa_frenava text null, domande_contenuti text null,   -- al massimo 1000 caratteri
  dm_totali int generated always as (dm_outbound + dm_inbound + follow_up) stored
  unique (setter_id, data); tutti gli interi >= 0, default 0

leads
  id, nome, instagram_handle, setter_id -> profiles,
  fonte enum lead_source (dm_inbound, dm_outbound, referral, organico, ads, altro),
  stato enum lead_status (call_fissata, follow_up, cliente, perso),
  note, created_at
```

Il report non chiede più (29/09/2026) `discovery_svolte` e `call_qualificate`: svolte e qualificate le registra il closer su ogni call, e si contano dalle call. Restano per lo storico, come `strategy_prenotate` (il setter fissa solo discovery call): le correzioni conservano i valori salvati.

**Com'è andata la giornata** (Dany, 30/09/2026: un commento guidato insieme ai dati, per il marketing che adatta i contenuti). Quattro domande nel report, con i volumi, sotto le conversazioni e prima delle call: lead in target e qualità delle conversazioni (un tocco, tre livelli con la loro definizione sempre visibile), cosa frenava i lead dal fissare la call e domande e contenuti (testi facoltativi; il prezzo no, è del closer), più "Altre note" (la colonna `note` di sempre). Tutte le parole (domande, definizioni, esempi, messaggi) stanno in `lib/setting/commento.ts`: una parola si cambia lì; i valori sono gli enum del database. Le due scale servono nei giorni con attività (DM totali > 0 o conversazioni > 0), ma il salvataggio non si blocca mai: finché ne manca una, quel giorno dice "Da completare" **solo al setter, sul suo report** (`commentoDaCompletare`), e il bollino porta alle domande. Un report creato prima del 30/09/2026 (`created_at`, `COMMENTO_CHIESTO_DAL`) non lo dice mai: si può rispondere, nessuno lo chiede. Mai un elenco o un conteggio dei giorni incompleti per l'admin, nessun avviso, nessun promemoria (sezione 17). Nei fogli dell'admin in Setting le stesse domande sono tutte facoltative.

Il setter crea un lead **solo quando fissa una call**, non per ogni DM. I volumi dei DM vivono nel report giornaliero.

Lo stato del lead è la **pipeline**: lo aggiornano a mano setter e closer con un tocco (Call da fare → Follow-up → Cliente / Perso; lo stato `call_fissata` si mostra come "Call da fare"). Nessun trigger lo cambia da solo (decisione di Dany, 26/09/2026).

### Call

```
calls
  id, lead_id -> leads, setter_id -> profiles, closer_id -> profiles,
  tipo enum call_type (discovery, strategy),
  programmata_il timestamptz,
  stato enum call_status (programmata, svolta, no_show, cancellata, riprogrammata),
  qualificata bool null,            -- valorizzato solo se svolta
  esito enum call_outcome null (chiusa, follow_up, persa),  -- solo se svolta
  obiezione_principale text,        -- nell'app "Motivo di non chiusura"
  note text,                        -- "Note del setter"
  note_closer text null,            -- "Note aggiuntive" del closer, al massimo 2000 caratteri (30/09/2026)
  link_registrazione text null, performance enum call_performance null (buona, media, scarsa),
  prodotto_proposto_id -> products null

call_pitch                          -- tabella separata: il setter legge le call ma mai un importo
  id, call_id -> calls unique on delete cascade, importo_proposto numeric(12,2) >= 0
```

Campi presi dal foglio prospect di Dany (27/09/2026). Si creano con la RPC `fissa_call` (lead e call insieme, sempre discovery): il setter per sé; l'admin per sé (predefinito) o per un setter attivo (`p_setter_id`), anche per le call già fatte che nell'app mancano (29/09/2026); closer e altri ruoli no. La finestra di date la controlla il form (`lib/validation/call.ts`, contro gli errori di battitura): il setter da 7 giorni fa in avanti, l'admin fino a un anno indietro. Una call nel passato risulta prenotata alla sua ora (`created_at = least(now(), programmata_il)`, anche per il lead nato con lei): una call già fatta non conta mai come prenotata oggi. Si modificano con le RPC `modifica_call` (data, ora in Europe/Rome, tipo, closer, note del setter; chiamata dal closer lascia le note del setter come sono) e `dettagli_call` (closer e admin: link, performance, prodotto e importo proposti, note aggiuntive del closer).

**Esito e note: del closer** (Dany, 30/09/2026: "Solo il closer registra l'esito, e le note del closer non le può modificare il setter"). Stato, esito, qualificata, motivo di non chiusura (`obiezione_principale`) e `note_closer` li scrivono solo il closer della call e l'admin; il setter li legge sulle call che ha fissato. Il setter tiene: fissare la call (`fissa_call`), spostarla (`modifica_call` non tocca mai lo stato), riassegnare il closer, le sue note. RLS lavora per riga e il setter aggiorna le sue call, quindi le colonne le protegge il trigger `calls_esito_solo_closer` (sostituisce `calls_motivo_solo_closer`, che proteggeva solo il motivo): con `current_role() = 'setter'` rifiuta con 42501 un update che cambia stato, esito, qualificata, `obiezione_principale` o `note_closer`, e un insert con stato diverso da `programmata` o con uno di quei campi valorizzato. Admin, closer, service role, seed e import (nessuna sessione) non sono toccati. Due note distinte:
- `calls.note` = "Note del setter": le scrivono il setter, con la matita della call ("Nuova call" non ha il campo), e l'admin; il closer le legge e non le cambia (lo garantiscono il suo foglio e `modifica_call`: il database blocca solo il setter).
- `calls.note_closer` = "Note aggiuntive" del closer (la colonna del suo foglio prospect): le scrivono il closer, dal foglio dell'esito o dalla matita, e l'admin; il setter le legge e non le scrive mai.

Le "Note aggiuntive" importate dal foglio prospect di Dany (51 call, lead con nota «Importato dal foglio delle call») sono del closer: la migration le sposta in `note_closer` (Dany, 30/09/2026); le altre note salvate prima restano in `calls.note`. Il closer legge le note del setter e non le scrive mai (stesso trigger, Dany 30/09/2026); l'admin scrive tutto. `scripts/import-prospect.ts` scrive le "Note aggiuntive" del foglio in `note_closer` (oltre 2000 caratteri le taglia, con un avviso).

**Motivo di non chiusura** (Dany, 30/09/2026: "il closer deve inserire motivo di non chiusura sempre"; le obiezioni sul prezzo stanno qui, dal lato del closer). È la colonna `calls.obiezione_principale`, chiamata ovunque "Motivo di non chiusura": per una call svolta con esito `follow_up` o `persa` è obbligatorio (con spazi tolti, al massimo 500 caratteri) nello schema condiviso `esitoCallSchema` (`lib/validation/esito.ts`), che vale per il foglio dell'esito ("Le mie call", "Compila la giornata"), per la server action e per Alfire. Nello stesso foglio le "Note aggiuntive" del closer (`calls.note_closer`), facoltative. Un altro esito toglie il motivo. Nessun vincolo nel database: le call registrate prima restano modificabili senza motivo. Motivo e note stanno in `calls`, che il setter della call legge per riga (RLS): per questo il foglio dice di non scriverci importi, che restano in `call_pitch`.

### Clienti, prodotti, vendite, incassi

```
clients
  id, lead_id -> leads null, nome, cognome, email, telefono, instagram_handle,
  fonte lead_source, setter_id -> profiles null, closer_id -> profiles null,
  note, created_at
  -- stato NON è una colonna: si deriva dalle vendite (vedi v_client_status)

products
  id, nome, durata_mesi int, prezzo_listino numeric(12,2), attivo bool,
  piano_predefinito jsonb null   -- [{"mese":0,"importo":500}, ...]: il piano abituale
  -- es. "Percorso Alpha 3 mesi". Gestiti dall'admin in Impostazioni

sales
  id, client_id -> clients, product_id -> products null,
  prodotto_personalizzato text null,  -- percorso fuori catalogo; uno dei due è obbligatorio
  tipo enum sale_type (nuovo, rinnovo, upsell),
  call_id -> calls null, setter_id -> profiles null, closer_id -> profiles null,
  data_vendita date, data_inizio date, data_fine date,
  valore_contratto numeric(12,2), numero_rate int >= 1, note

payments
  id, sale_id -> sales on delete cascade, numero_rata int,
  scadenza date, importo_previsto numeric(12,2),
  incassato_il date null, importo_incassato numeric(12,2) null,
  metodo enum payment_method (bonifico, stripe, paypal, carta, contanti, altro) null,
  stato enum payment_status (prevista, incassata, fallita, rimborsata)
```

Regole:
- Alla creazione di una vendita il server genera automaticamente il piano rate (`numero_rate` rate mensili, importi uguali, l'ultima assorbe l'arrotondamento). L'admin può poi modificare ogni rata.
- In alternativa il piano si scrive a mano (`registra_vendita(..., p_rate jsonb)`): una riga per rata, con date e importi liberi (es. 3 × 500 € e, dopo una pausa, 3 × 333,33 €). La somma deve coincidere col contratto, lo verifica il database (`verifica_piano`). Se il prodotto ha un `piano_predefinito`, la nuova vendita parte da quello.
- L'admin aggiunge e toglie rate (`aggiungi_rata`, `elimina_rata`): le rate si rinumerano per scadenza.
- Una vendita `rinnovo` richiede che il cliente abbia già almeno una vendita precedente.
- Setter della vendita (`registra_vendita`, 29/09/2026): una vendita `nuovo` prende il setter della call o, senza call, quello del cliente; rinnovi e upsell hanno un setter solo se nascono da una call fissata, altrimenti nessuno (quindi nessuna provvigione). Il closer è quello della call o chi registra. Setter e closer restano modificabili dalla vendita; le vendite già registrate non sono cambiate.
- **Rinnovo** ("Ha rinnovato" nella scheda cliente, 29/09/2026): è una nuova vendita `rinnovo` col suo periodo e il suo contratto. Il form parte dal giorno dopo la fine dell'ultimo percorso (se è passato da più di 31 giorni, da oggi). L'inizio di una vendita cade da 31 giorni prima a 92 dopo la data di vendita (controllo del form contro gli errori di battitura); per un rinnovo firmato in anticipo fino a un anno dopo (confermato da Dany, 29/09/2026), con lo stesso prodotto se è ancora attivo e il suo prezzo o piano abituale; tutto si cambia. La vendita precedente non si tocca: resta con le sue date e i suoi incassi nello storico del cliente.
- Una rata è **in ritardo** se `stato = 'prevista'` e `scadenza < oggi`. Non è uno stato salvato, è calcolato.
- Al passaggio di una call a `esito = chiusa` l'app propone subito il form "Nuova vendita" precompilato (cliente dal lead, setter, closer, call_id), con data di vendita e inizio nel giorno della call (mai nel futuro): chiusa, cash e revenue stanno sulla stessa riga della giornata del closer. Da "Compila la giornata" la vendita salvata torna su quel giorno.

### Provvigioni e costi

```
commission_rules
  id, profile_id -> profiles, percentuale numeric(5,4),   -- 0.05 = 5%
  applica_a sale_type[],                                  -- default {nuovo}
  valida_dal date, valida_al date null

commission_payouts
  id, profile_id, periodo date (primo giorno del mese), importo numeric(12,2),
  pagato_il date, metodo payment_method, note

expenses
  id, data date, categoria enum expense_category (team, software, ads, formazione, altro),
  descrizione, importo numeric(12,2), ricorrente bool
```

Il setter di una vendita o di un cliente può essere anche l'admin, quando il cliente l'ha portato lui (Dany, 27/09/2026): l'admin non ha regole, quindi su quelle vendite non matura nessuna provvigione.

Una persona non ha mai due regole valide nello stesso giorno: un trigger rifiuta le date sovrapposte, perché la provvigione verrebbe contata due volte.

La provvigione matura **sull'incasso**, non sulla firma: per ogni `payment` incassato di una vendita con `setter_id`, provvigione = `importo_incassato * percentuale` della regola valida alla data d'incasso e applicabile al tipo di vendita. Un rimborso genera provvigione negativa nel mese del rimborso. Se Dany decide diversamente (provvigione anche sui rinnovi, o su revenue invece che su cash), si cambia solo `commission_rules`, non il codice; sui rinnovi però matura solo dove la vendita ha un setter (nata da una call, o setter messo a mano), perché dal 29/09/2026 rinnovi e upsell nascono senza.

### Audit

```
audit_log
  id, tabella, record_id, azione (insert, update, delete), utente_id,
  dati_prima jsonb, dati_dopo jsonb, created_at
```

Trigger su `sales`, `payments`, `commission_rules`, `commission_payouts`, `expenses`, `profiles`. Visibile solo all'admin. Serve a sapere chi ha cambiato un importo e quando.

## 9. Metriche: definizioni ufficiali

Tutte le metriche si calcolano in SQL (view `security_invoker` o funzioni RPC), mai sommando importi in JavaScript. Ogni metrica ha un test Vitest o pgTAP con dati noti. Denominatore zero: mostra "-", mai `NaN` o `Infinity`.

**Setting** (da `setter_daily_reports`, periodo selezionato; definizioni di Dany del 28/09/2026, spiegate nell'app da `lib/metriche/legenda.ts`)
- DM outbound = persone nuove a cui scriviamo noi per primi, contate una volta, il giorno del primo messaggio
- DM inbound = persone nuove che chiedono informazioni e a cui rispondiamo, contate una volta, il primo giorno
- Conversazioni = conversazioni attive (hanno risposto e abbiamo risposto di nuovo; una risposta il giorno dopo è una conversazione di quel giorno). Non entrano nei DM totali
- Follow up = solleciti a chi non risponde, senza divisione inbound/outbound
- DM totali = `dm_outbound + dm_inbound + follow_up`
- Tasso di conversazione = `conversazioni / DM totali`
- Call prenotate = `discovery_prenotate + strategy_prenotate`. Il setter fissa solo discovery call: con i lead non si fanno strategy call, il campo resta per lo storico e non si chiede più
- Discovery svolte e call qualificate non vengono più dal report (29/09/2026): svolte, qualificate e il tasso di qualificazione si contano dalle call (sotto), con l'esito registrato dal closer
- Prenotate da inbound / da outbound = call fissate dal setter nel giorno (per `calls.created_at`) con lead di fonte `dm_inbound` / `dm_outbound`: si leggono dalle call, non si compilano. Una call registrata dopo che si è tenuta conta nel suo giorno (sezione 8)
- Tasso di prenotazione = `call prenotate / call_proposte`
- DM per call prenotata = `DM totali / call prenotate`
- Lead in target e qualità delle conversazioni (30/09/2026, sezione 8) = per ogni livello, i giorni del periodo con quella risposta e la quota sui giorni che hanno risposto (`commenti_setter_periodo`, solo admin; 42501 per gli altri). Contano solo le risposte date: mai i giorni senza risposta

**Call** (da `calls`, per data di `programmata_il`)
- Call svolte = `stato = svolta`
- Show rate = `svolte / (svolte + no_show)`. Cancellate e riprogrammate escluse
- Tasso di qualificazione = `qualificate / svolte`
- Close rate = `esito chiusa / svolte`
- Close rate su qualificate = `esito chiusa / svolte qualificate`

**Economics**
- Cash incassato (mese) = somma `importo_incassato` con `incassato_il` nel mese, al netto dei rimborsi, di ogni tipo di vendita
- Cash in 4 parti (29/09/2026), che sommano sempre al cash incassato (`metriche_periodo`):
  - nuovi clienti del periodo = incassi delle vendite `nuovo` con `data_vendita` dall'inizio del periodo in poi (un acconto incassato prima della firma conta qui);
  - rate di clienti già entrati = incassi delle vendite `nuovo` con `data_vendita` prima del periodo;
  - rinnovi = incassi delle vendite `rinnovo`;
  - upsell = incassi delle vendite `upsell`.
  Il grafico dei 12 mesi (`cash_mensile`) ha le stesse 4 serie, mese per mese (nuovi clienti = vendite firmate da quel mese in poi).
- Revenue firmata (mese) = somma `valore_contratto` con `data_vendita` nel mese, di ogni tipo. Revenue nuovi clienti = la stessa somma sulle sole vendite `nuovo`
- Indicatori di acquisizione (29/09/2026), solo sui nuovi clienti del periodo: rinnovi, upsell e rate di clienti entrati prima non arrivano dai DM né dalle call
  - Cash per DM = cash dei nuovi clienti del periodo / DM totali
  - Revenue per DM = revenue nuovi clienti / DM totali
  - Cash per call svolta = cash dei nuovi clienti del periodo / call svolte
  - Valore medio nuovo cliente = revenue nuovi clienti / numero di vendite `nuovo` (sostituisce "Valore medio vendita")
- Da incassare = somma `importo_previsto` delle rate `prevista`. Suddiviso in: in ritardo, prossimi 30 giorni, oltre
- Clienti attivi = clienti con una vendita dove `oggi between data_inizio and data_fine`
- In scadenza = clienti attivi con `data_fine` dell'ultima vendita entro 30 giorni e nessuna vendita successiva
- Tasso di rinnovo (mese M) = clienti con `data_fine` nel mese M che hanno una vendita `rinnovo` con `data_vendita` entro 30 giorni dalla scadenza / clienti con `data_fine` nel mese M
- Provvigioni maturate (mese) = come da sezione 8
- Margine operativo (mese) = cash incassato - provvigioni maturate - costi del mese. Etichetta sempre "Margine operativo", mai "utile": le tasse non sono incluse

**Setter e closer giorno per giorno** (28/09/2026, le due metà del foglio Excel di Dany): la metà SETTER è il report di `setter_daily_reports`; la metà CLOSER si calcola, mai inserita due volte, dalle call (per giorno di `programmata_il`) e dalle vendite: call = svolte, qualificate = svolte e qualificate (una chiusa lo è sempre), no show, follow up (svolte con esito follow_up), cancellate, chiuse. Cash e revenue contano solo i clienti nuovi (29/09/2026): revenue = `valore_contratto` delle vendite `nuovo` per `data_vendita`; cash = la prima rata (`numero_rata = 1`, `stato = incassata`) delle vendite `nuovo`, sul giorno della vendita. Rate successive, rinnovi, upsell e rimborsi restano in Incassi, Panoramica e provvigioni: un rimborso della prima rata non abbassa il cash del closer (confermato da Dany, 29/09/2026). Il closer non compila contatori: la sua riga nasce dagli esiti che registra su ogni call ("Compila la giornata", sezione 10), senza tabelle nuove. `giornate_closer` (admin tutti, closer il proprio) e `giornate_setter` (il setter incrocia il suo setting con gli esiti delle sue call e i soldi dei clienti nuovi che ha portato) restituiscono un giorno per riga, solo i giorni in cui è successo qualcosa, più il totale (`data` null).

**Periodo** (28/09/2026): ogni metrica si chiede su un mese (`?mese=YYYY-MM`) o su un intervallo (`?da=&a=`), con le RPC `*_periodo`; le mensili sono wrapper con gli stessi risultati. Confronto: se il periodo è fatto di mesi interi, gli stessi mesi prima; altrimenti la finestra di pari giorni subito prima. Trimestre e anno "in corso" coprono il periodo solare intero. Le provvigioni restano mensili (i pagamenti si riferiscono a un mese).

**Aggiunte del 27/09/2026** (tutte in SQL, solo admin):
- Obiettivi del mese (`obiettivi_mese`, `avanzamento_obiettivi`): obiettivo di cash e di nuovi clienti; avanzamento = cash incassato del mese / obiettivo, vendite `nuovo` del mese / obiettivo.
- Previsione di cassa (`previsione_cassa`): per il mese corrente e i due successivi, rate `prevista` con scadenza da oggi in poi; per il mese corrente anche il già incassato. Le rate in ritardo stanno a parte, sul mese corrente.
- Per fonte (`metriche_per_fonte`): cash dei nuovi clienti del periodo (come sopra), quota su quel cash e clienti nuovi per `clients.fonte` (un cliente senza fonte sta in `altro`); lead, call svolte, chiuse e close rate per `leads.fonte`. Dal 29/09/2026 rate di clienti entrati prima, rinnovi e upsell non contano: le fonti sommano al cash dei nuovi clienti.

Stato cliente derivato (`v_client_status`): `attivo`, `in_scadenza`, `scaduto` (nessuna vendita attiva, l'ultima finita da meno di 90 giorni), `ex_cliente` (oltre 90 giorni), `mai_attivato`.

## 10. Schermate

Navigazione: sidebar su desktop, bottom bar su mobile (massimo 4 voci più "Altro"). Le voci dipendono dal ruolo.

### Admin

1. **Panoramica** (`/`). Selettore mese in alto (default mese corrente) con confronto col mese precedente.
   - Riga KPI: Cash incassato, Revenue firmata, Nuovi clienti, Rinnovi, Margine operativo. Ogni tile: valore grande, delta sul mese precedente con icona e segno (mai solo colore).
   - Sotto il cash, "Di cui" in 4 parti (29/09/2026, sezione 9): nuovi clienti del periodo, rate di clienti già entrati, rinnovi, upsell. "Oggi dal team" mostra l'incassato di oggi e, sotto, la parte dei nuovi clienti entrati oggi.
   - Grafico: cash incassato per mese, ultimi 12 mesi, barre impilate nelle stesse 4 parti (nuovi clienti / rate di clienti già entrati / rinnovi / upsell), con vista tabella.
   - Indicatori (cash e revenue per DM, cash per call svolta, valore medio nuovo cliente) e "Da dove arrivano i nuovi clienti" contano solo i nuovi clienti del periodo.
   - Funnel del mese: DM totali, conversazioni, call prenotate, call svolte, chiuse. Barre orizzontali con valore e tasso di passaggio.
   - Box "Da incassare": in ritardo (con elenco nominativo), prossimi 30 giorni.
   - Box "In scadenza": clienti che scadono nei prossimi 30 giorni, con azione "Registra rinnovo" (apre il rinnovo precompilato, come "Ha rinnovato").
1b. **Le mie call** (`/calls`): le call di cui è closer, con "Nuova call" (29/09/2026): l'admin fissa call come il setter, scegliendo il setter ("Io" predefinito, o un setter attivo) e anche una data passata, fino a un anno indietro (scorciatoia "Ieri"), per le call già fatte. Sempre discovery; il tipo si corregge dopo. Una call fissata con un altro closer si vede nella sua giornata (`/setting/closer/giorno`), dove porta il salvataggio. Nella matita della call l'admin scrive sia le note del setter sia le note aggiuntive del closer (30/09/2026).
2. **Vendite** (`/sales`): tabella filtrabile per mese, tipo, setter, closer. Dettaglio vendita con piano rate modificabile e azione "Segna rata incassata" (un tap, data di oggi precompilata).
3. **Clienti** (`/clients`): lista con stato derivato, filtri per stato. Scheda cliente: valore totale nel tempo (LTV), fonte, setter e "Storico percorsi" (29/09/2026): una scheda per vendita, dalla più recente (Primo percorso, Rinnovo 1, 2…, Upsell), con prodotto, date, stato (Da iniziare, In corso, Concluso, Interrotto), contratto, incassato e da incassare, rate con "Segna incassata" e link alla vendita. "Ha rinnovato" apre la nuova vendita `rinnovo` precompilata (sezione 8): salvata, torna alla scheda, il nuovo periodo compare in cima e quello vecchio resta sotto. Lo stato non si spegne a mano: per chi smette prima c'è "Interrompi il percorso" (`interrompi_percorso`, solo admin), che chiude la vendita in corso nel giorno scelto e, se si sceglie, toglie le rate non pagate dopo quel giorno abbassando il contratto; l'anteprima dice cosa cambia prima della conferma e gli incassi non si toccano. Eliminare un cliente toglie anche vendite e incassi (sezione 19).
4. **Incassi** (`/payments`): tutte le rate, filtro per stato e mese, vista "in ritardo" in evidenza. Ogni riga dice tipo e rata ("Primo percorso · Rata 2 di 4", "Rinnovo · Rata 2 di 2", le stesse parole dello storico del cliente). In cima la previsione di cassa dei prossimi 3 mesi. Sulle rate da pagare, "Scrivi su WhatsApp" apre la chat del cliente col promemoria già scritto (`lib/whatsapp.ts`): l'app non invia niente da sola.
4b. **Rinnovi** (`/rinnovi`): chi finisce il percorso entro 30 o 60 giorni e chi l'ha finito da meno di 90 senza rinnovo, con WhatsApp e "Registra rinnovo"; in cima il tasso di rinnovo del mese.
5. **Setting** (`/setting`): due schede, Setter e Closer. Setter: metriche setting e call per periodo e per setter, tabella dei report giornalieri. "Aggiungi giornata" registra un giorno intero per un setter o per l'admin stesso; un giorno che c'è già si corregge dalla sua riga, mai sovrascritto. Closer (`/setting/closer`): i numeri del periodo e la tabella giorno per giorno con le colonne CLOSER dell'Excel; ogni giorno apre la sua giornata. **Compila la giornata** (`/setting/closer/giorno`, 29/09/2026): la riga del giorno (da `giornate_closer`) e sotto le call del giorno con i bottoni dell'esito di "Le mie call"; frecce e calendario per cambiare giorno. La riga si compila dagli esiti: nessun contatore a mano, nessuna tabella nuova. L'admin sceglie il closer e con "Aggiungi una call" registra una call fatta che nell'app non c'è (Nuova call su quel giorno, poi si torna lì).
   **Per il marketing: cosa dicono i lead** (30/09/2026), sotto la scheda Setter, per periodo e con il filtro per setter (tutti o uno, mai affiancati). "Dal setting": per le due scale i giorni per livello e la quota (sezione 9), poi i giorni con qualcosa di scritto, dal più recente, con le sole risposte date. "Dalle call": le call svolte finite in Follow-up o Persa con il motivo di non chiusura o le note aggiuntive del closer (mai le note del setter), dal più recente (`motivi_non_chiusura_periodo`, solo admin; con un setter scelto, le call fissate da lui). Si vedono i 200 più recenti, e la sezione lo dice. Ognuna delle due parti ha il suo stato vuoto; nessun confronto tra persone, nessun "Da completare". "Aggiungi giornata" e la correzione di un report hanno le stesse domande del setter, facoltative.
6. **Provvigioni** (`/commissions`): per setter e mese, maturato, pagato, saldo. Registrazione pagamento. Sotto, "Per cliente": percentuale, incassato e provvigione di ogni vendita (`provvigioni_per_vendita`, solo admin); la stessa riga compare nella scheda della vendita.
7. **Costi** (`/expenses`): inserimento e lista.
8. **Impostazioni**: Team (sezione 7), Prodotti, Regole provvigioni, Esporta CSV (vendite, incassi, costi per mese: serve alla commercialista).

### Setter (mobile first, è la sua schermata principale)

1. **Oggi** (`/today`): il report del giorno in una sola schermata. Frecce e "Un altro giorno" aprono qualsiasi giorno passato da compilare o correggere. Ogni campo numerico è uno stepper con bottoni grandi (+1, +5, -1) e input diretto. Salvataggio automatico con debounce e stato visibile ("Salvato alle 18:42"). Se il report di oggi non esiste si crea al primo tocco. Nessun bottone "invia" da ricordarsi. Non chiede discovery svolte né call qualificate: le registra il closer su ogni call. Sotto le conversazioni, prima delle call, **"Com'è andata la giornata"** (30/09/2026, sezione 8): lead in target e qualità delle conversazioni con un tocco (un secondo tocco toglie la scelta), ogni livello con la sua definizione sotto, poi cosa frenava i lead, domande e contenuti e altre note, facoltativi; tutto si salva da solo come i numeri. Nei giorni con DM o conversazioni, finché manca una delle due risposte, la barra del salvataggio mostra "Da completare", che porta alle domande.
2. **Nuova call** : form corto: nome lead, handle Instagram, fonte (da scegliere ogni volta: conta le prenotate da inbound e da outbound), data e ora (da 7 giorni fa in avanti), closer (default Dany). Il setter fissa solo discovery call. Crea lead e call insieme. La stessa schermata serve all'admin, con in più la scelta del setter e un anno di date passate (Admin, 1b).
3. **Le mie call**: lista con stato ed esito; il motivo di non chiusura scritto dal closer (sulle call svolte finite in Follow-up o Persa) e le note aggiuntive del closer, in sola lettura e al massimo 2 righe sulla scheda, così sa perché i suoi lead non hanno chiuso. Nessun bottone dell'esito: l'esito lo registra solo il closer (30/09/2026). La matita sposta la call (data e ora), cambia il closer e ha un solo campo da scrivere, "Note del setter"; sotto, motivo e note aggiuntive del closer da leggere per intero.
4. **I miei numeri**: metriche del periodo proprie, provvigioni maturate e pagate, "Giorno per giorno" (il suo setting accanto agli esiti del closer sulle call che ha fissato, e cash e revenue dei clienti nuovi che ha portato, sezione 9) e "I tuoi clienti": per ogni vendita dove è il setter (clienti nuovi: rinnovi e upsell nascono senza setter), revenue, pagato, rate e la sua provvigione per incasso (sezione 6).

Obiettivo misurabile: il report giornaliero si compila in meno di 60 secondi dal telefono.

### Closer

1. **Le mie call**: di oggi e prossime. Aggiornamento esito in massimo 3 tap. Se `chiusa`, apre "Nuova vendita" precompilata. Se Follow-up o Persa (30/09/2026, sezione 8): "Perché non ha chiuso?", il motivo di non chiusura è obbligatorio (senza, il tocco su Sì o No non salva e la riga sotto dice cosa manca), le sue note aggiuntive (`note_closer`) facoltative; poi "Era qualificata?" salva. Il foglio non supera mai lo schermo: scorre. La scheda della call mostra il motivo e le note del setter. Nella matita ("Com'è andata": link, performance, prodotto e importo proposti, note aggiuntive) le note del setter sono in sola lettura (30/09/2026); si apre sempre sui valori salvati, anche subito dopo un esito, così salvare il solo link non cancella le note.
2. **Le mie vendite**: sola lettura più registrazione incasso delle proprie vendite.
3. **I miei numeri** (`/setting/closer`): la propria giornata da closer, giorno per giorno, e "Compila la giornata" per registrare gli esiti di un giorno (senza "Aggiungi una call": le call le fissano setter e admin).

### Stati obbligatori per ogni schermata

Caricamento (skeleton, non spinner a tutto schermo), vuoto (messaggio più azione primaria), errore (messaggio umano più riprova), successo (toast breve). Nessuna schermata esce senza tutti e quattro.

### Aggiornamento dei dati

- Le pagine con dati economici sono dinamiche (nessuna cache statica). Dopo ogni server action: `revalidatePath` delle pagine coinvolte.
- Nella Panoramica admin, sottoscrizione Supabase Realtime a `setter_daily_reports`, `calls`, `payments`: all'arrivo di un evento, `router.refresh()`. Dany vede i numeri di Loris aggiornarsi senza ricaricare.
- Supabase Storage serve solo per le foto profilo (bucket `avatari`, sezione 20). Contratti o ricevute entreranno solo se si decide di allegarli.

## 11. Design system

Tema scuro, unico tema nella v1. Sobrio, denso di informazione, nessun effetto decorativo. Riferimento di tono: strumento finanziario professionale, non app fitness.

### Momento di brand (deciso da Dany il 26/09/2026)

Unica eccezione alla sobrietà, confinata all'ingresso: chi entra deve essere colpito dal brand, chi lavora deve vedere i numeri.

- **Login**: logo Percorso Alpha (`public/brand/percorso-alpha.webp`) animato, con glow pulsante e fuoco/braci attorno.
- **Dopo il login**: intro di circa 1,5 s, una volta per sessione, saltabile con un tocco, poi la dashboard.
- **Shell**: logo piccolo con glow leggero nella sidebar (desktop) e nella top bar (mobile).
- **Schermate dati**: restano sobrie. Nessuna animazione decorativa vicino ai numeri.
- `prefers-reduced-motion`: nessuna animazione, logo statico, intro saltata.
- I colori del fuoco sono token (`--brand-fire-*`) in `globals.css`, mai hex sparsi nei componenti.
- La regola "un solo elemento oro per schermata" vale per le schermate dati; login e intro ne sono escluse.
- **Fiamma di Alfire** (deciso da Dany il 27/09/2026): piccola fiamma nei colori `--brand-fire-*` in alto a destra della shell. Ferma a riposo, si anima solo al passaggio del mouse o al focus; con `prefers-reduced-motion` resta ferma.

### Token

```css
--alpha-bordeaux:       #7A1F2B;   /* azioni primarie, stato attivo */
--alpha-bordeaux-light: #9B3040;   /* hover primario */
--alpha-gold:           #C9A227;   /* solo accenti e valori evidenziati, mai superfici */
--alpha-bg:             #121214;
--alpha-surface:        #1C1C1E;
--alpha-surface-2:      #242427;
--alpha-border:         #2E2E31;
--alpha-text:           #F2F0EC;
--alpha-text-muted:     #8A8A8F;

/* Serie grafici, validate per tema scuro su #1C1C1E (banda di luminosità, croma, separazione daltonismo, contrasto >= 3:1) */
--chart-nuovo:   #C4515F;
--chart-rate-precedenti: #824ACA;   /* rate di clienti già entrati (29/09/2026) */
--chart-rinnovo: #B08A1C;
--chart-upsell:  #4F8FD1;

/* Stato: sempre con icona e testo, mai solo colore, mai usati come serie */
--status-ok:       #4CAF7A;
--status-warning:  #E0A43A;
--status-critical: #E5484D;
```

Mappa i token nelle variabili CSS di shadcn (`--primary`, `--background`, `--card`, ecc.), non usare colori hard-coded nei componenti.

### Regole

- Font: Geist Sans (o Inter). Numeri sempre `font-variant-numeric: tabular-nums`, allineati a destra nelle tabelle.
- Importi formattati con `Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })`. Date `dd/MM/yyyy`, mese "settembre 2026".
- Spaziatura su griglia di 4px. Raggio: 8px card, 6px controlli.
- Mobile first: layout progettato a 390px, poi esteso. Target di tocco minimo 44x44px. Nessuno scroll orizzontale della pagina; le tabelle larghe diventano liste di card sotto 768px.
- Grafici: un solo asse y, mai doppio asse. Colore della serie legato all'entità (nuovo è sempre `--chart-nuovo`), mai al rango. Legenda sempre presente con 2 o più serie. Tooltip al passaggio o al tocco. Barre sottili con 2px di spazio tra segmenti impilati. Griglia e assi recessivi (`--alpha-border`). Il testo dei valori usa i colori del testo, mai il colore della serie. Ogni grafico ha una vista tabella alternativa.
- Contrasto testo WCAG AA minimo.
- Oro: massimo un elemento oro per schermata (il numero più importante).

## 12. Agenti Claude Code

Crea questi tre subagent in `.claude/agents/` al primo avvio e il comando `.claude/commands/design-loop.md`. Il contenuto è quello riportato qui sotto, alla lettera.

### `.claude/agents/app-builder.md`

```markdown
---
name: app-builder
description: Sviluppa funzionalità di Alpha Economics seguendo CLAUDE.md. Usalo per migration, policy RLS, server action, pagine e componenti funzionali, test. Non fa rifinitura grafica.
model: inherit
---
Sei lo sviluppatore principale di Alpha Economics. CLAUDE.md è la specifica: rispettala alla lettera.

Metodo:
1. Prima di scrivere codice, elenca i file che toccherai e perché.
2. Database: ogni modifica è una nuova migration in supabase/migrations. Mai modificare migration già applicate. Ogni tabella nuova nasce con RLS abilitata e policy esplicite, e con test pgTAP in supabase/tests.
3. Ogni view è `with (security_invoker = true)`. Ogni funzione `security definer` ha `set search_path = ''`.
4. Importi e metriche si calcolano in SQL. In TypeScript solo formattazione.
5. Usa solo i token del design system. Nessun colore hard-coded.
6. Ogni schermata ha stati di caricamento, vuoto, errore, successo.
7. Prima di dichiarare finito: `npm run typecheck`, `npm run lint`, `npm run test`, `supabase test db` tutti verdi.
8. Chiudi con: cosa hai fatto, come verificarlo a mano in 3 passi, commit proposto. Non fare commit senza conferma.
```

### `.claude/agents/ui-critic.md`

```markdown
---
name: ui-critic
description: Critico grafico di Alpha Economics. Usalo dopo ogni modifica visibile per valutare le schermate da screenshot reali. Non modifica mai il codice.
tools: Read, Glob, Grep, Bash
model: inherit
---
Sei un product designer senior specializzato in dashboard finanziarie e app mobile. Giudichi, non modifichi. Non usare mai Edit o Write.

Metodo:
1. Esegui `npm run shots` (l'app deve girare in locale). Genera screenshot a 390px e 1440px di ogni pagina in `.shots/`.
2. Apri ogni screenshot con Read e guardalo davvero.
3. Valuta contro la sezione 11 di CLAUDE.md e contro questa checklist: gerarchia visiva (il numero più importante si vede per primo?), allineamento e griglia 4px, densità, contrasto, target di tocco 44px su mobile, numeri tabellari allineati a destra, formato euro e date italiane, regole dei grafici (asse unico, legenda, colori per entità, testo non colorato), stati vuoto, caricamento ed errore, coerenza tra pagine, uso dell'oro (massimo uno per schermata), scroll orizzontale su mobile.
4. Consegna al massimo 10 punti, ordinati per impatto. Ogni punto: schermata e viewport, problema osservato, perché conta per l'utente, correzione precisa (componente, classe o token), gravità (alta, media, bassa).
5. Se una schermata è già buona, dillo in una riga e non inventare problemi.
```

### `.claude/agents/ui-refiner.md`

```markdown
---
name: ui-refiner
description: Applica le correzioni grafiche indicate da ui-critic su Alpha Economics. Tocca solo presentazione, mai logica, dati o permessi.
model: inherit
---
Applichi le correzioni ricevute dal critico, una per una.

Confini rigidi:
- Puoi modificare: componenti in components/, markup e classi nelle pagine, token e stili globali, configurazione Tailwind e shadcn.
- Non puoi modificare: supabase/ (migration, policy, test), server action, query, schemi Zod, logica di calcolo, auth. Se una correzione lo richiede, fermati e segnalalo.

Metodo:
1. Per ogni punto: applica la correzione minima che lo risolve.
2. Dopo tutte le modifiche: `npm run typecheck`, `npm run lint`, `npm run shots`.
3. Riporta punto per punto: applicato, applicato in parte (perché), non applicato (perché).
```

### `.claude/commands/design-loop.md`

```markdown
Esegui il ciclo di design su: $ARGUMENTS (se vuoto, tutte le pagine).
1. Verifica che l'app giri in locale su http://localhost:3000, altrimenti avviala in background.
2. Lancia il subagent ui-critic sulle pagine indicate.
3. Mostrami l'elenco dei punti e chiedimi quali approvare.
4. Lancia il subagent ui-refiner con i soli punti approvati.
5. Rilancia ui-critic una seconda volta. Massimo 2 giri, poi fermati e riassumi cosa resta aperto.
```

## 13. Screenshot e dati di prova

- Script `npm run shots`: Playwright, login con utente seed (admin, setter, closer), visita ogni pagina del ruolo, salva `.shots/<ruolo>-<pagina>-<390|1440>.png`. `.shots/` è in `.gitignore`.
- `supabase/seed.sql`: tre utenti di prova (admin, setter, closer), 3 prodotti, 6 mesi di dati realistici (report giornalieri, 40 call, 20 clienti, vendite nuove e rinnovi, rate incassate, in ritardo e future, costi). Dati inventati, nessun dato reale nel seed.
- `supabase/seeds/*.sql`: dati demo per funzione, caricati dopo `seed.sql` (`10_progetti.sql`: utenti coach e editor, progetti; `20_tempo_note.sql`: tempo e note). Stesse regole: solo dati inventati.

## 14. Import dello storico Excel

Script una tantum `scripts/import-excel.ts` (lanciato in locale contro il database, con `SUPABASE_SECRET_KEY`), idempotente:
- fogli mensili, colonne I-Q (sezione SETTER) -> `setter_daily_reports` del setter indicato da argomento. Righe con tutte le celle vuote o a zero: saltate;
- colonne S-Z (sezione CLOSER): non si importano come righe, perché sono totali giornalieri senza cliente. Lo script produce `import/vendite-da-completare.csv` con una riga per ogni giorno con `CLOSES > 0` (data, cash, revenue) e le colonne vuote `cliente_nome`, `cliente_cognome`, `prodotto`, `numero_rate`, che Dany compila a mano;
- un secondo passaggio legge il CSV compilato e crea clienti, vendite e rate incassate;
- foglio "Setter Payments" -> `commission_payouts`. Il foglio non dice a quale mese si riferisce un pagamento: si attribuisce al mese più vecchio non ancora coperto dal cash (decisione delegata da Dany, 27/09/2026). Se il setter non ha regole, lo script crea quella del foglio (5% sulle vendite nuove dal primo mese).
Lo script stampa un riepilogo (righe lette, create, saltate) e si può rilanciare senza duplicare. Colonne del CSV: `data, cash, revenue, cliente_nome, cliente_cognome, prodotto, numero_rate, tipo, da_setter, metodo`; `da_setter` (sì/no) decide la provvigione, `numero_rate` deve far coincidere il cash del giorno con le prime rate. Con `--segnaposto` il CSV nasce già compilato con clienti segnaposto da correggere poi nell'app: i dati dell'Excel servono da base, non sono lavoro di data entry (Dany, 27/09/2026).

## 15. Operatività

- **Un solo cron** (`vercel.json`, ogni giorno alle 18 UTC): `/api/cron/giornaliero` (protetta da `CRON_SECRET`). Le sue query tengono sveglio Supabase Free (che si ferma dopo 7 giorni senza richieste); manda agli admin il riepilogo serale (`riepilogo_serale`, solo `service_role`: cash del giorno, incassi, vendite, rate in ritardo, totali del team, nessun nome di chi ha compilato o no); il lunedì aggiunge il backup. `/api/cron/keep-alive` e `/api/cron/backup` restano chiamabili a mano.
- **Backup**: il piano Free non ha backup. Ogni lunedì sera il cron giornaliero lo manda (protetta da `CRON_SECRET`): tutte le tabelle di `public` (`backup_completo()`, solo `service_role`, legge lo schema al momento: una tabella nuova non si dimentica) più gli account, in un `.json.gz` mandato via email (Resend) agli admin attivi. Lo stesso file si scarica da Impostazioni › Esporta. Ripristino: `npm run backup:sql -- <file> ripristino.sql`, poi il file nel SQL Editor di Supabase: una transazione, trigger spenti, solo le righe mancanti (provato: cancellate vendite, rate, costi e report, tornano identiche). Quando l'app diventa l'unica fonte dei dati economici, passare comunque a Supabase Pro.
- **GDPR**: dati dei clienti ridotti al minimo (nome, contatti, handle). Regione EU. Nessun dato sanitario in questa app.

## 16. Piano di lavoro

Lavora una fase alla volta. A fine fase: tutti i controlli verdi, istruzioni di verifica manuale per Dany, stop. Non iniziare la fase successiva senza conferma.

**Fase 1: Fondamenta.** Scaffold Next.js con Tailwind e shadcn, token del design system, struttura cartelle, client Supabase, Supabase locale (`supabase init`, `supabase start`), migration di tutto lo schema (sezione 8), RLS completa, test pgTAP dei permessi (sezione 6), trigger inviti, login Google, dev login locale, app shell con navigazione per ruolo, seed, keep-alive, file agenti (sezione 12). Verifica: login in locale con i tre utenti seed, ognuno vede solo la sua navigazione, `supabase test db` verde.

**Fase 2: Inserimento dati.** Schermata Oggi del setter, Nuova call, Le mie call, aggiornamento esito del closer, flusso call chiusa -> nuova vendita con piano rate, registrazione incasso, clienti, prodotti, costi. Poi `/design-loop`. Verifica: Dany compila un report dal telefono in meno di 60 secondi.

**Fase 3: Dashboard.** View e RPC delle metriche (sezione 9) con test, Panoramica admin, Setting, Incassi, Provvigioni, I miei numeri del setter, Realtime. Poi `/design-loop`. Verifica: i numeri della Panoramica coincidono con un calcolo a mano sul seed.

**Fase 4: Gestione utenti e impostazioni.** Pagina Team, regole provvigioni, export CSV, audit log visibile. Verifica: invito a un secondo account Google, login, cambio ruolo, disattivazione.

**Fase 5: Deploy e dati reali.** Deploy su Vercel, migration sul progetto Supabase cloud, import Excel (sezione 14), invito di Loris. Verifica: Loris compila il suo primo report reale dal telefono.

## 17. Regole di lavoro

- Lingua dell'interfaccia: italiano, con accenti corretti. Codice, nomi di file e commit: inglese; nomi di tabelle e colonne: italiano come in questo file.
- Commit piccoli e verificabili, formato Conventional Commits.
- Dany è sviluppatore: niente spiegazioni di base, vai al punto.
- Se una scelta non è coperta da questo file, proponi un'opzione con il motivo in una riga e chiedi conferma. Non decidere da solo su permessi, calcoli economici o schema.
- Mai funzioni di sorveglianza dei collaboratori (tracking automatico, screenshot, alert su chi non compila). Il report giornaliero è auto-dichiarazione dei risultati, non monitoraggio.
- Ogni deploy aggiunge una voce in `lib/changelog/versioni.ts` e aggiorna la versione in `package.json` (sezione 23).

## 18. Project management (area Progetti)

Chiesto da Dany il 27/09/2026. Schema in `20260928090000_project_management.sql` e successive.

- **Scopo** (Dany, 27/09/2026): strumento semplice per tracciare il tempo per task, progetto e cliente, e assegnare task al team; il lavoro sui clienti vero e proprio sta su Coach Plus. Struttura ispirata a Zoho Projects, ma essenziale.
- **Struttura**: reparto → progetto → liste (milestone, con date) → task → sotto-task (un livello). Reparti di partenza: Fitness Coaching, Contenuti e Video, Vendite e Marketing, Amministrazione. Un progetto può puntare a un cliente di `clients` (mai duplicato): lo collega solo l'admin dell'app, e solo nei reparti con `progetti_con_cliente` (di partenza solo Fitness Coaching, dove il progetto è il cliente: scelto il cliente, il nome si compila da solo). Un trigger rifiuta il cliente negli altri reparti e lo spegnimento del flag finché ci sono progetti con cliente.
- **Schede del progetto**: Panoramica (prima: avanzamento, task per stato, in ritardo, tempo speso, tappe, prossime scadenze; conteggi da `pm_panoramica_progetto`), Attività (`/attivita`), Gantt, Tempo, Note, Membri. Un progetto appena creato si apre sulle Attività.
- **Più assegnatari** (Dany, 29/09/2026): un task può essere assegnato a più persone, tutte membri del progetto (`pm_task_assegnatari`, `v_pm_task.assegnatari`); ognuna lo vede nei suoi task e lo lavora come l'autore; chi esce dal progetto perde i suoi incarichi lì.
- **I miei task** (`/task`): i task assegnati a me in tutti i progetti, per scadenza (In ritardo, Oggi, Prossimi 7 giorni, Più avanti, Senza scadenza), con spunta e sveglia. È la pagina d'arrivo di coach, editor, nutrizione e dev.
- **Modelli**: ogni reparto ha modelli di progetto; creando un progetto da un modello si aprono liste e task datati dall'inizio del progetto. "Percorso cliente" (Fitness Coaching): questionario iniziale, invio accessi, call di onboarding, scrittura programmazione, assistenza chat, revisione video settimanale, call di check, aggiornamento programmazione, call e aggiornamento di metà percorso, call di rinnovo, raccolta feedback e testimonianza. Si modificano in Impostazioni > Progetti.
- **Livelli** (`profiles.livello_pm`, separati dal ruolo): `admin` tutto; `manager` crea progetti e gestisce quelli di cui è membro (liste, task, membri, dati del progetto); `employee` vede i progetti di cui è membro, aggiunge task, lavora quelli assegnati a lui o creati da lui. L'admin dell'app è sempre admin dei progetti. Il livello si cambia in Team.
- **Tempo**: auto-dichiarato, mai automatico. Timer (uno acceso per persona, sincronizzato in tempo reale tra i dispositivi) o minuti caricati dopo, mai nel futuro. Si avvia con la sveglia accanto a ogni task; acceso, resta in alto a destra accanto ad Alfire su ogni pagina (sveglia, tempo che scorre, task) e fermandolo, lì o dal task, chiede una nota (27/09/2026). Ognuno vede il proprio; chi gestisce un progetto vede il tempo speso sul progetto; l'admin tutto. Nessuno vede il timer acceso di un altro, nessun elenco di chi non ha registrato, nessun avviso (§17).
- **Fascia oraria facoltativa** (Dany, 29/09/2026): il tempo caricato dopo è la durata oppure «Dalle–Alle» nel suo giorno, e allora i minuti li calcola il database dalla fascia (`pm_registra_tempo`, `pm_modifica_tempo`: inizio e fine in Europe/Rome, cambi d'ora compresi; nel modulo la durata diventa di sola lettura). Vale nel modulo di `/tempo`, nella scheda Tempo del progetto, correggendo una voce (la fascia si aggiunge, si cambia o si toglie; togliendola restano i minuti) e da Alfire. Una fascia scritta a mano finisce dopo l'inizio, mai nel futuro, nello stesso giorno, dura al massimo 24 ore e conta nelle 24 ore del giorno. Un timer fermato senza una fascia di un giorno (a cavallo della mezzanotte, dentro lo stesso minuto, nella notte del cambio d'ora) tiene inizio e fine finché giorno e durata restano; cambiandoli resta solo la durata, e il foglio di modifica lo dice. Con una sessione il timer lo decide l'orologio (`pm_tempo_coerenza`): parte adesso, il suo inizio non si sposta, si ferma adesso e una voce ferma non torna accesa; il giorno è sempre quello dell'inizio.
- **Tempo del team** (Dany, 29/09/2026): in Tempo (per l'admin la voce del menu si chiama così) l'admin ha due schede, «Il mio tempo» e «Team» (`/tempo/team`); gli altri ruoli vedono solo «Il mio tempo», senza schede. Team: periodo (di default il mese corrente) e filtri per persona e per progetto; il totale del team, poi una scheda per persona col suo totale, per progetto e task, e le voci del periodo (giorno, fascia se c'è, durata, nota, progetto › task), al massimo 100 per persona. Tutto dalla RPC `pm_tempo_per_persona` (`security invoker`, rifiuta con 42501 chiunque non sia l'admin dell'app, manager dei progetti compresi). Limiti (§17): solo il tempo già dichiarato, mai il timer acceso di un altro; compaiono solo le persone con tempo nel periodo, nessun elenco di chi non ha registrato; persone in ordine alfabetico, mai ordinate per ore, nessuna classifica, nessun grafico che confronti le persone, nessun avviso.
- **Note**: per progetto, con una data, mostrate raggruppate per giorno.
- **Gantt**: liste e task sulla scala del tempo, con vista tabella. Serie `--gantt-lista` e `--gantt-task`, validate sul tema scuro.
- Avanzamento e ritardi si calcolano in SQL (`v_pm_progetti`, `v_pm_tasklist`, `v_pm_task`, `security_invoker`); totali del tempo con RPC `security invoker`.

## 19. Pieno controllo dell'admin

Deciso da Dany il 27/09/2026: l'admin può correggere ed eliminare ogni riga di ogni sezione.

- Si elimina sempre dal fondo della scheda di modifica (o con l'icona cestino in una riga), con il componente `components/form/elimina.tsx`. Il primo tocco apre una domanda che dice cosa si porta dietro; solo il secondo elimina.
- Le conseguenze si contano in SQL (`anteprima_eliminazione(tipo, id)`, solo admin); `lib/eliminazione.ts` le mette in parole.
- Cosa succede: un cliente porta con sé vendite e rate; una vendita porta con sé le rate; un lead porta con sé le call, mentre il cliente nato da lui resta; un prodotto eliminato lascia il suo nome nelle vendite passate (`prodotto_personalizzato`); un reparto con progetti non si elimina, i suoi modelli sì; una regola provvigionale eliminata toglie le provvigioni maturate con lei, anche nei mesi passati (per smettere da una data si usa "Chiudi").
- Le RPC di eliminazione sono `security definer` e verificano `is_admin()`.

## 20. Alfire e profilo utente

Chiesto da Dany il 27/09/2026.

**Alfire** è l'assistente AI del team: fiamma in alto a destra (desktop "Chatta con Alfire", mobile solo icona), pannello laterale con chat, vocale, suggerimenti per ruolo e risposte a un tocco.

- **Modello**: open source. Groq, `openai/gpt-oss-120b`; voce con Whisper sullo stesso account. Il piano lo dice Groq stesso (`pianoAlfire`, 29/09/2026): ogni risposta porta `x-ratelimit-limit-tokens`, e da 100K token al minuto in su Alfire lavora da agente pieno; basta passare al Developer su console.groq.com, niente da cambiare su Vercel (`ALFIRE_PIANO` = `developer` o `gratuito` lo forza). Gratuito (1.000 richieste e 200k token al giorno, 8k token al minuto) = storia di 8 messaggi, 6 passi, risposte fino a 1.200 token, e gli strumenti di scrittura solo se la conversazione (non solo l'ultimo messaggio) chiede di scrivere (`conversazioneScrive`); con tutte le scritture, però, gli strumenti dell'admin (circa 7.400 token) più prompt e risposta non stanno negli 8k al minuto: per scrivere da Alfire serve il Developer (o `ALFIRE_PIANO=developer`); `developer` (a consumo: 0,15 $ per milione di token in entrata, 0,075 $ se in cache, 0,60 $ in uscita; Whisper 0,04 $ all'ora; limiti 250K token al minuto) = agente pieno: tutti gli strumenti del ruolo sempre, 30 messaggi, 10 passi, risposte fino a 4.000 token. Una chiamata a uno strumento che Groq rifiuta si riprova da sola due volte; ogni risposta scrive nei log di Vercel i token usati (`[alfire] token`), mai il contenuto. Se Alfire legge e si ferma senza rispondere, la chat lo dice con «Riprova». Il codice parla il formato OpenAI (`lib/alfire/config.ts`): si cambia fornitore o modello solo con le variabili `ALFIRE_*`, anche verso un modello cinese (Qwen su Groq, GLM su z.ai).
- **Privacy**: domande, dati letti e vocali passano dai server del fornitore (Groq: USA). Nessun audio salvato, la chat vive solo finché l'app è aperta (nessuna tabella). Detto in Profilo › Alfire.
- **Permessi**: Alfire lavora con la sessione di chi chatta: RLS e le stesse server action dei form, validate dagli stessi schemi Zod; mai una strada di scrittura nuova, mai il client admin. In più riceve solo gli strumenti del suo ruolo e, dentro ogni strumento, solo le azioni che l'app offre a quella persona (`lib/alfire/permessi.ts`, `STRUMENTI` e `AZIONI`, testato con elenchi fissati): nessun collaboratore riceve strumenti su soldi dei clienti, costi, margine o compensi altrui; unica eccezione, quella della sezione 6: il closer registra gli incassi delle sue vendite.
- **Letture**: numeri del periodo (con il cash in 4 parti e gli indicatori sui soli nuovi clienti, sezione 9), cash per mese, da incassare, clienti, vendite con incassato e da incassare, setting, provvigioni con regole e pagamenti, costi (admin); cosa dicono i lead per il marketing (admin, `commenti_marketing`, 30/09/2026: le scale per livello, i giorni con qualcosa di scritto e i motivi di non chiusura con le note aggiuntive del closer del periodo, solo ciò che è stato risposto e scritto, i 60 più recenti); i miei numeri (setter); call con lo stato del lead, il motivo di non chiusura, le note del setter e le note aggiuntive del closer, ognuna col suo nome (note tagliate a 300 caratteri, 30/09/2026); progetti, dettaglio di un progetto, i miei task e il mio tempo (sempre e solo il proprio); guida della dashboard (`lib/alfire/guida.ts`, letta solo quando serve per risparmiare token).
- **Scritture**: in chat tutto ciò che l'app permette a quella persona, con le esclusioni sotto; uno strumento per entità con la sua `azione`, in `lib/alfire/scritture/`:
  - admin: `cliente` (crea, modifica, elimina), `vendita` (modifica, interrompi il percorso, elimina), `registra_vendita` (anche dalla call chiusa, con il `call_id`), `rata` (incassa, correggi o annulla l'incasso, fallita, modifica scadenza e importo, rimborso, aggiungi, elimina), `costo` (registra, modifica, elimina, copia i ricorrenti), `pagamento_provvigione` e `regola_provvigione` (nuova, chiudi, modifica, elimina), `obiettivi_mese`, `prodotto` (crea, modifica, fuori e in vendita, elimina), `fissa_call` (per sé o per un setter, anche una call già fatta), `call` (esito, modifica con dettagli e importo proposto, note del setter e note aggiuntive del closer, elimina), `lead` (stato, modifica, elimina), `aggiorna_report` (il giorno di un setter o suo: aggiunge, corregge, elimina; con i numeri anche le risposte di "Com'è andata la giornata", sezione 8);
  - setter: `aggiorna_report` (i suoi giorni, numeri e risposte: lead in target, qualità delle conversazioni, cosa frenava i lead, domande e contenuti, altre note; `aggiungi` accoda un testo a quello salvato, `imposta` lo sostituisce, "" lo toglie), `fissa_call` (per sé), `call` (sposta, riassegna, le sue note del setter, come la scheda della call nell'app; mai tipo, importi, esito, motivo o note aggiuntive del closer, 30/09/2026), `lead` (stato, modifica dei suoi);
  - closer: `call` (esito e dettagli delle sue, con le sue note aggiuntive `note_closer`, mai le note del setter; con follow-up o persa il motivo di non chiusura è obbligatorio come nel foglio, e se manca Alfire lo chiede), `registra_vendita`, `rata` (incassa, correggi o annulla l'incasso, fallita sulle sue vendite: mai il piano), `lead` (solo lo stato);
  - progetti, per livello: `progetto` (crea, modifica, membri; elimina solo l'admin dei progetti; il cliente lo collega solo l'admin dell'app) e `lista` per chi gestisce; `task` (aggiungi, modifica, completa, riapri, elimina), `nota_progetto` e `tempo` (avvia, ferma, registra, modifica, elimina: solo il proprio) per tutti. `tempo` registra e modifica con la durata o con la fascia facoltativa `dalle`/`alle` (29/09/2026), validate dallo stesso schema del modulo: «nessuna» toglie la fascia, e anche una durata nuova detta senza fascia la toglie; la scheda mostra «Fascia: 09:00–10:30», o prima → dopo, e «tolta» quando una fascia sparisce, anche quella di un timer senza fascia di un giorno. `mio_tempo` legge anche la fascia di ogni voce.
- **Conferma**: nessuna scrittura parte senza il tocco su "Conferma" (`toolApproval: 'user-approval'`). La scheda (`components/alfire/alfire.tsx`) mostra la frase dall'input (`lib/alfire/riassunto.ts`) e, prima del tocco, l'anteprima letta dal database con la sessione dell'utente (`lib/alfire/anteprima.ts` → `anteprimaScrittura`): il nome vero della riga, prima → dopo per le correzioni, e per le eliminazioni cosa si portano dietro, contato da `anteprima_eliminazione` o detto con le stesse frasi dell'app (`lib/alfire/conseguenze.ts`); il bottone diventa "Elimina", "Interrompi" o "Togli", rosso, e resta spento finché l'anteprima non c'è (e se il conteggio non riesce). Ogni campo che verrà scritto è sulla scheda, note e descrizioni per intero; `registra_vendita` mostra setter, closer, fonte e contatti come li scriverà il database (dalla call, dal cliente o detti dall'admin); l'esito di una call mostra il motivo di non chiusura prima → dopo, e "tolto" quando un altro esito lo toglie (30/09/2026). Un dato obbligatorio che manca, un nome che non c'è o un prodotto che vale per più voci del catalogo fermano la scheda prima del tocco. L'utente dice nomi, non id ("la rata di marzo di Rossi", "il costo di Canva"): `lib/alfire/risolvi.ts` trova la riga (i task dentro il progetto detto, o per `task_id`); se più righe vanno bene la scheda non si conferma, il motivo torna al modello e Alfire chiede quale. Mai una scelta a caso; una lettura che fallisce non vale mai "nessun risultato".
- **Risposte a un tocco** (Dany, 29/09/2026): strumento `proponi_risposte` (`lib/alfire/risposte.ts`), per ogni ruolo, senza `execute` e fuori da `SCRITTURE`: `tipo` `scelta` (domanda chiusa: quale cliente, rata, mese, sì o no; le opzioni sono i candidati che gli strumenti elencano quando un nome vale per più righe) o `seguito` (dopo una risposta, al massimo 3 domande successive, solo se davvero utili); da 2 a 4 opzioni di 60 caratteri al massimo. La chiamata chiude la risposta e la chat mostra i bottoni (`components/alfire/proposte.tsx`, alti 44 px, vanno a capo su mobile). Un tocco manda l'opzione come messaggio dell'utente (`sendMessage`, non `addToolOutput`): si vede come suo, e scrivere o dettare un'altra risposta funziona allo stesso modo, nessuna attesa bloccata. Solo i bottoni dell'ultimo messaggio rispondono; dopo, mostrano la scelta e restano spenti (i seguiti non scelti spariscono). La route rimette ogni chiamata come testo della sua domanda (`proposteComeTesto`), così il modello sa cosa l'utente sta rispondendo e nessuna chiamata resta senza risultato; una proposta in attesa non trattiene mai una scheda confermata (`confermeComplete`). Un tocco non scrive niente: una scrittura passa sempre dalla sua scheda e da "Conferma", e i bottoni non servono mai a confermare una scrittura a parole. Una domanda chiusa vale come risposta; i soli seguiti senza testo no (`propostaCheRisponde`): la chat offre ancora «Riprova». Mentre si detta i bottoni restano spenti, come l'invio.
- **Mai da Alfire**: team (inviti, ruoli, livelli, disattivazione, elimina e unisci persone), accesso, profilo e tutorial, export e backup, reparti e modelli dei progetti, ordine delle liste; tempo, timer o dati di altri che il ruolo non vede (la scheda Team del tempo resta solo nell'app, nessuno strumento la legge); nessuna funzione di sorveglianza (sezione 17).
- **Voce**: si registra solo dopo il tocco sul microfono, al massimo 2 minuti, trascrizione in italiano via `/api/alfire/voce`. Testo in diretta (Dany, 29/09/2026), stesso fornitore e stessa privacy (nessun riconoscimento vocale del browser, l'audio non va a Google o Apple): il registratore dà un pezzo al secondo, e circa ogni 2 secondi, se non c'è una richiesta in volo e c'è almeno un secondo nuovo, l'audio registrato fin lì (tutti i pezzi dall'inizio, a 32 kbit/s) va a `/api/alfire/voce` con `parziale=1` (stessi controlli e limiti; il silenzio dà testo vuoto, non errore). Il testo compare nella casella dopo quello già scritto, in grigio corsivo e non modificabile; allo stop una trascrizione dell'intero vocale lo sostituisce, si rilegge e si manda con Invio. La casella segue il dettato: le ultime parole restano in vista anche quando smette di crescere. Una parziale fallita non ferma mai la registrazione, solo quella finale segnala errori; dopo un 429 (o 401, 413, 503), o due errori di fila, niente più parziali per quel vocale, e sotto «Ti ascolto» compare «Testo in diretta in pausa: arriva tutto allo stop». Se la finale non riesce dopo il testo in diretta, l'avviso dice che nella casella c'è solo quello, forse incompleto. Una parziale ancora in volo allo stop si interrompe anche verso Groq (`req.signal`). Un solo vocale alla volta: un secondo tocco mentre il microfono si apre non fa niente, e se il pannello si chiude prima che si apra il microfono si spegne subito. Un browser che non dà pezzi prima dello stop fa come prima: solo il testo finale (`lib/alfire/dettatura.ts`, `components/alfire/use-registratore.ts`). Costo sul Developer: Whisper conta almeno 10 secondi per richiesta (0,04 $ all'ora); ogni parziale rimanda tutto l'audio dall'inizio, quindi un vocale di 60 secondi fa circa 30 richieste e circa 1.000 secondi di audio fatturato, circa 1 centesimo di dollaro (2 minuti: circa 3.800 secondi, 4 centesimi). Limiti di Whisper: gratuito 20 richieste al minuto, 2K al giorno, 7.200 secondi di audio all'ora e 28.800 al giorno per tutto il team; Developer 400 al minuto, 200K al giorno, 400K secondi all'ora. Sul gratuito, quindi, niente testo in diretta (`testoInDirettaConsentito`): una manciata di vocali da un minuto consumerebbe l'audio dell'ora e toglierebbe il posto alle trascrizioni finali. La route lo capisce da Whisper stesso (`x-ratelimit-limit-requests`, le richieste al giorno) o da `ALFIRE_PIANO`; finché non lo sa, le parziali passano. Lettura ad alta voce delle risposte: preferenza per dispositivo.
- **Test**: `e2e/llm-finto.mjs` è un modello finto OpenAI-compatibile; con il dev server avviato con `ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1` e `E2E_ALFIRE_FINTO=1`, `e2e/alfire-chat.spec.ts` prova lettura, conferma, scrittura, annullamento e voce senza Groq, `e2e/alfire-agente.spec.ts` l'eliminazione con le conseguenze e l'annullamento, il nome ambiguo, la rata aggiunta e il lead spostato, `e2e/alfire-bottoni.spec.ts` le risposte a un tocco (scelta, risposta scritta al posto del tocco, domanda solo sopra i bottoni, seguiti, scrittura dopo un tocco solo con "Conferma"), `e2e/alfire-voce.spec.ts` il testo in diretta col microfono finto di Chromium (la trascrizione finta cresce con l'audio), e con `page.route` il doppio tocco, il pannello chiuso mentre il microfono si apre, la parziale lenta allo stop, le parziali in errore, la finale che non riesce e la casella che segue il dettato a 390 px.
- Nessuna sorveglianza (sezione 17): Alfire non segnala chi non compila e non confronta le persone di sua iniziativa.

**Profilo utente** (`/account`, ogni ruolo): foto in fondo alla sidebar (desktop) e nella top bar (mobile); un tocco apre il profilo. Schede Profilo (foto e nome), Alfire (preferenze e dove vanno i dati), Account (email, ruolo, livello, Esci).

- Foto: di base quella di Google (`profiles.foto_url`, copiata all'ingresso), oppure caricata: bucket pubblico `avatari`, una cartella per persona, scrittura solo nella propria (policy su `storage.objects`), ritaglio quadrato 256 px in WebP o JPEG nel browser. Eliminando o unendo una persona le sue foto si cancellano.
- Nome e foto si cambiano solo con `aggiorna_mio_profilo` (`security definer`): nessuna policy di update su `profiles` per i non admin, così ruolo e stato restano fuori portata.

## 21. Tutorial al primo accesso

Chiesto da Dany il 27/09/2026.

- Al primo accesso dopo l'invito parte da solo un tour guidato, dopo l'intro di brand. Si vede una volta: `profiles.tutorial_visto` (un flag, non una data: la rubrica del team è leggibile da tutti), acceso da `segna_tutorial_visto()` (`security definer`, solo il proprio). Chi c'era già all'arrivo del tutorial è segnato come visto; i seed pure.
- Un percorso per ruolo e funzione (admin, setter, closer, coach fitness, video editor, nutrizione, sviluppo), configurato in codice in `lib/tutorial/percorsi.ts`: Dany non lo modifica dall'app, chiede e si cambia lì. Testato: ogni passo evidenzia una voce che quel ruolo ha davvero.
- **Interattivo**: i passi "tocca qui" (`clic`) chiedono di toccare il vero link evidenziato: la pagina si apre e il tour continua dentro, su elementi della pagina (`pagina` e `TARGET_DI_PAGINA`, attributi `data-tour`). Solo link di navigazione: il tour non fa mai premere bottoni che scrivono dati. Nell'anteprima dell'admin si va avanti con "Avanti".
- Ogni passo: contatore "2/7", titolo, testo breve, elemento evidenziato (attributi `data-tour` nella shell: voci di navigazione, "Altro", Alfire, profilo); senza elemento visibile la scheda sta al centro. Una barra di 2 secondi (`ATTESA_LETTURA_MS`) dà il tempo di leggere: prima di allora la X e "Avanti" sono spenti. Esc chiude, frecce per navigare.
- Si rivede da Profilo › Account › "Rivedi il tutorial". L'admin ha "Testa il tutorial" in alto a destra: sceglie un ruolo e vede quel tour in anteprima, senza segnare nulla.
- Chi non è invitato non entra: il trigger su `auth.users` rifiuta ogni email senza invito (sezione 7).

## 22. App installabile e dominio

Chiesto da Dany il 27/09/2026.

- **App installabile (PWA)**: `app/manifest.ts` (nome "Percorso Alpha", "Alpha" sotto l'icona, `standalone`, colori di `--alpha-bg`), icone in `public/icons` e `app/apple-icon.png`, generate da `scripts/genera-icone.mjs` (emblema per le misure piccole, logo intero per la Home dell'iPhone). iPhone: Safari › Condividi › Aggiungi alla schermata Home. Android: Chrome › Installa app. Il manifest è tra i percorsi pubblici del proxy: il browser lo scarica senza cookie.
- **Dominio**: `dashboard.percorsoalpha.com` (Vercel) al posto di `alpha-dashboard-eta.vercel.app`. Cambiando dominio vanno aggiornati `APP_URL` su Vercel (redirect del login e link degli inviti) e Site URL e Redirect URLs in Supabase › Authentication.

## 23. Changelog

Chiesto da Dany il 30/09/2026.

- **Pagina** `/changelog`, solo admin (gli altri ruoli tornano alla loro pagina): si apre da Impostazioni, dalla voce "Changelog" che mostra la versione in uso; non sta nella barra in basso. In cima la versione in uso (l'elemento oro della schermata), poi una scheda per versione, dalla più recente: "v1.9.0 · 30/09/2026", titolo, riassunto, Novità, Correzioni e per chi (admin, setter, closer, oppure tutto il team da solo). La descrizione dice che le 0.x sono le tappe prima della produzione.
- **Dati** in `lib/changelog/versioni.ts`, dalla più recente: italiano semplice e concreto, scritto per Dany da titolare (cosa cambia per lui e per il team), mai nomi di file.
- **Versioni semver**: 1.0.0 è il 27/09/2026, il primo giorno in produzione su Vercel con i dati veri (storico dell'Excel e foglio delle call); le 0.x sono le tappe di prima. MINOR per un deploy che aggiunge o cambia funzioni, PATCH per un deploy che corregge soltanto (solo Correzioni); la MAJOR resta 1 finché Dany non decide altro. Un deploy di sola documentazione o di soli test non ha voce. Dal 29/09/2026 una voce per deploy (o per deploy a pochi minuti l'uno dall'altro che chiudono la stessa funzione); prima, poche tappe riassunte.
- **Regola di lavoro**: ogni deploy aggiunge una voce in `lib/changelog/versioni.ts` e aggiorna la versione in `package.json` (`npm version <x.y.z> --no-git-tag-version`). `tests/changelog.test.ts` verifica semver, ordine, date mai nel futuro, una PATCH senza novità e `package.json` uguale alla prima voce.

<!-- Everything above this line is ours. The block below is rewritten by `next dev`: never write inside it. -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
