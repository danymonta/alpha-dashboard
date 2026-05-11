import 'dotenv/config';
import { Composio } from '@composio/core';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_ID = 'default';
const METRICS_FULL = 'reach,views,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time';
const METRICS_FALLBACK = 'reach,views,likes,comments,shares,saved,total_interactions';

interface MediaItem {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
  duration?: number;
}

interface InsightValue {
  name: string;
  values?: { value: number }[];
  value?: number;
}

function extractInsight(data: InsightValue[], name: string): number {
  const item = data.find(d => d.name === name);
  if (!item) return 0;
  if (typeof item.value === 'number') return item.value;
  if (Array.isArray(item.values) && item.values.length > 0) return item.values[0].value ?? 0;
  return 0;
}

function sinceDate(): string {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  if (!process.env.COMPOSIO_API_KEY) {
    console.error('COMPOSIO_API_KEY mancante nel file .env');
    process.exit(1);
  }

  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

  console.log('Connessione a Composio...');
  const session = await composio.toolRouter.create(USER_ID, {
    toolkits: ['instagram'],
    manageConnections: true,
  });

  // Check Instagram connection
  const tkInfo = await session.toolkits({ toolkits: ['instagram'] });
  const igInfo = tkInfo.items.find(t => t.slug === 'instagram');

  if (!igInfo?.connection?.isActive) {
    console.log('\nInstagram non connesso. Avvio autorizzazione...');
    const req = await session.authorize('instagram');
    if (req.redirectUrl) {
      console.log('\n=== AUTORIZZAZIONE INSTAGRAM ===');
      console.log('Apri questo link nel browser per connettere il tuo account:\n');
      console.log(req.redirectUrl + '\n');
      console.log('Dopo aver completato, rilancia: npm run agent\n');
    }
    process.exit(0);
  }

  console.log('Instagram connesso. Recupero media...');

  // Step 1: get user media
  const mediaRes = await session.execute('INSTAGRAM_GET_IG_USER_MEDIA', {
    ig_user_id: 'me',
    fields: 'id,caption,media_type,permalink,thumbnail_url,timestamp,duration',
    limit: 25,
  });

  if (mediaRes.error) {
    console.error('Errore nel recupero media:', mediaRes.error);
    process.exit(1);
  }

  const rawMedia = (mediaRes.data as any)?.data ?? (mediaRes.data as any)?.response?.data ?? [];
  const mediaItems: MediaItem[] = Array.isArray(rawMedia) ? rawMedia : [];

  // Step 2: filter reels from last 14 days
  const since = sinceDate();
  const reels = mediaItems.filter(m => {
    const isReel = m.media_type === 'REEL' || m.media_type === 'VIDEO';
    const isRecent = m.timestamp ? new Date(m.timestamp) >= new Date(since) : false;
    return isReel && isRecent;
  });

  console.log(`Trovati ${mediaItems.length} media totali, ${reels.length} reels negli ultimi 14 giorni.`);

  if (reels.length === 0) {
    console.log('Nessun reel trovato. Controlla i permessi Instagram o il periodo.');
    console.log('DEBUG - Tipi trovati:', [...new Set(mediaItems.map(m => m.media_type))]);
    console.log('DEBUG - Date:', mediaItems.slice(0, 3).map(m => m.timestamp));
    process.exit(1);
  }

  // Step 3: get insights for each reel
  const results = [];
  for (let i = 0; i < reels.length; i++) {
    const reel = reels[i];
    process.stdout.write(`[${i + 1}/${reels.length}] Insights per ${reel.id}... `);

    let insightData: InsightValue[] = [];

    // Try with full metrics first
    const res = await session.execute('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', {
      ig_media_id: reel.id,
      metric: METRICS_FULL,
    });

    if (res.error || !(res.data as any)?.data) {
      // Fallback without avg watch time
      const res2 = await session.execute('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', {
        ig_media_id: reel.id,
        metric: METRICS_FALLBACK,
      });
      insightData = (res2.data as any)?.data ?? (res2.data as any)?.response?.data ?? [];
      process.stdout.write('(fallback) ');
    } else {
      insightData = (res.data as any)?.data ?? (res.data as any)?.response?.data ?? [];
    }

    console.log('OK');

    results.push({
      id: reel.id,
      caption: (reel.caption ?? '').slice(0, 80),
      permalink: reel.permalink ?? '',
      thumbnail_url: reel.thumbnail_url ?? '',
      timestamp: reel.timestamp ?? '',
      duration: reel.duration ?? 0,
      reach: extractInsight(insightData, 'reach'),
      views: extractInsight(insightData, 'views'),
      likes: extractInsight(insightData, 'likes'),
      comments: extractInsight(insightData, 'comments'),
      shares: extractInsight(insightData, 'shares'),
      saved: extractInsight(insightData, 'saved'),
      total_interactions: extractInsight(insightData, 'total_interactions'),
      ig_reels_avg_watch_time: extractInsight(insightData, 'ig_reels_avg_watch_time'),
    });
  }

  // Step 4: write data.json
  const outPath = path.join(__dirname, 'data.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\nSalvati ${results.length} reels in data.json`);
  console.log('Ora esegui: npm run render\n');
}

main().catch(err => {
  console.error('Errore:', err.message ?? err);
  process.exit(1);
});
