# Onboarding · Rilascio A (1.77.0): disegno tecnico

Contesto: `docs/onboarding/specifica-v7.md` (la richiesta di Dany) e `docs/onboarding/piano.md` (il piano approvato da Dany il 12/11/2026 con le scelte consigliate). Questo file è il contratto del rilascio A. Dove dice una cosa diversa dal piano, vale questo file. `CLAUDE.md` resta la fonte di verità per convenzioni, sicurezza e test.

## Cosa consegna A

Solo il lato team. Nessun cliente entra ancora: `/join`, l'account cliente e l'area `/percorso` sono il rilascio B, e A non tocca l'autenticazione.

1. Wizard «Nuovo cliente» in 3 schermate (Cliente, Vendita, Team) e azione «Avvia onboarding» per una vendita che esiste già.
2. Alla conferma, in una transazione: cliente creato o aggiornato, vendita registrata, progetto del cliente aperto con la lista «Onboarding», incarichi (coach, revisore, responsabile), invito con link personale in stato `in_attesa_pagamento`, percorso con gli step.
3. Gate pagamento: una rata incassata della vendita, o «Conferma pagamento» dell'admin, attiva il link. Revoca e riattivazione.
4. Sezione **Onboarding** per l'admin: lista, «Vendite nuove senza onboarding», scheda del cliente in onboarding.
5. Notifica in dashboard agli admin quando il pagamento è confermato.
6. Interruttore `aperto_ai_clienti` (spento): finché è spento «Copia link» e il messaggio pronto non compaiono e i 14 giorni del link non partono.

Fuori da A (non costruire): `/join`, OTP, `clienti_account`, `handle_new_user`, questionario, video, CMS, calendari, foglio Google, `clienti_call`, consensi, bucket, `motion`, scadenze dei task, email ai clienti.

## Regole che valgono sempre

- Nomi di tabelle e colonne in italiano, `snake_case`. RLS su ogni tabella, `revoke all … from anon`, policy restrittiva `<tabella>_mai_da_oauth` (stessa espressione delle altre), almeno una policy permissiva. View `security_invoker = true`. Funzioni `security definer` con `set search_path = ''`.
- **Nessuna funzione `security definer` nuova eseguibile da `authenticated`**, se possibile: le RPC chiamate dall'app sono `security invoker` e passano dalla RLS dell'admin; gli effetti collaterali stanno in trigger `security definer` e in funzioni interne senza grant. Se una definer per `authenticated` è inevitabile va in `00_schema.sql` e in `75_mcp_oauth.sql` con il suo esito per un token di Claude.
- Requisito duro (sezione 6 di `CLAUDE.md`): coach e revisore non vedono mai soldi né lo stato del pagamento. In A la sezione Onboarding è solo dell'admin. Le policy per gli incaricati si scrivono già (lettura dal percorso `in_corso` in poi), l'interfaccia per loro arriva in B.
- Sezione 17: nessun elenco, media o filtro per collaboratore; non si mostra chi ha fatto cosa, tranne le azioni dell'admin sui soldi nel registro, che legge solo l'admin.
- Nessun trigger blocca mai un incasso, un rimborso o un'eliminazione: gli effetti dell'onboarding stanno in un blocco con `exception when others then raise warning`.
- Testi dell'interfaccia in italiano e inglese (`bilingue`, `lib/i18n/testi/onboarding.ts`), italiano con gli accenti, mai il trattino lungo, niente emoji. Icone Lucide.
- Nessun dato vero nei seed e nei test.
- Mai `prettier` su file interi. Tipi: `npx supabase gen types typescript --local --schema public > lib/supabase/database.types.ts` (l'uscita grezza, non formattata; `npm run db:types` svuota il file).

## Schema

Migration (dopo `20261107090000_calendario_call.sql`):

1. `20261108090000_onboarding_dati.sql`
2. `20261108090100_onboarding_progetto.sql`
3. `20261108090200_onboarding_avvio_gate.sql`

### 1. Dati

```
onboarding_impostazioni        -- una riga (id boolean pk default true check (id)); solo admin (select, update)
  aperto_ai_clienti bool not null default false,
  giorni_validita_link int not null default 14 (1-90),
  coach_predefinito_id, revisore_predefinito_id, responsabile_predefinito_id -> profiles null on delete set null,
  link_community text null (^https://t\.me/, al massimo 300),
  giorni_call int default 3, giorni_test int default 7, giorni_programma int default 2,   -- la stima della timeline (B)
  updated_by -> profiles null on delete set null, created_at, updated_at

onboarding_incarichi           -- chi segue il cliente; la scrive SOLO l'admin dell'app (is_admin())
  client_id pk -> clients on delete cascade,
  coach_id, revisore_id, responsabile_id -> profiles null on delete set null,
  created_at, updated_at
  -- lettura: admin; l'incaricato attivo la propria riga (coach_id, revisore_id o responsabile_id = auth.uid())

onboarding_inviti              -- solo admin
  id, client_id -> clients on delete cascade, sale_id -> sales null on delete set null,
  call_id -> calls null on delete set null,
  slug text (minuscolo, ^[a-z0-9-]{1,60}$, dal nome e cognome senza accenti),
  token_hash text not null unique (sha256 in esadecimale),
  email text null,                              -- quella proposta al cliente (B)
  minorenne bool not null default false,
  consenso_genitore_il timestamptz null, consenso_genitore_nota text null (al massimo 300),
  stato text check in ('in_attesa_pagamento','attivo','usato','scaduto','revocato') default 'in_attesa_pagamento',
  attivato_il timestamptz null, attivato_da text null check in ('pagamento','manuale'),
  scade_il timestamptz null, usato_il timestamptz null,
  revocato_il timestamptz null, revocato_motivo text null (al massimo 300),
  created_by -> profiles null on delete set null default auth.uid(), created_at, updated_at
  -- un solo invito vivo per cliente: indice unico parziale su (client_id) where stato in ('in_attesa_pagamento','attivo','usato')
  -- check: attivato_il e attivato_da insieme; revocato_il se e solo se stato = 'revocato'

onboarding_inviti_token        -- il token in chiaro finché l'invito non è usato; solo admin (select); fuori dal backup
  invito_id pk -> onboarding_inviti on delete cascade, token text not null, created_at

onboarding_percorsi            -- una riga per cliente
  client_id pk -> clients on delete cascade, sale_id -> sales null on delete set null,
  versione_flusso int not null default 1,
  stato text check in ('in_attesa','in_corso','sospeso','completato') default 'in_attesa',
  giorno_zero timestamptz null,                 -- la registrazione del cliente (B)
  completato_il timestamptz null, created_at, updated_at
  -- lettura: admin; l'incaricato attivo quando stato <> 'in_attesa' (mai lo stato del pagamento)

onboarding_passi_def           -- gli step, per versione del flusso; seminata dalla migration; lettura admin (B: incaricati e cliente)
  versione int, chiave text, pk (versione, chiave),
  ordine int, nodo text, titolo text, tipo text,
  attore text check in ('cliente','team'), richiede_verifica bool default false,
  sblocca_dopo text[] not null default '{}'

onboarding_passi               -- una riga per cliente e step; mai risposte del questionario qui
  client_id -> clients on delete cascade, passo text, pk (client_id, passo),
  versione int not null,
  stato text check in ('bloccato','disponibile','in_corso','inviato','in_attesa_team','fatto') default 'bloccato',
  iniziato_il, inviato_il, completato_il timestamptz null, dati jsonb not null default '{}', nota text null,
  created_at, updated_at
  -- lettura come onboarding_percorsi

onboarding_eventi              -- registro; nessun update né delete da una sessione; solo admin legge
  id, client_id -> clients on delete cascade, tipo text, attore text check in ('cliente','team','sistema'),
  autore_id -> profiles null on delete set null,   -- solo per le azioni dell'admin (conferma pagamento, revoca, riattiva, rigenera, avvio)
  dettagli jsonb not null default '{}',            -- mai email, importi o risposte
  created_at

clienti_telegram               -- fuori da clients (che leggono closer e, via RPC, setter)
  client_id pk -> clients on delete cascade,
  username text null (^[a-z0-9_]{5,32}$, salvato minuscolo e senza @),
  gruppo_privato_url text null (^https://t\.me/, al massimo 300),
  community_richiesta_il, community_approvata_il, presentato_il, presentazione_controllata_il timestamptz null,
  created_at, updated_at
  -- admin tutto; il coach incaricato attivo legge
```

Flusso versione 1 (seme di `onboarding_passi_def`), con i nodi della timeline:

| ordine | chiave | titolo | nodo | attore | verifica | sblocca_dopo |
|---|---|---|---|---|---|---|
| 1 | `benvenuto` | Benvenuto | benvenuto | cliente | no | {} |
| 2 | `regole` | Le regole del percorso | benvenuto | cliente | no | {benvenuto} |
| 3 | `questionario` | Questionario iniziale | questionario | cliente | no | {regole} |
| 4 | `prenotazione` | Prenota la call | call_prenotata | cliente | no | {questionario} |
| 5 | `community` | Entra nella community e presentati | community | cliente | no | {prenotazione} |
| 6 | `call` | Call di onboarding | call_onboarding | team | sì | {prenotazione} |
| 7 | `obiettivo` | Il tuo obiettivo su Coach Plus | call_onboarding | cliente | sì | {call} |
| 8 | `test` | Settimana test | settimana_test | cliente | sì | {obiettivo} |
| 9 | `programma` | Il tuo programma | inizio_percorso | team | sì | {test} |

Helper: `onboarding_incaricato(p_client_id uuid) returns boolean` (`security definer`, `stable`, `search_path ''`, nessuna grant ad `authenticated` se usato solo nelle policy tramite la sua owner; altrimenti grant e inserimento negli elenchi di `00` e `75`): vero se `auth.uid()` è coach, revisore o responsabile di quel cliente, ha un profilo attivo e la richiesta non è di un token OAuth.

`backup_completo()` va ricreata identica, aggiungendo `onboarding_inviti_token` alle tabelle escluse.

### 2. Progetto e task

- `pm_modelli.per_onboarding boolean not null default false`, con indice unico parziale (un solo modello di onboarding), come `per_nuovi_clienti`.
- `pm_modelli_voci` e `pm_task`: `per_incarico text null check in ('coach','revisore','responsabile')`, `chiave_onboarding text null`. Su `pm_task` indice unico parziale `(progetto_id, chiave_onboarding)`.
- Guardia: una sessione non cambia mai `per_incarico` e `chiave_onboarding` di un task (trigger, 42501), come le altre colonne protette dei task; l'editor dei modelli in Impostazioni › Progetti non elimina le voci con `chiave_onboarding`.
- Modello «Onboarding cliente» (stesso reparto di «Percorso cliente»), seminato dalla migration, 10 voci in una lista «Onboarding», senza date (le scadenze arrivano in B):

| chiave | titolo | incarico |
|---|---|---|
| `telegram_gruppo` | Crea il gruppo privato Telegram e aggiungi il cliente | responsabile |
| `community_accesso` | Approva la richiesta di accesso alla community | responsabile |
| `questionario_letto` | Leggi il questionario prima della call | coach |
| `call_onboarding` | Call di onboarding | coach |
| `obiettivo_smart` | Imposta obiettivo SMART e milestone su Coach Plus | coach |
| `coachplus_test` | Verifica il cliente su Coach Plus e assegna i test | coach |
| `revisione_test` | Revisione video dei test | revisore |
| `prima_scheda` | Prima scheda di 4 settimane consegnata | coach |
| `template_alimentare` | Template alimentare dopo 5 giorni di dati | coach |
| `primo_checkpoint` | Primo checkpoint mensile | coach |

- Funzione interna `onboarding_apri_progetto(p_client_id)` (nessuna grant): apre il progetto del cliente se manca (`pm_crea_progetto_cliente`), aggiunge la lista «Onboarding» con i 10 task una sola volta (idempotente sulla `chiave_onboarding`), task senza autore e senza assegnatari, responsabile del progetto = l'incarico `responsabile` (membro del progetto).
- Funzione interna `onboarding_assegna_incarichi(p_client_id)`: aggiunge coach e revisore ai membri, scrive `pm_progetti.coach_id` (rispettando le guardie di `pm_progetti`), assegna ogni task con `per_incarico` alla persona dell'incarico; un incarico vuoto lascia il task senza assegnatari. Chiamata **all'attivazione del link**, non all'avvio: prima del pagamento coach e revisore non vedono il progetto.
- `pm_scegli_coach`: ricreata, non tocca mai i task con `per_incarico` non nullo.
- `pm_apri_progetto_cliente`: ricreata, non riapre mai i task con `chiave_onboarding` non nulla.
- `unisci_profili`: passa anche gli incarichi (`onboarding_incarichi`, predefiniti in `onboarding_impostazioni`). `elimina_persona`: le FK `set null` bastano; verificarlo con un test.
- `anteprima_eliminazione('cliente', …)`: aggiunge `onboarding` (vero se il cliente ha un invito o un percorso); `lib/eliminazione.ts` lo mette in parole.

### 3. Avvio, gate e revoca

Tutte le RPC `security invoker`, solo admin (`is_admin()`, 42501 per gli altri e per un token OAuth).

- `avvia_onboarding(p_sale_id uuid, p_coach uuid, p_revisore uuid, p_responsabile uuid, p_contatti jsonb, p_telegram text, p_minorenne boolean default false) returns jsonb`
  - la vendita deve essere `nuovo` (22023 altrimenti: «L'onboarding parte solo da una vendita a un nuovo cliente.»); il cliente non deve avere un invito vivo (22023 «Questo cliente ha già un onboarding avviato.»);
  - coach, revisore e responsabile devono essere profili attivi (22023); il responsabile è obbligatorio, coach e revisore possono mancare;
  - `p_contatti` (nome, cognome, email, telefono, instagram_handle: solo le chiavi date) aggiorna `clients`; `p_telegram` scrive `clienti_telegram.username`;
  - scrive `onboarding_incarichi` (upsert), poi inserisce l'invito: slug dal nome, token = due `gen_random_uuid()` senza trattini (64 caratteri esadecimali), `token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')`, riga in `onboarding_inviti_token`;
  - restituisce `{ invito_id, client_id, stato }`.
- `nuovo_cliente(p_vendita jsonb, p_onboarding jsonb) returns jsonb`: chiama `registra_vendita` con i campi di `p_vendita` (gli stessi argomenti di oggi, per nome) e poi `avvia_onboarding` sulla vendita creata, nella stessa transazione. Restituisce `{ sale_id, client_id, invito_id, stato }`.
- Trigger `onboarding_inviti_avviato` (`after insert`, `security definer`): crea `onboarding_percorsi` e le righe di `onboarding_passi` della versione 1 (tutte `bloccato`), chiama `onboarding_apri_progetto`, scrive l'evento `avviato` (attore `team`, `autore_id` = `auth.uid()`), e se la vendita ha già un incassato netto maggiore di zero (la formula di `v_vendite.incassato`) e l'invito non aspetta il consenso del genitore, porta subito l'invito ad `attivo` con `attivato_da = 'pagamento'`.
- Trigger `onboarding_inviti_stato` (`after update of stato`, `security definer`):
  - verso `attivo`: `attivato_il = now()` se manca; `scade_il = now() + giorni_validita_link` solo se `aperto_ai_clienti`, altrimenti null; `onboarding_assegna_incarichi`; evento `link_attivo` con `attivato_da`; notifica agli admin attivi (`notifiche_avviso_admin`, tipo `onboarding_pagamento`, chiave `onboarding/<client_id>/pagamento/<invito_id>`, titolo «Pagamento confermato per <Nome Cognome>», anteprima «Il link di onboarding è attivo.» solo se `aperto_ai_clienti`, altrimenti «Onboarding pronto: il link si apre con l'area clienti.», link `/onboarding/<client_id>`, nessun importo);
  - verso `revocato`: `revocato_il = now()`, `onboarding_percorsi.stato = 'sospeso'`, evento `link_revocato`;
  - da `revocato` verso `attivo` o `in_attesa_pagamento` (riattivazione): percorso di nuovo `in_attesa` o `in_corso` (in A sempre `in_attesa`), evento `link_riattivato`.
  - Un invito con `minorenne` e senza `consenso_genitore_il` non passa mai ad `attivo` (resta `in_attesa_pagamento`; l'evento `in_attesa_consenso` lo dice).
- Gate: trigger `payments_onboarding_gate` su `payments` (`after insert or update of stato`, quando `new.stato = 'incassata'`), `security definer`, dentro un blocco che non ferma mai l'incasso: l'invito `in_attesa_pagamento` della vendita passa ad `attivo` con `attivato_da = 'pagamento'`.
- Revoca automatica, stesse garanzie:
  - `payments` `after insert` con `stato = 'rimborsata'`: se l'incassato netto della vendita è ≤ 0 e il cliente non ha un altro percorso `nuovo` o `rinnovo` con incassato > 0, e l'invito non è stato attivato a mano, l'invito vivo passa a `revocato` (motivo «Rimborso totale»);
  - `sales` `before delete`: l'invito vivo di quella vendita passa a `revocato` (motivo «Vendita eliminata») se il cliente non ha un altro percorso incassato; il progetto del cliente passa ad `archiviato`;
  - `sales` `after update of client_id`: l'invito non usato della vendita passa a `revocato` (motivo «Vendita spostata su un altro cliente»).
  - Mai per un incasso annullato o corretto.
- Azioni dell'admin (RPC `security invoker`, ognuna scrive l'evento con `autore_id`):
  - `onboarding_conferma_pagamento(p_invito uuid)`: `in_attesa_pagamento` → `attivo`, `attivato_da = 'manuale'`. Non registra nessun incasso.
  - `onboarding_consenso_genitore(p_invito uuid, p_nota text)`: scrive `consenso_genitore_il`; se la vendita ha già un incasso o il pagamento è stato confermato a mano, attiva.
  - `onboarding_revoca(p_invito uuid, p_motivo text)` e `onboarding_riattiva(p_invito uuid)` (torna `attivo` se era stato attivato, altrimenti `in_attesa_pagamento`).
  - `onboarding_rigenera_link(p_invito uuid)`: nuovo token e nuovo hash sullo stesso invito non usato (anche `scaduto` o `revocato`: torna allo stato che il pagamento giustifica), evento `link_rigenerato`.
  - `onboarding_imposta_incarichi(p_client_id uuid, p_coach uuid, p_revisore uuid, p_responsabile uuid)`: aggiorna gli incarichi e, se il link è attivo, riallinea progetto e task.
- View `v_onboarding` (`security_invoker`): una riga per cliente con un percorso: nome e cognome, `client_id`, `sale_id`, stato dell'invito (con `scaduto` calcolato se `scade_il < now()`), `attivato_il`, `attivato_da`, `minorenne`, `consenso_genitore_il`, stato del percorso, lo step corrente (il primo non `fatto` per `ordine`) e il suo attore, i nomi di coach, revisore e responsabile, `progetto_id`, `created_at`. La legge solo l'admin (RLS delle tabelle sotto).
- View `v_vendite_senza_onboarding` (`security_invoker`): le vendite `nuovo` con `data_fine >= oggi` il cui cliente non ha né invito né percorso; cliente, data, prodotto. Mai importi.
- Notifiche: il check `notifiche_tipo_check` accetta `onboarding_pagamento` (canale `app`).

## Codice

- `lib/validation/onboarding.ts`: schemi Zod condivisi (wizard, avvio da una vendita, incarichi, Telegram, azioni). Il wizard riusa `nuovaVenditaSchema` per la parte vendita.
- `lib/onboarding/operazioni.ts` (`server-only`, prende il client come parametro, come gli altri nuclei) e `lib/onboarding/letture.ts`.
- `lib/onboarding/link.ts`: `linkJoin(slug, token)` da `APP_URL` (`/join/<slug>-<token>`) e il messaggio pronto della specifica (sezione 2.1.1), nei dizionari.
- `app/(app)/onboarding/actions.ts`: server action con la sessione dei cookie, mai il `service_role`; ogni action rivalida `/onboarding`, la scheda del cliente e della vendita.
- Notifiche: `lib/notifiche/tipi.ts`, `components/notifiche/icona-tipo.tsx`, `lib/i18n/testi/notifiche.ts` (tipo «Onboarding», bottone «Apri l'onboarding»).
- `lib/nav.ts`: voce «Onboarding» per l'admin nel gruppo **Vendite**, dopo «Clienti» (icona Lucide `Rocket`); mai nella barra in basso; test `tests/nav.test.ts` aggiornato.
- `lib/changelog/versioni.ts` 1.77.0 (voci `admin`), `package.json` 1.77.0, `CLAUDE.md`.

## Interfaccia (solo admin)

Stile del gestionale (sezione 11 di `CLAUDE.md`): sobrio, token del tema, tema chiaro e scuro, mobile first a 390 px, tocco 44 px, i quattro stati (scheletro, vuoto, errore con «Riprova», toast). Il wizard deve essere fluido e curato: indicatore dei 3 passi, passaggio tra le schermate con una transizione breve (solo CSS, `transform` e `opacity`, ferma con riduzione movimento), focus sul titolo della schermata a ogni passo, un'azione primaria per schermata. Nessuna dipendenza nuova.

1. **Wizard** `/onboarding/nuovo`
   - Ingressi: `?call=<id>` (call chiusa senza vendita: dati dal lead e dalla call), senza parametri (dal menu), `?vendita=<id>` o `?cliente=<id>` (vendita `nuovo` che esiste: salta la schermata Vendita, è «Avvia onboarding»).
   - Schermata **Cliente**: nome, cognome, email, telefono, username Telegram, Instagram; casella «Il cliente è minorenne» (se sì: riga «Il link resta fermo finché non registri il consenso di un genitore»).
   - Schermata **Vendita**: gli stessi campi e le stesse regole di «Nuova vendita» (prodotto o fuori catalogo, contratto, piano rate uguale o a mano, data di vendita, inizio del percorso), riusando componenti e schema.
   - Schermata **Team**: coach, revisore, responsabile (select tra i profili attivi; predefiniti da `onboarding_impostazioni`, altrimenti responsabile = chi sta usando il wizard).
   - Riepilogo e conferma. Schermata finale: «Onboarding avviato per <Nome>», lo stato del link («Il link si attiva appena registri il pagamento» o «Pagamento confermato»), «Conferma pagamento», «Apri la scheda», «Apri il progetto». «Copia link» e il messaggio pronto compaiono solo con `aperto_ai_clienti`; altrimenti una riga: «L'area clienti non è ancora aperta: il link si potrà mandare dal prossimo rilascio.»
2. **Onboarding** `/onboarding`: titolo, «Nuovo cliente». Lista in tre gruppi: «Tocca a noi», «Tocca al cliente», «In attesa di pagamento o di registrazione» (in A i primi due sono quasi sempre vuoti e non si mostrano se vuoti); ogni riga: nome, stato in parole con icona, da quando, coach. Sotto, «Vendite nuove senza onboarding (n)» con «Avvia onboarding». Vuoto: «Nessun onboarding in corso» con «Nuovo cliente».
3. **Scheda** `/onboarding/[clientId]`: intestazione con nome e stato; riquadro Link (stato, attivato il e come, scadenza, azioni: «Conferma pagamento», «Registra il consenso del genitore», «Rigenera link», «Revoca» con motivo e seconda conferma, «Riattiva»; «Copia link» e «Copia il messaggio» solo con `aperto_ai_clienti`); riquadro Team (incarichi, modificabili); riquadro Telegram (username, link del gruppo privato); gli step del flusso come elenco con lo stato; il registro degli eventi in parole; link a scheda del cliente, vendita e progetto.
4. **Agganci**: nella scheda della call chiusa senza vendita, per l'admin, «Nuovo cliente» come azione primaria e «Registra solo la vendita» come secondaria (per il closer non cambia niente); dopo l'esito «Chiusa» l'admin arriva al wizard; nella scheda della vendita `nuovo` e nella scheda del cliente «Avvia onboarding» se manca, altrimenti il link alla scheda di onboarding. In Impostazioni: una pagina «Onboarding» (incarichi predefiniti, link della community, giorni di validità del link; `aperto_ai_clienti` in sola lettura con la sua spiegazione).

## Test

- pgTAP `109_onboarding_dati.sql` (RLS per ruolo: admin tutto; setter, closer, coach non incaricato, marketing, business coach e token di Claude zero righe o 42501; l'incaricato legge il percorso solo da `in_corso`, mai inviti, token ed eventi), `110_onboarding_avvio_gate.sql` (avvio, `nuovo_cliente` in una transazione, invito già attivo se la vendita è già incassata, gate da ogni strada compreso il closer che incassa, conferma manuale, minorenne, revoca per rimborso totale, vendita eliminata con progetto archiviato, incasso annullato che non revoca, riattivazione, rigenera, un solo invito vivo, un rinnovo rifiutato, `pm_scegli_coach` che non tocca i task con incarico, i task di onboarding che non si riaprono al rinnovo, un incasso che non fallisce mai per colpa dell'onboarding, backup senza i token).
- Aggiornati: `00_schema.sql`, `66_ruolo_marketing.sql`, `75_mcp_oauth.sql`, `101_business_coach.sql`, i test dei progetti cliente (`47`, `49`, `50`) se cambiano.
- Seed `supabase/seeds/60_onboarding.sql`: un cliente inventato con vendita, invito in attesa, percorso e passi, più uno con il link attivo; idempotente, date relative.
- Vitest: schemi, slug, link e messaggio, mappatura degli stati in parole, `tests/nav.test.ts`, `tests/i18n-chiavi.test.ts`, changelog.
- e2e `e2e/onboarding.spec.ts`: l'admin apre il wizard dal menu, crea un cliente nuovo, arriva alla schermata finale, conferma il pagamento, vede la scheda e la notifica; il setter non vede la voce e `/onboarding` lo rimanda. `e2e/utenti.ts`: pagine `onboarding` e `onboarding-nuovo` per l'admin.
- Tutto verde: `npm run typecheck`, `npm run lint`, `npm run test` (restano i 5 fallimenti noti di `tests/alfire-scritture.test.ts`, legati alla data), `npx supabase test db`.
