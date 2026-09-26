# Alpha Economics: procedura operativa

Dall'Excel alla dashboard online con login del team. Cinque fasi, ognuna chiusa da una verifica. Costo mensile: 0€ (Supabase Free, Vercel Hobby, Google OAuth gratuito).

Tempo stimato: 5-7 sessioni da 2-3 ore.

---

## Step 0. Prerequisiti sul Mac (20 minuti)

```bash
# Node 22 LTS, Git e Supabase CLI
brew install node@22 git supabase/tap/supabase

# Docker Desktop deve essere avviato: Supabase locale gira su Docker
docker info

# Verifica versioni
node -v && npm -v && supabase --version && claude --version
```

Account necessari, tutti gratuiti: GitHub, Vercel (registrati con "Continue with GitHub"), Supabase (login con GitHub), Google Cloud Console (con il tuo account Google).

---

## Step 1. Cartella di progetto (5 minuti)

```bash
mkdir ~/Projects/alpha-economics && cd ~/Projects/alpha-economics
git init
mkdir import
```

1. Copia `CLAUDE.md` nella radice della cartella.
2. Copia l'Excel `MMM x Percorso Alpha DM Tracking.xlsx` dentro `import/`.
3. Crea `.gitignore` con almeno:

```
node_modules
.next
.env*
!.env.example
.shots
import/
```

La cartella `import/` contiene dati economici reali e non va mai su GitHub.

---

## Step 2. Progetto Supabase cloud (15 minuti)

1. supabase.com > New project. Nome `alpha-economics`, regione **Central EU (Frankfurt)**, password del database generata e salvata nel password manager.
2. Annota il **Project ref**: è la stringa nell'URL della dashboard (`supabase.com/dashboard/project/<ref>`).
3. Project Settings > API Keys: qui trovi la **publishable key** e la **secret key**. Non copiarle da nessuna parte per ora. Vanno solo in `.env.local` e su Vercel.

---

## Step 3. Google OAuth (20 minuti)

1. console.cloud.google.com > nuovo progetto `Alpha Economics`.
2. Google Auth Platform (schermata di consenso OAuth):
   - tipo di utente **Esterno**;
   - nome app "Alpha Economics", email di supporto, email sviluppatore;
   - scope: solo `openid`, `email`, `profile`. Con soli questi scope non serve la verifica di Google;
   - pubblica l'app ("In produzione").
3. Client > Crea client OAuth > **Applicazione web**:
   - Origini JavaScript autorizzate: `http://localhost:3000`;
   - URI di reindirizzamento autorizzati:
     - `https://<ref>.supabase.co/auth/v1/callback`
     - `http://127.0.0.1:54321/auth/v1/callback` (Supabase locale)
4. Copia Client ID e Client secret direttamente in Supabase: Authentication > Sign In / Providers > Google > abilita e incolla. Salva.
5. Supabase > Authentication > URL Configuration:
   - Site URL: `http://localhost:3000` (lo cambi allo Step 9);
   - Redirect URLs: `http://localhost:3000/**`.

Per il login locale con Google, Claude Code configurerà `supabase/config.toml` leggendo Client ID e secret da `supabase/.env`, che compili tu a mano.

---

## Step 4. Fase 1 con Claude Code: fondamenta (una sessione)

```bash
cd ~/Projects/alpha-economics
claude
```

Attiva la **plan mode** (Shift+Tab finché compare "plan mode") e incolla:

```
Leggi CLAUDE.md per intero. Esegui la Fase 1 della sezione 16.
Prima mostrami il piano: struttura cartelle, elenco migration, elenco test pgTAP, file che creerai.
La mia email Google per l'invito admin è: <tua email>.
Non scrivere codice finché non approvo il piano.
```

Approvato il piano, esci dalla plan mode e lascia lavorare. Quando chiede le variabili d'ambiente, crea tu `.env.local` a partire da `.env.example` e incolla i valori nel file, non in chat. Per lo sviluppo locale i valori sono quelli stampati da `supabase start`, non quelli cloud.

**Verifica di fine fase (tu, a mano):**
1. `npm run dev`, apri `http://localhost:3000`.
2. Login con gli utenti seed admin, setter e closer: ognuno vede solo la propria navigazione.
3. Login con Google con la tua email: entri come admin.
4. Login con Google con un'altra email non invitata: accesso negato.
5. `supabase test db` tutto verde.

Poi: `git add . && git commit` con il messaggio proposto da Claude Code.

---

## Step 5. Fase 2: inserimento dati (una o due sessioni)

```
Esegui la Fase 2 di CLAUDE.md. Parti dalla schermata Oggi del setter: è la più importante.
Fermati dopo ogni schermata completata e dimmi come verificarla.
```

A fine fase:

```
/design-loop
```

Il ciclo: `ui-critic` fotografa ogni pagina a 390px e 1440px e produce al massimo 10 correzioni, tu approvi quali applicare, `ui-refiner` le applica, `ui-critic` ricontrolla. Massimo due giri.

**Verifica:** dal telefono, sulla stessa rete Wi-Fi, apri `http://<IP del Mac>:3000` (IP da `ipconfig getifaddr en0`), entra come setter seed e compila un report completo. Cronometra: sotto i 60 secondi. Poi registra una call, segnala come chiusa, crea la vendita in 3 rate e segna la prima come incassata.

---

## Step 6. Fase 3: dashboard (una o due sessioni)

```
Esegui la Fase 3 di CLAUDE.md. Prima le view e le RPC delle metriche con i test, poi le schermate.
Per ogni metrica della sezione 9 mostrami il valore calcolato sul seed e la query usata.
```

Poi `/design-loop`.

**Verifica:** scegli un mese del seed e ricalcola a mano cash incassato, revenue firmata e close rate. Devono coincidere al centesimo con la Panoramica. Tieni aperta la Panoramica come admin, entra come setter da un'altra finestra in incognito e modifica il report: la Panoramica si aggiorna da sola.

---

## Step 7. Fase 4: gestione utenti (una sessione)

```
Esegui la Fase 4 di CLAUDE.md.
```

**Verifica:** invita un tuo secondo account Google come setter, entra, controlla che non veda vendite, costi e margine (prova anche ad aprire direttamente `/sales` e `/expenses` dall'URL). Cambia ruolo, disattiva, riattiva. Controlla l'audit log.

---

## Step 8. GitHub (10 minuti)

1. github.com > New repository > `alpha-economics`, **privato**, senza README.
2. Dalla cartella:

```bash
git remote add origin git@github.com:<utente>/alpha-economics.git
git branch -M main
git push -u origin main
```

Controlla su GitHub che non esistano `.env.local` né la cartella `import/`.

---

## Step 9. Database cloud e deploy su Vercel (30 minuti)

**Schema sul database cloud:**

```bash
supabase link --project-ref <ref>
supabase db push
```

Il seed di prova non va in cloud: lo usa solo il database locale.

**Vercel:**
1. vercel.com > Add New > Project > importa `alpha-economics`.
2. **Prima di cliccare Deploy**, in Environment Variables aggiungi (Production e Preview), con i valori del progetto Supabase **cloud**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `NEXT_PUBLIC_APP_URL` (per ora l'URL `.vercel.app`, poi il dominio)
   - `CRON_SECRET` (genera con `openssl rand -hex 32`)
   - `ENABLE_DEV_LOGIN` **non** va aggiunta.
3. Deploy.
4. Supabase > Authentication > URL Configuration:
   - Site URL: l'URL di produzione;
   - Redirect URLs: aggiungi `https://<progetto>.vercel.app/**` e `https://<progetto>-*-<team>.vercel.app/**` per le preview.
5. Google Cloud > client OAuth > Origini JavaScript: aggiungi l'URL di produzione. I redirect non cambiano: passano sempre da Supabase.

**Verifica:** login con Google sull'URL `.vercel.app`. Solo dopo che funziona, passa al dominio.

**Dominio (opzionale):** Vercel > Settings > Domains > `dashboard.<tuodominio>`, poi presso il provider DNS un record CNAME verso `cname.vercel-dns.com`. Aggiorna Site URL, Redirect URLs su Supabase, `NEXT_PUBLIC_APP_URL` su Vercel e origini su Google. Redeploy.

---

## Step 10. Fase 5: dati reali (una sessione)

```
Esegui la Fase 5 di CLAUDE.md, parte import. Il file è import/MMM x Percorso Alpha DM Tracking.xlsx.
I report giornalieri vanno assegnati all'utente setter di Loris.
Lancia prima lo script in locale e mostrami il riepilogo, poi contro il cloud solo dopo mia conferma.
```

1. Invita Loris dalla pagina Team **prima** dell'import e fagli fare il primo accesso: il profilo nasce al primo login, e lo script lo cerca per email.
2. Crea almeno un prodotto in Impostazioni > Prodotti (il cloud parte senza prodotti).
3. Le chiavi del progetto cloud vanno in un file `.env.cloud.local` (stessi nomi di `.env.local`, escluso da git). Mai in chat.
4. Primo passaggio, prima in prova e poi davvero:

```bash
npx tsx --env-file=.env.cloud.local scripts/import-excel.ts "import/MMM x Percorso Alpha DM Tracking.xlsx" --setter <email di Loris> --closer <tua email> --segnaposto --cloud --prova
```

   Senza `--prova` crea report, pagamenti al setter, la regola del 5% se manca e `import/vendite-da-completare.csv`. Con `--segnaposto` il CSV è già compilato con clienti segnaposto; altrimenti compila tu nome, prodotto, numero rate e `da_setter` (sì se il cliente è di Loris).
5. Secondo passaggio: stessa riga con `--passaggio 2`. Crea clienti, vendite e incassi; se il CSV non torna con l'Excel si ferma senza scrivere nulla.
6. Controlla la Panoramica di luglio: cash 4.500€ e revenue 7.500€, come nell'Excel. Provvigioni di luglio: maturato 212,50€, pagato 212,50€.
7. Correggi dall'app nomi dei clienti, rate successive e rinnovi dei clienti attivi, partendo da chi scade prima: ogni campo resta modificabile.

Lo script si può rilanciare: ciò che esiste già non viene duplicato né sovrascritto.

**Verifica finale:** Loris compila il primo report reale dal telefono. Da quel giorno l'Excel si chiude.

---

## Routine a regime

| Chi | Quando | Cosa |
|---|---|---|
| Loris | ogni sera | report di oggi, più una call per ogni appuntamento fissato |
| Dany (closer) | dopo ogni call | esito, e se chiusa vendita con piano rate |
| Dany (admin) | a ogni incasso | "Segna rata incassata" |
| Dany (admin) | 1 del mese | chiusura mese: rate in ritardo, provvigioni da pagare, costi, export CSV per la commercialista |

---

## Regole da non violare

- Mai chiavi, secret o token in chat con Claude Code: vanno solo in `.env.local`, `supabase/.env` e Vercel. Se ne incolli uno per sbaglio, rigeneralo.
- Variabili d'ambiente su Vercel prima del primo deploy.
- Nessuna fase nuova finché la verifica di quella precedente non è passata.
- Nessuna modifica dello schema direttamente dalla dashboard Supabase: solo migration, altrimenti locale e cloud divergono.
