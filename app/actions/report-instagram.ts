'use server'

import { revalidatePath } from 'next/cache'

import { negaSeNon } from '@/lib/auth/azioni'
import { aggiungiGiorni, isDataISO, oggiRoma } from '@/lib/date'
import { calcolaReportInstagram } from '@/lib/instagram/report'
import { createAdminClient } from '@/lib/supabase/admin'

export type EsitoRicalcolo =
  | {
      ok: true
      giorno: string
      /** the setter had already confirmed or discarded that day: left as it was */
      gia_decisa: boolean
      chat_lette: number
      chat_incerte: number
    }
  | { ok: false; errore: string }

/** No new request to Instagram after this much: the action stays inside the function's time. */
const TEMPO_LETTURA_MS = 240_000

/** The page was opened before midnight: its "ieri" is not yesterday any more. */
const DOPO_MEZZANOTTE = 'È passata la mezzanotte: ricarica la pagina e ricalcola ieri.'

/**
 * "Ricalcola ieri" (Dany, 08/10/2026): the admin asks again for yesterday's
 * proposal, e.g. after connecting a new token: the same run as the nightly
 * one. Only yesterday, as the button says: the day is worked out here, in
 * Rome; the page's own (`giorno`, what it showed when it opened) only has to
 * match it, so a page left open past midnight never recomputes the day
 * before yesterday. Active admin only. The service role is used here, on the
 * server, because the token is read only by it (public.instagram_token); the
 * browser gets the outcome and how many chats were read, never the
 * proposal's numbers (they are on the cards: the setter's in Oggi, the
 * admin's on the Setter page, read with each one's session).
 */
export async function ricalcolaReportInstagram(giorno: unknown): Promise<EsitoRicalcolo> {
  const negato = await negaSeNon(['admin'])
  if (negato) return { ok: false, errore: negato }
  const ieri = aggiungiGiorni(oggiRoma(), -1)
  if (!isDataISO(giorno) || giorno !== ieri) return { ok: false, errore: DOPO_MEZZANOTTE }

  const esito = await calcolaReportInstagram({
    db: createAdminClient(),
    giorno: ieri,
    entro: Date.now() + TEMPO_LETTURA_MS,
  })
  // the connection's last run or last error changed; the setter's proposal too
  revalidatePath('/', 'layout')
  if (!esito.ok) return { ok: false, errore: esito.errore }
  return {
    ok: true,
    giorno: esito.giorno,
    gia_decisa: esito.proposta === 'gia_decisa',
    chat_lette: esito.chat_lette,
    chat_incerte: esito.chat_incerte,
  }
}
