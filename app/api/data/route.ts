import { NextResponse } from 'next/server';
import { fetchInstagramReels } from '@/lib/instagram';
import { computeMetrics } from '@/lib/metrics';

// Module-level cache (survives warm invocations on Vercel, re-fetches on cold start)
let cache: { stats: ReturnType<typeof computeMetrics>; at: number } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.stats);
  }
  return NextResponse.json(null);
}

export async function POST() {
  try {
    const reels = await fetchInstagramReels();
    const stats = computeMetrics(reels);
    cache = { stats, at: Date.now() };
    return NextResponse.json(stats);
  } catch (err: any) {
    console.error('[api/data] error:', err);
    return NextResponse.json({ error: err.message ?? 'Fetch failed' }, { status: 500 });
  }
}
