import 'server-only'

import type { Lingua } from '@/lib/i18n/lingua'
import { IMPOSTAZIONI } from '@/lib/i18n/testi/impostazioni'
import { insightConfigurato } from '@/lib/insight/config'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { statoToken } from '@/lib/instagram/stato-token'
import { leggiImpostazioni, leggiMancaPerAprire } from '@/lib/onboarding/letture'
import type { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

/** One row of «Da sistemare»: what is wrong, in words, and where it gets fixed. */
export type DaSistemare = { testo: string; href: string }

/**
 * What the settings index says next to its items (1.87.0): whether the client area is open,
 * how many contents still need Dany's words, how many connections need a hand, and the list
 * on top. Every read can fail on its own: the index then shows its items without that state,
 * never an error page (the page under it says the details).
 */
export type StatoImpostazioni = {
  areaAperta: boolean | null
  contenutiDaCompletare: number | null
  collegamentiDaSistemare: number
  daSistemare: DaSistemare[]
}

async function statoArea(db: Db) {
  const impostazioni = await leggiImpostazioni(db)
  if (impostazioni.aperto_ai_clienti) return { aperta: true, testi: 0, video: 0, community: false, prenotazione: false }
  // the same checks and words as the database (leggiMancaPerAprire): their numbers, grouped by the page that fixes them
  const problemi = await leggiMancaPerAprire(db, impostazioni)
  const numero = (re: RegExp) => Number(/^\d+/.exec(problemi.find((p) => re.test(p)) ?? '')?.[0] ?? 0)
  return {
    aperta: false,
    testi: numero(/Da scrivere/),
    video: numero(/segnaposto/),
    community: problemi.some((p) => /community/.test(p)),
    prenotazione: problemi.some((p) => /prenotazione/.test(p)),
  }
}

async function statoInstagram(db: Db) {
  const [collegamento, presente] = await Promise.all([
    db.from('instagram_collegamento').select('token_scade_il, ultimo_errore').maybeSingle(),
    db.rpc('instagram_token_presente'),
  ])
  if (collegamento.error || presente.error) throw new Error('instagram')
  return statoToken({
    presente: presente.data === true,
    scadeIl: collegamento.data?.token_scade_il ?? null,
    rifiutatoDaMeta: collegamento.data?.ultimo_errore === FRASI_ERRORE.token,
    adesso: Date.now(),
  })
}

export async function leggiStatoImpostazioni(db: Db, lingua: Lingua): Promise<StatoImpostazioni> {
  const t = IMPOSTAZIONI[lingua].stato
  const [area, instagram] = await Promise.allSettled([statoArea(db), statoInstagram(db)])
  const daSistemare: DaSistemare[] = []

  let areaAperta: boolean | null = null
  let contenutiDaCompletare: number | null = null
  if (area.status === 'fulfilled') {
    areaAperta = area.value.aperta
    const { testi, video, community, prenotazione } = area.value
    contenutiDaCompletare = testi + video
    if (contenutiDaCompletare > 0) {
      daSistemare.push({ testo: t.contenutiMancanti(testi, video), href: '/settings/onboarding/contenuti' })
    }
    if (community || prenotazione) {
      daSistemare.push({ testo: t.linkMancanti(community, prenotazione), href: '/settings/onboarding' })
    }
  }

  let collegamentiDaSistemare = 0
  if (instagram.status === 'fulfilled') {
    const ig = instagram.value
    const testo = !ig.presente
      ? t.tokenManca
      : ig.scaduto
        ? t.tokenScaduto
        : ig.scadePresto && ig.giorniAllaScadenza !== null
          ? t.tokenScade(ig.giorniAllaScadenza)
          : null
    if (testo) {
      daSistemare.push({ testo, href: '/settings/chiavi' })
      collegamentiDaSistemare += 1
    }
  }
  if (!insightConfigurato()) {
    daSistemare.push({ testo: t.claudeManca, href: '/settings/chiavi' })
    collegamentiDaSistemare += 1
  }

  return { areaAperta, contenutiDaCompletare, collegamentiDaSistemare, daSistemare }
}
