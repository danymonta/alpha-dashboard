# Alpha Economics: specifica di progetto per Claude Code

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
| Lead | tutti | solo quelli creati da lui; ne aggiorna lo stato | quelli con call assegnate a lui; ne aggiorna lo stato |
| Call | tutte | le proprie: data, stato, esito (chiusa sì o no), mai importi; le riprogramma e le riassegna | quelle assegnate a lui: esito, data, dettagli (link, performance, prodotto proposto) |
| Importo proposto in call (`call_pitch`) | tutti | nessuno | solo delle call assegnate a lui |
| Clienti | tutti | nome e stato dei clienti nati da suoi lead, niente contatti | clienti nati da sue call |
| Vendite e rate | tutte | nessuna | solo le vendite chiuse da lui |
| Provvigioni | tutte | solo il proprio totale mensile maturato e pagato, mai il dettaglio per cliente | nessuna |
| Costi, margine, compensi | tutto | nessuno | nessuno |
| Gestione utenti, prodotti, impostazioni | tutto | nessuno | nessuno |

Requisito duro: un collaboratore non vede mai quanto paga un singolo cliente, il compenso di un altro collaboratore, i costi o il margine.

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
  contenuto_pubblicato bool, note text
  unique (setter_id, data); tutti gli interi >= 0, default 0

leads
  id, nome, instagram_handle, setter_id -> profiles,
  fonte enum lead_source (dm_inbound, dm_outbound, referral, organico, ads, altro),
  stato enum lead_status (call_fissata, follow_up, cliente, perso),
  note, created_at
```

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
  obiezione_principale text, note,
  link_registrazione text null, performance enum call_performance null (buona, media, scarsa),
  prodotto_proposto_id -> products null

call_pitch                          -- tabella separata: il setter legge le call ma mai un importo
  id, call_id -> calls unique on delete cascade, importo_proposto numeric(12,2) >= 0
```

Campi presi dal foglio prospect di Dany (27/09/2026). Si modificano con le RPC `modifica_call` (data, ora in Europe/Rome, tipo, closer, note) e `dettagli_call` (closer e admin).

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
- Una rata è **in ritardo** se `stato = 'prevista'` e `scadenza < oggi`. Non è uno stato salvato, è calcolato.
- Al passaggio di una call a `esito = chiusa` l'app propone subito il form "Nuova vendita" precompilato (cliente dal lead, setter, closer, call_id).

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

Una persona non ha mai due regole valide nello stesso giorno: un trigger rifiuta le date sovrapposte, perché la provvigione verrebbe contata due volte.

La provvigione matura **sull'incasso**, non sulla firma: per ogni `payment` incassato di una vendita con `setter_id`, provvigione = `importo_incassato * percentuale` della regola valida alla data d'incasso e applicabile al tipo di vendita. Un rimborso genera provvigione negativa nel mese del rimborso. Se Dany decide diversamente (provvigione anche sui rinnovi, o su revenue invece che su cash), si cambia solo `commission_rules`, non il codice.

### Audit

```
audit_log
  id, tabella, record_id, azione (insert, update, delete), utente_id,
  dati_prima jsonb, dati_dopo jsonb, created_at
```

Trigger su `sales`, `payments`, `commission_rules`, `commission_payouts`, `expenses`, `profiles`. Visibile solo all'admin. Serve a sapere chi ha cambiato un importo e quando.

## 9. Metriche: definizioni ufficiali

Tutte le metriche si calcolano in SQL (view `security_invoker` o funzioni RPC), mai sommando importi in JavaScript. Ogni metrica ha un test Vitest o pgTAP con dati noti. Denominatore zero: mostra "-", mai `NaN` o `Infinity`.

**Setting** (da `setter_daily_reports`, periodo selezionato)
- DM totali = `dm_outbound + dm_inbound`
- Tasso di conversazione = `conversazioni / DM totali`
- Call prenotate = `discovery_prenotate + strategy_prenotate`
- Tasso di prenotazione = `call prenotate / call_proposte`
- DM per call prenotata = `DM totali / call prenotate`

**Call** (da `calls`, per data di `programmata_il`)
- Call svolte = `stato = svolta`
- Show rate = `svolte / (svolte + no_show)`. Cancellate e riprogrammate escluse
- Tasso di qualificazione = `qualificate / svolte`
- Close rate = `esito chiusa / svolte`
- Close rate su qualificate = `esito chiusa / svolte qualificate`

**Economics**
- Cash incassato (mese) = somma `importo_incassato` con `incassato_il` nel mese, al netto dei rimborsi
- Cash per tipo = stessa somma divisa per `sales.tipo` (nuovo, rinnovo, upsell)
- Revenue firmata (mese) = somma `valore_contratto` con `data_vendita` nel mese
- Valore medio vendita = revenue firmata / numero vendite
- Cash per call svolta = cash da vendite nuove / call svolte
- Da incassare = somma `importo_previsto` delle rate `prevista`. Suddiviso in: in ritardo, prossimi 30 giorni, oltre
- Clienti attivi = clienti con una vendita dove `oggi between data_inizio and data_fine`
- In scadenza = clienti attivi con `data_fine` dell'ultima vendita entro 30 giorni e nessuna vendita successiva
- Tasso di rinnovo (mese M) = clienti con `data_fine` nel mese M che hanno una vendita `rinnovo` con `data_vendita` entro 30 giorni dalla scadenza / clienti con `data_fine` nel mese M
- Provvigioni maturate (mese) = come da sezione 8
- Margine operativo (mese) = cash incassato - provvigioni maturate - costi del mese. Etichetta sempre "Margine operativo", mai "utile": le tasse non sono incluse

**Periodo** (28/09/2026): ogni metrica si chiede su un mese (`?mese=YYYY-MM`) o su un intervallo (`?da=&a=`), con le RPC `*_periodo`; le mensili sono wrapper con gli stessi risultati. Confronto: se il periodo è fatto di mesi interi, gli stessi mesi prima; altrimenti la finestra di pari giorni subito prima. Trimestre e anno "in corso" coprono il periodo solare intero. Le provvigioni restano mensili (i pagamenti si riferiscono a un mese).

Stato cliente derivato (`v_client_status`): `attivo`, `in_scadenza`, `scaduto` (nessuna vendita attiva, l'ultima finita da meno di 90 giorni), `ex_cliente` (oltre 90 giorni), `mai_attivato`.

## 10. Schermate

Navigazione: sidebar su desktop, bottom bar su mobile (massimo 4 voci più "Altro"). Le voci dipendono dal ruolo.

### Admin

1. **Panoramica** (`/`). Selettore mese in alto (default mese corrente) con confronto col mese precedente.
   - Riga KPI: Cash incassato, Revenue firmata, Nuovi clienti, Rinnovi, Margine operativo. Ogni tile: valore grande, delta sul mese precedente con icona e segno (mai solo colore).
   - Grafico: cash incassato per mese, ultimi 12 mesi, barre impilate nuovo / rinnovo / upsell.
   - Funnel del mese: DM totali, conversazioni, call prenotate, call svolte, chiuse. Barre orizzontali con valore e tasso di passaggio.
   - Box "Da incassare": in ritardo (con elenco nominativo), prossimi 30 giorni.
   - Box "In scadenza": clienti che scadono nei prossimi 30 giorni, con azione "Registra rinnovo".
2. **Vendite** (`/sales`): tabella filtrabile per mese, tipo, setter, closer. Dettaglio vendita con piano rate modificabile e azione "Segna rata incassata" (un tap, data di oggi precompilata).
3. **Clienti** (`/clients`): lista con stato derivato, filtri per stato. Scheda cliente: storico vendite, rate, valore totale nel tempo (LTV), fonte, setter.
4. **Incassi** (`/payments`): tutte le rate, filtro per stato e mese, vista "in ritardo" in evidenza.
5. **Setting** (`/setting`): metriche setting e call per periodo e per setter, tabella dei report giornalieri.
6. **Provvigioni** (`/commissions`): per setter e mese, maturato, pagato, saldo. Registrazione pagamento.
7. **Costi** (`/expenses`): inserimento e lista.
8. **Impostazioni**: Team (sezione 7), Prodotti, Regole provvigioni, Esporta CSV (vendite, incassi, costi per mese: serve alla commercialista).

### Setter (mobile first, è la sua schermata principale)

1. **Oggi** (`/today`): il report del giorno in una sola schermata. Ogni campo numerico è uno stepper con bottoni grandi (+1, +5, -1) e input diretto. Salvataggio automatico con debounce e stato visibile ("Salvato alle 18:42"). Se il report di oggi non esiste si crea al primo tocco. Nessun bottone "invia" da ricordarsi.
2. **Nuova call** : form corto: nome lead, handle Instagram, fonte, tipo call, data e ora, closer (default Dany). Crea lead e call insieme.
3. **Le mie call**: lista con stato ed esito.
4. **I miei numeri**: metriche del mese proprie e provvigioni maturate e pagate (solo totali).

Obiettivo misurabile: il report giornaliero si compila in meno di 60 secondi dal telefono.

### Closer

1. **Le mie call**: di oggi e prossime. Aggiornamento esito in massimo 3 tap. Se `chiusa`, apre "Nuova vendita" precompilata.
2. **Le mie vendite**: sola lettura più registrazione incasso delle proprie vendite.

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

- **Keep-alive**: Supabase Free mette in pausa il progetto dopo 7 giorni senza richieste. Route `/api/cron/keep-alive` (protetta da `CRON_SECRET`) che esegue una query leggera, chiamata ogni giorno da Vercel Cron (`vercel.json`).
- **Backup**: il piano Free non ha backup. Esporta CSV mensile da Impostazioni. Quando l'app diventa l'unica fonte dei dati economici, passare a Supabase Pro.
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

## 18. Project management (area Progetti)

Chiesto da Dany il 27/09/2026. Schema in `20260928090000_project_management.sql` e successive.

- **Struttura**: reparto → progetto → liste (milestone, con date) → task → sotto-task (un livello). Reparti di partenza: Fitness Coaching, Contenuti e Video, Vendite e Marketing, Amministrazione. Un progetto può puntare a un cliente di `clients` (mai duplicato): lo collega solo l'admin dell'app.
- **Modelli**: ogni reparto ha modelli di progetto; creando un progetto da un modello si aprono liste e task datati dall'inizio del progetto. "Percorso cliente" (Fitness Coaching): questionario iniziale, invio accessi, call di onboarding, scrittura programmazione, assistenza chat, revisione video settimanale, call di check, aggiornamento programmazione, call e aggiornamento di metà percorso, call di rinnovo, raccolta feedback e testimonianza. Si modificano in Impostazioni > Progetti.
- **Livelli** (`profiles.livello_pm`, separati dal ruolo): `admin` tutto; `manager` crea progetti e gestisce quelli di cui è membro (liste, task, membri, dati del progetto); `employee` vede i progetti di cui è membro, aggiunge task, lavora quelli assegnati a lui o creati da lui. L'admin dell'app è sempre admin dei progetti. Il livello si cambia in Team.
- **Tempo**: auto-dichiarato, mai automatico. Timer (uno acceso per persona, indicatore nella shell, sincronizzato in tempo reale) o minuti caricati dopo, mai nel futuro. Ognuno vede il proprio; chi gestisce un progetto vede il tempo speso sul progetto; l'admin tutto. Nessuno vede il timer acceso di un altro, nessun elenco di chi non ha registrato, nessun avviso (§17).
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

**Alfire** è l'assistente AI del team: fiamma in alto a destra (desktop "Chatta con Alfire", mobile solo icona), pannello laterale con chat, vocale e suggerimenti per ruolo.

- **Modello**: open source e gratuito. Groq, piano gratuito (1.000 richieste e 200k token al giorno, 8k token al minuto), `openai/gpt-oss-120b`; voce con Whisper sullo stesso account. Il codice parla il formato OpenAI (`lib/alfire/config.ts`): si cambia fornitore o modello solo con le variabili `ALFIRE_*`, anche verso un modello cinese (Qwen su Groq, GLM su z.ai).
- **Privacy**: domande, dati letti e vocali passano dai server del fornitore (Groq: USA). Nessun audio salvato, la chat vive solo finché l'app è aperta (nessuna tabella). Detto in Profilo › Alfire.
- **Permessi**: Alfire lavora con la sessione di chi chatta: RLS e le stesse server action dei form. In più riceve solo gli strumenti del suo ruolo (`lib/alfire/permessi.ts`, testato): nessun collaboratore riceve strumenti su soldi dei clienti, costi, margine o compensi altrui.
- **Letture**: numeri del periodo, cash per mese, da incassare, clienti, vendite, setting, provvigioni, costi (admin); i miei numeri (setter); call; progetti e task; guida della dashboard (`lib/alfire/guida.ts`, letta solo quando serve per risparmiare token).
- **Scritture** (crea cliente, segna rata incassata, registra costo, aggiorna report, fissa call, crea progetto, aggiungi task): mai senza conferma. Alfire propone, in chat compare una scheda con cosa verrà scritto (`lib/alfire/riassunto.ts`), si esegue solo dopo "Conferma" (`toolApproval: 'user-approval'`).
- **Voce**: si registra solo dopo il tocco sul microfono, al massimo 2 minuti, trascrizione in italiano via `/api/alfire/voce`. Lettura ad alta voce delle risposte: preferenza per dispositivo.
- **Test**: `e2e/llm-finto.mjs` è un modello finto OpenAI-compatibile; con il dev server avviato con `ALFIRE_API_KEY=finta ALFIRE_BASE_URL=http://127.0.0.1:4010/v1` e `E2E_ALFIRE_FINTO=1`, `e2e/alfire-chat.spec.ts` prova lettura, conferma, scrittura, annullamento e voce senza Groq.
- Nessuna sorveglianza (sezione 17): Alfire non segnala chi non compila e non confronta le persone di sua iniziativa.

**Profilo utente** (`/account`, ogni ruolo): foto in fondo alla sidebar (desktop) e nella top bar (mobile); un tocco apre il profilo. Schede Profilo (foto e nome), Alfire (preferenze e dove vanno i dati), Account (email, ruolo, livello, Esci).

- Foto: di base quella di Google (`profiles.foto_url`, copiata all'ingresso), oppure caricata: bucket pubblico `avatari`, una cartella per persona, scrittura solo nella propria (policy su `storage.objects`), ritaglio quadrato 256 px in WebP o JPEG nel browser. Eliminando o unendo una persona le sue foto si cancellano.
- Nome e foto si cambiano solo con `aggiorna_mio_profilo` (`security definer`): nessuna policy di update su `profiles` per i non admin, così ruolo e stato restano fuori portata.

## 21. Tutorial al primo accesso

Chiesto da Dany il 27/09/2026.

- Al primo accesso dopo l'invito parte da solo un tour guidato, dopo l'intro di brand. Si vede una volta: `profiles.tutorial_visto` (un flag, non una data: la rubrica del team è leggibile da tutti), acceso da `segna_tutorial_visto()` (`security definer`, solo il proprio). Chi c'era già all'arrivo del tutorial è segnato come visto; i seed pure.
- Un percorso per ruolo e funzione (admin, setter, closer, coach fitness, video editor, nutrizione, sviluppo), configurato in codice in `lib/tutorial/percorsi.ts`: Dany non lo modifica dall'app, chiede e si cambia lì. Testato: ogni passo evidenzia una voce che quel ruolo ha davvero.
- Ogni passo: contatore "2/7", titolo, testo breve, elemento evidenziato (attributi `data-tour` nella shell: voci di navigazione, "Altro", Alfire, profilo); senza elemento visibile la scheda sta al centro. Una barra di 2 secondi (`ATTESA_LETTURA_MS`) dà il tempo di leggere: prima di allora la X e "Avanti" sono spenti. Esc chiude, frecce per navigare.
- Si rivede da Profilo › Account › "Rivedi il tutorial". L'admin ha "Testa il tutorial" in alto a destra: sceglie un ruolo e vede quel tour in anteprima, senza segnare nulla.
- Chi non è invitato non entra: il trigger su `auth.users` rifiuta ogni email senza invito (sezione 7).

<!-- Everything above this line is ours. The block below is rewritten by `next dev`: never write inside it. -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
