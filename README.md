# Alpha Dashboard — Instagram Reels Analytics

Analisi automatica dei tuoi Instagram Reels degli ultimi 14 giorni.

## Prerequisiti

- Node.js 18+
- Claude Code installato e autenticato
- Account Composio con API key

## Setup

1. Aggiungi la tua chiave nel file `.env`:
   ```
   COMPOSIO_API_KEY=la-tua-chiave
   ```

2. Installa le dipendenze:
   ```bash
   npm install
   ```

## Utilizzo

### Step 1 — Raccolta dati (primo avvio)

```bash
npm run agent
```

La **prima volta** Composio stampa un link di autorizzazione Instagram. Aprilo nel browser, fai login e approva l'accesso. Poi rilancia il comando.

### Step 2 — Genera il report

```bash
npm run render
```

Apri `report.html` nel browser per vedere il report completo.

## Cosa contiene il report

- **Reach Multiplier** — quanto ha performato il tuo reel migliore vs. la media
- **Pattern Caption** — parole nei top 5 reels assenti nei bottom 5
- **Da Fare Di Più / Da Smettere / Da Sistemare** — classificazione dei tuoi contenuti
- **Statistiche medie** — reach, views, likes, shares, watch time
- **Classifica completa** — tutti i reels ordinati per hook score

## Metriche calcolate

| Metrica | Formula |
|---|---|
| `watch_s` | `ig_reels_avg_watch_time / 1000` |
| `hook_rate` | `watch_s / duration` |
| `hook_score` | `hook_rate × √reach × (1 + share_pct/100 + save_pct/200)` |
| `replay_rate` | `views / reach` |
| `share_pct` | `shares / reach × 100` |
| `save_pct` | `saved / reach × 100` |

## File generati

- `data.json` — dati grezzi dei reels
- `thumbs/` — miniature scaricate
- `report.html` — report finale auto-contenuto
