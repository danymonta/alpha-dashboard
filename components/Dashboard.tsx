'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DashboardStats, ReelMetrics } from '@/lib/metrics';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function fmtDate(ts: string) {
  try {
    return new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  } catch { return ts.slice(0, 10); }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return `${m} min fa`;
  return `${Math.floor(m / 60)}h fa`;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, width: 100, overflow: 'hidden' }}>
      <div className="bar-fill" style={{ background: color, height: '100%', width: `${pct}%`, borderRadius: 4 }} />
    </div>
  );
}

const TAG_STYLE: Record<string, { bg: string; color: string }> = {
  'Top':          { bg: '#dcfce7', color: '#16a34a' },
  'Bassa perf.':  { bg: '#fee2e2', color: '#dc2626' },
  'Alto replay':  { bg: '#ede9fe', color: '#7c3aed' },
  'Molto salvato':{ bg: '#cffafe', color: '#0891b2' },
  'Viral share':  { bg: '#fef3c7', color: '#b45309' },
  'Reach bassa':  { bg: '#f3f4f6', color: '#6b7280' },
  'Watch basso':  { bg: '#fef3c7', color: '#f59e0b' },
  'Nella media':  { bg: '#f3f4f6', color: '#6b7280' },
};

function Tag({ label }: { label: string }) {
  const s = TAG_STYLE[label] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div className="skeleton" style={{ width: 220, height: 28, marginBottom: 8 }} />
          <div className="skeleton" style={{ width: 160, height: 16 }} />
        </div>
        <div className="skeleton" style={{ width: 140, height: 40, borderRadius: 8 }} />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12, borderRadius: 12 }} />
      ))}
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8, borderRadius: 8 }} />
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

// ─── Mini reel card (3-panel) ─────────────────────────────────────────────────

function MiniCard({ reel, label, color }: { reel: ReelMetrics; label: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {reel.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reel.thumbnail_url} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: 110, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📹</div>
      )}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {reel.caption || '(nessuna caption)'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          Reach: {fmt(reel.reach)} · Score: {reel.hook_score.toFixed(1)}
        </div>
      </div>
    </div>
  );
}

// ─── Reel row (table) ─────────────────────────────────────────────────────────

function ReelRow({ reel, rank, maxReach, maxScore }: { reel: ReelMetrics; rank: number; maxReach: number; maxScore: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', background: open ? '#f0f7ff' : 'var(--surface)', transition: 'background 0.15s' }}
      >
        <td style={{ padding: '10px 12px', color: 'var(--muted)', fontWeight: 700, width: 32 }}>{rank}</td>
        <td style={{ padding: '10px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {reel.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reel.thumbnail_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 44, height: 44, background: '#e5e7eb', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📹</div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 200 }}>
                {reel.caption || '(nessuna caption)'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDate(reel.timestamp)} · {reel.duration > 0 ? reel.duration + 's' : '?s'}</div>
            </div>
          </div>
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(reel.reach)}</div>
          <Bar value={reel.reach} max={maxReach} color="#3b82f6" />
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{fmt(reel.views)}</div>
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{reel.watch_s.toFixed(1)}s</div>
        </td>
        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{reel.hook_score.toFixed(1)}</div>
          <Bar value={reel.hook_score} max={maxScore} color="#8b5cf6" />
        </td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {reel.tags.map(t => <Tag key={t} label={t} />)}
          </div>
        </td>
      </tr>
      {open && (
        <tr style={{ background: '#f8faff' }}>
          <td colSpan={7} style={{ padding: '12px 16px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, fontSize: 12 }}>
              {[
                ['Likes', fmt(reel.likes)],
                ['Commenti', fmt(reel.comments)],
                ['Share', fmt(reel.shares)],
                ['Salvati', fmt(reel.saved)],
                ['Save%', reel.save_pct.toFixed(1) + '%'],
                ['Share%', reel.share_pct.toFixed(1) + '%'],
                ['Hook rate', (reel.hook_rate * 100).toFixed(0) + '%'],
                ['Replay', reel.replay_rate.toFixed(2) + 'x'],
                ['Watch', reel.watch_s.toFixed(1) + 's'],
                ['Durata', reel.duration + 's'],
                ['Interaz.', fmt(reel.total_interactions)],
                ['Link', <a key="link" href={reel.permalink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Apri ↗</a>],
              ].map(([l, v]) => (
                <div key={String(l)}>
                  <div style={{ color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontWeight: 700 }}>{v}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type SortKey = 'hook_score' | 'reach' | 'views' | 'watch_s' | 'save_pct' | 'share_pct';

const ALL_TAGS = ['Top', 'Bassa perf.', 'Alto replay', 'Molto salvato', 'Viral share', 'Reach bassa', 'Watch basso', 'Nella media'];

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('hook_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/data', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setStats(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Try to load cached data on mount, auto-refresh if nothing cached
  useEffect(() => {
    fetch('/api/data')
      .then(r => r.json())
      .then(d => { if (d) setStats(d); else refresh(); })
      .catch(() => refresh());
  }, [refresh]);

  if (!stats && loading) return <Skeleton />;

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  const today = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

  // Sort + filter
  const displayReels = stats
    ? [...stats.reels]
        .filter(r => !filterTag || r.tags.includes(filterTag))
        .sort((a, b) => {
          const diff = a[sortKey] - b[sortKey];
          return sortAsc ? diff : -diff;
        })
    : [];

  const maxReach = stats ? Math.max(...stats.reels.map(r => r.reach)) : 0;
  const maxScore = stats ? Math.max(...stats.reels.map(r => r.hook_score)) : 0;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortTh({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k;
    return (
      <th
        className="sortable"
        onClick={() => toggleSort(k)}
        style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? 'var(--blue)' : 'var(--muted)', whiteSpace: 'nowrap' }}
      >
        {label} {active ? (sortAsc ? '↑' : '↓') : ''}
      </th>
    );
  }

  // Panels
  const doMore = stats ? stats.reels.filter(r => r.hook_score >= stats.p80).slice(0, 3) : [];
  const doStop = stats ? stats.reels.filter(r => r.hook_score <= stats.p20).slice(-3) : [];
  const doFix  = stats ? stats.reels.filter(r => r.reach >= stats.avgReach && r.hook_rate < 0.3 && r.duration > 0).slice(0, 3) : [];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>📊 Alpha Dashboard</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            {stats
              ? `${since} — ${today} · ${stats.reels.length} reels · aggiornato ${timeAgo(stats.fetchedAt)}`
              : 'Nessun dato caricato'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              background: loading ? '#e5e7eb' : 'var(--blue)',
              color: loading ? 'var(--muted)' : '#fff',
              padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.2s',
            }}
          >
            <span className={loading ? 'spin' : ''} style={{ display: 'inline-block' }}>⟳</span>
            {loading ? 'Caricamento...' : 'Aggiorna Dati'}
          </button>
        </div>
      </div>

      {!stats && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Nessun dato</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Clicca "Aggiorna Dati" per caricare i tuoi Reels</div>
        </div>
      )}

      {stats && (
        <div className="fade-in">
          {/* ── Stats bar ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 24px', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
              <Stat label="Reach media" value={fmt(Math.round(stats.avgReach))} />
              <Stat label="Views medie" value={fmt(Math.round(stats.avgViews))} />
              <Stat label="Likes medi" value={fmt(Math.round(stats.avgLikes))} />
              <Stat label="Share medi" value={fmt(Math.round(stats.avgShares))} />
              <Stat label="Watch medio" value={stats.avgWatchS.toFixed(1) + 's'} />
            </div>
          </div>

          {/* ── Insight banner ── */}
          <div style={{ background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)', color: '#fff', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top Reach Multiplier</div>
            <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 4 }}>{stats.topMultiplier.toFixed(1)}x</div>
            <div style={{ fontSize: 14, opacity: 0.9 }}>
              Il tuo reel migliore ha raggiunto <strong>{fmt(stats.topReel.reach)}</strong> persone —{' '}
              {stats.topMultiplier > 1
                ? `${stats.topMultiplier.toFixed(1)}x la media di ${fmt(Math.round(stats.avgReach))}`
                : `vs. media ${fmt(Math.round(stats.avgReach))}`}
            </div>
            {stats.topReel.caption && (
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                "{stats.topReel.caption}"
              </div>
            )}
          </div>

          {/* ── Pattern callout ── */}
          {stats.patternWords.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>🔍 Pattern nei Top 5</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                Parole nei tuoi 5 reels migliori non presenti nei 5 peggiori:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {stats.patternWords.map(w => (
                  <span key={w} style={{ background: '#eff6ff', color: '#1d4ed8', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── 3-panel grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { title: '🚀 Da Fare Di Più', color: 'var(--green)', items: doMore, empty: 'Continua così!' },
              { title: '❌ Da Smettere',   color: 'var(--red)',   items: doStop, empty: 'Nessun reel in zona negativa' },
              { title: '🔧 Da Sistemare',  color: 'var(--amber)', items: doFix,  empty: 'Tutto ok' },
            ].map(({ title, color, items, empty }) => (
              <div key={title} style={{ background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10 }}>{title}</div>
                {items.length
                  ? items.map(r => <MiniCard key={r.id} reel={r} label="" color={color} />)
                  : <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>{empty}</div>
                }
              </div>
            ))}
          </div>

          {/* ── Tag filter ── */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={() => setFilterTag(null)}
              style={{ background: !filterTag ? '#111827' : 'var(--surface)', color: !filterTag ? '#fff' : 'var(--text)', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}
            >
              Tutti ({stats.reels.length})
            </button>
            {ALL_TAGS.map(tag => {
              const count = stats.reels.filter(r => r.tags.includes(tag)).length;
              if (!count) return null;
              const s = TAG_STYLE[tag];
              return (
                <button
                  key={tag}
                  onClick={() => setFilterTag(t => t === tag ? null : tag)}
                  style={{
                    background: filterTag === tag ? s.color : s.bg,
                    color: filterTag === tag ? '#fff' : s.color,
                    border: `1px solid ${s.color}20`,
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  }}
                >
                  {tag} ({count})
                </button>
              );
            })}
          </div>

          {/* ── Table ── */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: '#f9fafb' }}>
                  <th style={{ padding: '10px 12px', width: 32 }} />
                  <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Reel</th>
                  <SortTh k="reach" label="Reach" />
                  <SortTh k="views" label="Views" />
                  <SortTh k="watch_s" label="Watch" />
                  <SortTh k="hook_score" label="Hook Score" />
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>Tag</th>
                </tr>
              </thead>
              <tbody>
                {displayReels.map((reel, i) => (
                  <ReelRow key={reel.id} reel={reel} rank={i + 1} maxReach={maxReach} maxScore={maxScore} />
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 11, marginTop: 24, paddingBottom: 24 }}>
            Alpha Dashboard · {today}
          </div>
        </div>
      )}
    </div>
  );
}
