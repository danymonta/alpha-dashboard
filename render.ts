import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ReelData {
  id: string;
  caption: string;
  permalink: string;
  thumbnail_url: string;
  timestamp: string;
  duration: number;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  total_interactions: number;
  ig_reels_avg_watch_time: number;
}

interface ReelMetrics extends ReelData {
  watch_s: number;
  hook_rate: number;
  hook_score: number;
  replay_rate: number;
  share_pct: number;
  save_pct: number;
  thumbnail_b64: string;
  date_label: string;
}

function pct(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function percentileRank(val: number, arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = sorted.findIndex(v => v >= val);
  return idx === -1 ? 100 : Math.round((idx / sorted.length) * 100);
}

function normalize(val: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.round(((val - min) / (max - min)) * 100);
}

function downloadThumbnail(url: string, filepath: string): boolean {
  if (!url) return false;
  try {
    execSync(`curl -sL -o "${filepath}" "${url}"`, { timeout: 15000 });
    return existsSync(filepath);
  } catch {
    return false;
  }
}

function toBase64(filepath: string): string {
  try {
    const buf = readFileSync(filepath);
    return 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch {
    return '';
  }
}

function extractWords(caption: string): string[] {
  const stopWords = new Set([
    'il', 'la', 'lo', 'i', 'le', 'gli', 'un', 'una', 'uno', 'del', 'della', 'dello',
    'dei', 'delle', 'degli', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'e', 'o', 'ma', 'se', 'che', 'non', 'ho', 'ha', 'ai', 'al', 'a', 'è', 'ci',
    'mi', 'ti', 'si', 'ne', 'vi', 'li', 'le', 'me', 'te', 'it', 'is', 'the', 'a',
    'and', 'in', 'to', 'of', 'for', 'on', 'with', 'at', 'by', 'from', 'this',
  ]);
  return caption
    .toLowerCase()
    .replace(/[^a-zàèéìòùa-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));
}

function patternCallout(top5: ReelMetrics[], bottom5: ReelMetrics[]): string[] {
  const topWords = new Set(top5.flatMap(r => extractWords(r.caption)));
  const bottomWords = new Set(bottom5.flatMap(r => extractWords(r.caption)));
  return [...topWords].filter(w => !bottomWords.has(w)).slice(0, 8);
}

function diagnosisTags(reel: ReelMetrics, avgReach: number, p80: number, p20: number): string[] {
  const tags: string[] = [];
  if (reel.hook_score >= p80) tags.push('Top performer');
  if (reel.hook_score <= p20) tags.push('Bassa performance');
  if (reel.replay_rate >= 1.3) tags.push('Alto replay');
  if (reel.save_pct >= 5) tags.push('Molto salvato');
  if (reel.share_pct >= 3) tags.push('Alto share');
  if (reel.reach < avgReach * 0.6) tags.push('Reach bassa');
  if (reel.hook_rate < 0.25 && reel.duration > 0) tags.push('Watch time basso');
  if (tags.length === 0) tags.push('Nella media');
  return tags;
}

const TAG_COLORS: Record<string, string> = {
  'Top performer': '#16a34a',
  'Bassa performance': '#dc2626',
  'Alto replay': '#7c3aed',
  'Molto salvato': '#0891b2',
  'Alto share': '#b45309',
  'Reach bassa': '#9ca3af',
  'Watch time basso': '#f59e0b',
  'Nella media': '#6b7280',
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function fmtDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  } catch {
    return ts.slice(0, 10);
  }
}

function bar(val: number, max: number, color: string): string {
  const w = max > 0 ? Math.round((val / max) * 120) : 0;
  return `<div style="background:#e5e7eb;border-radius:4px;height:8px;width:120px;overflow:hidden">
    <div style="background:${color};height:100%;width:${Math.min(w, 120)}px;border-radius:4px"></div>
  </div>`;
}

function reelCard(reel: ReelMetrics, rank: number, maxReach: number, maxHookScore: number, avgReach: number, p80: number, p20: number): string {
  const tags = diagnosisTags(reel, avgReach, p80, p20);
  const tagHtml = tags.map(t => `<span style="background:${TAG_COLORS[t] ?? '#6b7280'};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;margin-right:4px">${t}</span>`).join('');
  const thumb = reel.thumbnail_b64
    ? `<img src="${reel.thumbnail_b64}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0">`
    : `<div style="width:80px;height:80px;background:#e5e7eb;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:20px">📹</div>`;

  return `
  <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px">
    <div style="display:flex;gap:16px;align-items:flex-start">
      <div style="color:#9ca3af;font-size:18px;font-weight:700;min-width:24px;text-align:center">${rank}</div>
      ${thumb}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:#374151;margin-bottom:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
          <a href="${reel.permalink}" target="_blank" style="color:#1d4ed8;text-decoration:none">${reel.caption || '(nessuna caption)'}</a>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:8px">${reel.date_label} · ${reel.duration > 0 ? reel.duration + 's' : '?s'}</div>
        <div style="margin-bottom:8px">${tagHtml}</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px">
          <div>
            <div style="color:#6b7280;font-size:10px">REACH</div>
            <div style="font-weight:700;color:#111827">${formatNum(reel.reach)}</div>
            ${bar(reel.reach, maxReach, '#3b82f6')}
          </div>
          <div>
            <div style="color:#6b7280;font-size:10px">HOOK SCORE</div>
            <div style="font-weight:700;color:#111827">${reel.hook_score.toFixed(1)}</div>
            ${bar(reel.hook_score, maxHookScore, '#8b5cf6')}
          </div>
          <div>
            <div style="color:#6b7280;font-size:10px">WATCH</div>
            <div style="font-weight:700;color:#111827">${reel.watch_s.toFixed(1)}s</div>
            ${bar(reel.watch_s, reel.duration || 60, '#10b981')}
          </div>
          <div>
            <div style="color:#6b7280;font-size:10px">SAVES</div>
            <div style="font-weight:700;color:#111827">${formatNum(reel.saved)}</div>
            ${bar(reel.save_pct, 20, '#f59e0b')}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function miniCard(reel: ReelMetrics, label: string, color: string): string {
  const thumb = reel.thumbnail_b64
    ? `<img src="${reel.thumbnail_b64}" style="width:100%;height:120px;object-fit:cover;border-radius:8px 8px 0 0">`
    : `<div style="width:100%;height:120px;background:#e5e7eb;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:32px">📹</div>`;
  return `
  <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    ${thumb}
    <div style="padding:10px">
      <div style="font-size:10px;font-weight:700;color:${color};margin-bottom:4px">${label}</div>
      <div style="font-size:11px;color:#374151;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${reel.caption || '(nessuna caption)'}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px">Reach: ${formatNum(reel.reach)} · Score: ${reel.hook_score.toFixed(1)}</div>
    </div>
  </div>`;
}

async function main() {
  const dataPath = path.join(__dirname, 'data.json');
  if (!existsSync(dataPath)) {
    console.error('data.json non trovato. Esegui prima: npm run agent');
    process.exit(1);
  }

  const raw: ReelData[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
  if (!raw.length) {
    console.error('Nessun reel trovato in data.json');
    process.exit(1);
  }

  console.log(`Elaborazione ${raw.length} reels...`);

  const thumbsDir = path.join(__dirname, 'thumbs');
  mkdirSync(thumbsDir, { recursive: true });

  // Compute metrics and download thumbnails
  const reels: ReelMetrics[] = raw.map(r => {
    const watch_s = r.ig_reels_avg_watch_time > 0 ? r.ig_reels_avg_watch_time / 1000 : 0;
    const dur = r.duration > 0 ? r.duration : 0;
    const hook_rate = dur > 0 ? Math.min(watch_s / dur, 1) : 0;
    const reach = r.reach > 0 ? r.reach : 1;
    const share_pct = pct(r.shares, reach) * 100;
    const save_pct = pct(r.saved, reach) * 100;
    const hook_score = hook_rate * Math.sqrt(reach) * (1 + share_pct / 100 + save_pct / 200);
    const replay_rate = pct(r.views, reach);

    const thumbPath = path.join(thumbsDir, r.id + '.jpg');
    let downloaded = false;
    if (!existsSync(thumbPath) && r.thumbnail_url) {
      process.stdout.write(`  Scarico thumb ${r.id}... `);
      downloaded = downloadThumbnail(r.thumbnail_url, thumbPath);
      console.log(downloaded ? 'OK' : 'FAIL');
    } else if (existsSync(thumbPath)) {
      downloaded = true;
    }
    const thumbnail_b64 = downloaded ? toBase64(thumbPath) : '';

    return {
      ...r,
      watch_s,
      hook_rate,
      hook_score,
      replay_rate,
      share_pct,
      save_pct,
      thumbnail_b64,
      date_label: fmtDate(r.timestamp),
    };
  });

  // Sort by hook_score descending
  reels.sort((a, b) => b.hook_score - a.hook_score);

  const hookScores = reels.map(r => r.hook_score);
  const reaches = reels.map(r => r.reach);
  const avgReach = reaches.reduce((s, v) => s + v, 0) / reaches.length;
  const maxReach = Math.max(...reaches);
  const maxHookScore = Math.max(...hookScores);

  const p80idx = Math.floor(reels.length * 0.8);
  const p20idx = Math.floor(reels.length * 0.2);
  const p80 = hookScores[reels.length - 1 - p80idx] ?? 0;
  const p20 = hookScores[reels.length - 1 - p20idx] ?? 0;

  const top5 = reels.slice(0, Math.min(5, reels.length));
  const bottom5 = reels.slice(-Math.min(5, reels.length));
  const patterns = patternCallout(top5, bottom5);

  // Multiplier insight
  const topReel = reels[0];
  const multiplier = avgReach > 0 ? (topReel.reach / avgReach).toFixed(1) : '?';

  // 3-panel grid
  const doMore = reels.filter(r => r.hook_score >= (p80 || maxHookScore * 0.6)).slice(0, 3);
  const stop = reels.filter(r => r.hook_score <= (p20 || maxHookScore * 0.2)).slice(-3);
  const fix = reels.filter(r => r.reach >= avgReach && r.hook_rate < 0.3 && r.duration > 0).slice(0, 3);

  // Avg stats
  const avgViews = reels.reduce((s, r) => s + r.views, 0) / reels.length;
  const avgLikes = reels.reduce((s, r) => s + r.likes, 0) / reels.length;
  const avgShares = reels.reduce((s, r) => s + r.shares, 0) / reels.length;
  const avgSaved = reels.reduce((s, r) => s + r.saved, 0) / reels.length;
  const avgWatch = reels.reduce((s, r) => s + r.watch_s, 0) / reels.length;

  const today = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

  const panelHtml = (title: string, color: string, icon: string, items: ReelMetrics[], emptyMsg: string) => `
  <div style="background:#f9fafb;border-radius:12px;padding:16px">
    <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:12px">${icon} ${title}</div>
    ${items.length ? items.map(r => miniCard(r, '', color)).join('') : `<div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px">${emptyMsg}</div>`}
  </div>`;

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instagram Reels Report · ${today}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; color: #111827; padding: 24px; }
  .container { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 24px; font-weight: 800; color: #111827; }
  h2 { font-size: 16px; font-weight: 700; color: #374151; margin-bottom: 12px; }
  .card { background: white; border-radius: 16px; padding: 20px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
  .stat-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .stat { text-align: center; }
  .stat-val { font-size: 22px; font-weight: 800; color: #111827; }
  .stat-lbl { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .panel-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
  @media (max-width: 600px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } .panel-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div style="margin-bottom:24px">
    <h1>📊 Instagram Reels Report</h1>
    <div style="color:#6b7280;font-size:13px;margin-top:4px">${since} — ${today} · ${reels.length} reels analizzati</div>
  </div>

  <!-- Insight card -->
  <div class="card" style="background:linear-gradient(135deg,#1d4ed8,#7c3aed);color:white;border:none">
    <div style="font-size:12px;font-weight:600;opacity:0.8;margin-bottom:8px">TOP REACH MULTIPLIER</div>
    <div style="font-size:28px;font-weight:900;margin-bottom:4px">${multiplier}x</div>
    <div style="font-size:14px;opacity:0.9">
      Il tuo reel migliore ha raggiunto <strong>${formatNum(topReel.reach)}</strong> persone,
      ${Number(multiplier) > 1 ? `${multiplier}x la media di ${formatNum(Math.round(avgReach))}` : `vs. media ${formatNum(Math.round(avgReach))}`}.
    </div>
    <div style="font-size:12px;opacity:0.7;margin-top:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
      "${topReel.caption || 'nessuna caption'}"
    </div>
  </div>

  <!-- Pattern callout -->
  ${patterns.length ? `
  <div class="card">
    <h2>🔍 Pattern nelle Top 5 Caption</h2>
    <div style="font-size:13px;color:#6b7280;margin-bottom:10px">Parole nei tuoi 5 reels migliori che non compaiono nei 5 peggiori:</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      ${patterns.map(w => `<span style="background:#eff6ff;color:#1d4ed8;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600">${w}</span>`).join('')}
    </div>
  </div>` : ''}

  <!-- 3-panel grid -->
  <div style="margin-bottom:8px"><h2>🎯 Cosa Fare</h2></div>
  <div class="panel-grid">
    ${panelHtml('Da Fare Di Più', '#16a34a', '🚀', doMore, 'Nessun reel in questa fascia')}
    ${panelHtml('Da Smettere', '#dc2626', '❌', stop, 'Nessun reel in questa fascia')}
    ${panelHtml('Da Sistemare', '#f59e0b', '🔧', fix, 'Nessun reel in questa fascia')}
  </div>

  <!-- Quick stats -->
  <div class="card">
    <h2>📈 Media degli ultimi 14 giorni</h2>
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${formatNum(Math.round(avgReach))}</div><div class="stat-lbl">REACH MEDIA</div></div>
      <div class="stat"><div class="stat-val">${formatNum(Math.round(avgViews))}</div><div class="stat-lbl">VIEWS MEDIE</div></div>
      <div class="stat"><div class="stat-val">${formatNum(Math.round(avgLikes))}</div><div class="stat-lbl">LIKES MEDI</div></div>
      <div class="stat"><div class="stat-val">${formatNum(Math.round(avgShares))}</div><div class="stat-lbl">SHARES MEDI</div></div>
      <div class="stat"><div class="stat-val">${avgWatch.toFixed(1)}s</div><div class="stat-lbl">WATCH TIME MEDIO</div></div>
    </div>
  </div>

  <!-- Full ranked list -->
  <div style="margin-bottom:12px"><h2>🏆 Classifica Completa</h2></div>
  ${reels.map((r, i) => reelCard(r, i + 1, maxReach, maxHookScore, avgReach, p80, p20)).join('')}

  <div style="text-align:center;color:#9ca3af;font-size:11px;margin-top:24px;padding-bottom:24px">
    Generato il ${today} · Alpha Dashboard
  </div>
</div>
</body>
</html>`;

  const outPath = path.join(__dirname, 'report.html');
  writeFileSync(outPath, html, 'utf-8');
  console.log(`\nReport salvato: report.html (${reels.length} reels, ${Math.round(html.length / 1024)}KB)`);
  console.log('Apri report.html nel browser per visualizzarlo.');
}

main().catch(err => {
  console.error('Errore:', err.message ?? err);
  process.exit(1);
});
