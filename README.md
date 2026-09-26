# Alpha Economics

Setting, vendite ed economia di Percorso Alpha. La specifica è in [CLAUDE.md](CLAUDE.md),
la procedura operativa in [PROCEDURA.md](PROCEDURA.md).

## Avvio in locale

Serve Node 22, Docker (OrbStack) e la CLI Supabase.

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH   # node@22 è keg-only
npm install
supabase start          # stampa URL e chiavi locali
cp .env.example .env.local   # poi incolla i valori di supabase start
npm run dev
```

Utenti di prova (solo in locale, `ENABLE_DEV_LOGIN=true`):
`admin@alpha.test`, `setter@alpha.test`, `closer@alpha.test`.
La password è nel commento in cima a `supabase/seed.sql`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | app su http://localhost:3000 |
| `npm run typecheck` | TypeScript in strict mode |
| `npm run lint` | ESLint |
| `npm test` | Vitest (logica e formattazione) |
| `npm run db:reset` | riapplica migration e seed sul database locale |
| `npm run db:test` | test pgTAP dei permessi (`supabase test db`) |
| `npm run db:types` | rigenera `lib/supabase/database.types.ts` |
| `npm run e2e` | Playwright: accesso e navigazione per ruolo |
| `npm run shots` | screenshot di ogni pagina a 390px e 1440px in `.shots/` |

Dopo ogni modifica allo schema: `npm run db:reset && npm run db:types && npm run db:test`.

## Struttura

```
app/(app)/        pagine dentro la shell autenticata
app/login/        accesso Google (+ login locale di sviluppo)
components/ui/    shadcn/ui
components/shell/ sidebar, bottom bar, top bar
lib/supabase/     client server / browser / admin
lib/format.ts     formattazione euro, date, percentuali
supabase/migrations/  schema, RLS, trigger
supabase/tests/       pgTAP: la matrice dei permessi
e2e/              Playwright
```
