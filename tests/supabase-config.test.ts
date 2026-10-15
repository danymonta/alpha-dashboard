import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { RE_URL_PASSO_HTTPS, RE_URL_PASSO_LOCALE } from '@/lib/insight/config'

const leggi = (percorso: string) => readFileSync(new URL(`../${percorso}`, import.meta.url), 'utf8')

describe('supabase/config.toml', () => {
  // The Insight's pg_net, pg_cron and Vault objects stay out of reach because
  // their schemas are never exposed by the Data API (CLAUDE.md section 29): the
  // cloud project's «Exposed schemas» must say the same.
  it('la Data API espone solo public e graphql_public', () => {
    const config = leggi('supabase/config.toml')
    const api = config.slice(config.indexOf('[api]'), config.indexOf('\n[', config.indexOf('[api]') + 1))
    const righe = api.split('\n').filter((riga) => /^\s*schemas\s*=/.test(riga))
    expect(righe).toHaveLength(1)
    expect(JSON.parse(righe[0].split('=')[1].trim())).toEqual(['public', 'graphql_public'])
  })

  it('il seed dell’Insight si carica con gli altri, dopo i post del seed', () => {
    const config = leggi('supabase/config.toml')
    expect(config).toMatch(/sql_paths\s*=\s*\[[^\]]*"\.\/seeds\/\*\.sql"/)
    const seeds = readdirSync(new URL('../supabase/seeds/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
    expect(seeds.indexOf('40_insight.sql')).toBeGreaterThan(seeds.indexOf('27_post_instagram.sql'))
    expect(seeds.indexOf('27_post_instagram.sql')).toBeGreaterThanOrEqual(0)
  })
})

describe('l’indirizzo dei passi: lo stesso controllo nel database e nel server', () => {
  const sql = [
    leggi('supabase/migrations/20261014090000_insight_dati.sql'),
    leggi('supabase/migrations/20261014090100_insight_funzioni.sql'),
  ].join('\n')
  // every regex literal of the step URL in the SQL, as written there
  const nelSql = [...sql.matchAll(/'(\^https?:\/\/[^']*\/api\/cron\/insight\$)'/g)].map((m) => m[1])
  const comeSql = (re: RegExp) => re.source.replaceAll('\\/', '/')

  it('ogni regex del database è una delle due del server', () => {
    // the table's check and insight_imposta_url (the only function that writes the address)
    expect(nelSql.length).toBeGreaterThanOrEqual(4)
    for (const re of nelSql) {
      expect([comeSql(RE_URL_PASSO_HTTPS), comeSql(RE_URL_PASSO_LOCALE)]).toContain(re)
    }
  })

  it('e le due ci sono tutte e due', () => {
    expect(new Set(nelSql)).toEqual(new Set([comeSql(RE_URL_PASSO_HTTPS), comeSql(RE_URL_PASSO_LOCALE)]))
  })
})
