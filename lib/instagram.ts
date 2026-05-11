import { Composio } from '@composio/core';

export interface ReelData {
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

const USER_ID = 'default';
const METRICS_FULL = 'reach,views,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time';
const METRICS_FALLBACK = 'reach,views,likes,comments,shares,saved,total_interactions';

function extractInsight(data: any[], name: string): number {
  const item = data.find((d: any) => d.name === name);
  if (!item) return 0;
  if (typeof item.value === 'number') return item.value;
  if (Array.isArray(item.values) && item.values.length > 0) return item.values[0]?.value ?? 0;
  return 0;
}

async function withConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function fetchInstagramReels(): Promise<ReelData[]> {
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });

  const session = await composio.toolRouter.create(USER_ID, {
    toolkits: ['instagram'],
  });

  const mediaRes = await session.execute('INSTAGRAM_GET_IG_USER_MEDIA', {
    ig_user_id: 'me',
    fields: 'id,caption,media_type,permalink,thumbnail_url,timestamp,duration',
    limit: 25,
  });

  const rawMedia =
    (mediaRes.data as any)?.data ??
    (mediaRes.data as any)?.response?.data ??
    [];
  const mediaItems: any[] = Array.isArray(rawMedia) ? rawMedia : [];

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const reels = mediaItems.filter((m: any) => {
    const isReel = m.media_type === 'REEL' || m.media_type === 'VIDEO';
    const isRecent = m.timestamp ? new Date(m.timestamp) >= since : false;
    return isReel && isRecent;
  });

  const tasks = reels.map((reel: any) => async (): Promise<ReelData> => {
    let insightData: any[] = [];

    const res = await session.execute('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', {
      ig_media_id: reel.id,
      metric: METRICS_FULL,
    });

    const d1 = (res.data as any)?.data ?? (res.data as any)?.response?.data ?? [];
    if (!res.error && d1.length > 0) {
      insightData = d1;
    } else {
      const res2 = await session.execute('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', {
        ig_media_id: reel.id,
        metric: METRICS_FALLBACK,
      });
      insightData = (res2.data as any)?.data ?? (res2.data as any)?.response?.data ?? [];
    }

    return {
      id: reel.id,
      caption: (reel.caption ?? '').slice(0, 80),
      permalink: reel.permalink ?? '',
      thumbnail_url: reel.thumbnail_url ?? '',
      timestamp: reel.timestamp ?? '',
      duration: Number(reel.duration) || 0,
      reach: extractInsight(insightData, 'reach'),
      views: extractInsight(insightData, 'views'),
      likes: extractInsight(insightData, 'likes'),
      comments: extractInsight(insightData, 'comments'),
      shares: extractInsight(insightData, 'shares'),
      saved: extractInsight(insightData, 'saved'),
      total_interactions: extractInsight(insightData, 'total_interactions'),
      ig_reels_avg_watch_time: extractInsight(insightData, 'ig_reels_avg_watch_time'),
    };
  });

  return withConcurrency(tasks, 5);
}
