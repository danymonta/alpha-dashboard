import type { ReelData } from './instagram';

export interface ReelMetrics extends ReelData {
  watch_s: number;
  hook_rate: number;
  hook_score: number;
  replay_rate: number;
  share_pct: number;
  save_pct: number;
  tags: string[];
}

export interface DashboardStats {
  reels: ReelMetrics[];
  avgReach: number;
  avgViews: number;
  avgLikes: number;
  avgShares: number;
  avgWatchS: number;
  topMultiplier: number;
  topReel: ReelMetrics;
  patternWords: string[];
  p80: number;
  p20: number;
  fetchedAt: string;
}

function safe(n: number, d: number) {
  return d > 0 ? n / d : 0;
}

const STOP_WORDS = new Set([
  'il','la','lo','i','le','gli','un','una','uno','del','della','dello','dei','delle',
  'degli','di','da','in','con','su','per','tra','fra','e','o','ma','se','che','non',
  'ho','ha','ai','al','a','è','ci','mi','ti','si','ne','vi','li','me','te','this',
  'the','and','for','with','from','have','that','are','was','were','been','will',
]);

function extractWords(caption: string): Set<string> {
  return new Set(
    caption.toLowerCase()
      .replace(/[^a-zàèéìòù0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  );
}

export function computeMetrics(data: ReelData[]): DashboardStats {
  const withMetrics: ReelMetrics[] = data.map(r => {
    const reach = Math.max(r.reach, 1);
    const watch_s = r.ig_reels_avg_watch_time > 0 ? r.ig_reels_avg_watch_time / 1000 : 0;
    const duration = r.duration > 0 ? r.duration : 0;
    const hook_rate = duration > 0 ? Math.min(watch_s / duration, 1) : 0;
    const share_pct = safe(r.shares, reach) * 100;
    const save_pct = safe(r.saved, reach) * 100;
    const replay_rate = safe(r.views, reach);
    // When duration is unavailable use watch_s directly as engagement signal
    const hook_score = duration > 0
      ? hook_rate * Math.sqrt(reach) * (1 + share_pct / 100 + save_pct / 200)
      : watch_s * Math.sqrt(reach) * (1 + share_pct / 100 + save_pct / 200) / 10;
    return { ...r, watch_s, hook_rate, hook_score, replay_rate, share_pct, save_pct, tags: [] };
  });

  withMetrics.sort((a, b) => b.hook_score - a.hook_score);

  const scores = withMetrics.map(r => r.hook_score);
  const minScore = scores[scores.length - 1] ?? 0;
  const maxScoreVal = scores[0] ?? 0;
  const range = maxScoreVal - minScore;
  // p80 = value at 80th percentile (top 20%), p20 = value at 20th percentile (bottom 20%)
  const p80 = range > 0 ? minScore + range * 0.6 : maxScoreVal;
  const p20 = range > 0 ? minScore + range * 0.2 : minScore;
  const avgReach = withMetrics.reduce((s, r) => s + r.reach, 0) / withMetrics.length;

  withMetrics.forEach(r => {
    const tags: string[] = [];
    if (r.hook_score >= p80) tags.push('Top');
    if (r.hook_score <= p20) tags.push('Bassa perf.');
    if (r.replay_rate >= 1.3) tags.push('Alto replay');
    if (r.save_pct >= 5) tags.push('Molto salvato');
    if (r.share_pct >= 3) tags.push('Viral share');
    if (r.reach < avgReach * 0.6) tags.push('Reach bassa');
    if (r.hook_rate < 0.25 && r.duration > 0) tags.push('Watch basso');
    if (tags.length === 0) tags.push('Nella media');
    r.tags = tags;
  });

  const n = withMetrics.length;
  const avgViews = withMetrics.reduce((s, r) => s + r.views, 0) / n;
  const avgLikes = withMetrics.reduce((s, r) => s + r.likes, 0) / n;
  const avgShares = withMetrics.reduce((s, r) => s + r.shares, 0) / n;
  const avgWatchS = withMetrics.reduce((s, r) => s + r.watch_s, 0) / n;
  const topReel = withMetrics[0];
  const topMultiplier = avgReach > 0 ? topReel.reach / avgReach : 1;

  const top5 = withMetrics.slice(0, 5);
  const bottom5 = withMetrics.slice(-5);
  const topWords = new Set(top5.flatMap(r => [...extractWords(r.caption)]));
  const bottomWords = new Set(bottom5.flatMap(r => [...extractWords(r.caption)]));
  const patternWords = [...topWords].filter(w => !bottomWords.has(w)).slice(0, 8);

  return {
    reels: withMetrics,
    avgReach,
    avgViews,
    avgLikes,
    avgShares,
    avgWatchS,
    topMultiplier,
    topReel,
    patternWords,
    p80,
    p20,
    fetchedAt: new Date().toISOString(),
  };
}
