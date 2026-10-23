import { Clock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'

/**
 * «Aggiornati stanotte», «Aggiornati oggi alle 10:12», «ieri alle 05:31», «il 05/10/2026 alle 05:31»; for a run that
 * failed «Ultimo tentativo …»: it read nothing, and the posts on the page may be older.
 */
export function quandoAggiornati(istante: string, motivo: string | null, oggi: string, fallito: boolean, lingua: Lingua = 'it'): string {
  const t = PUBBLICATI[lingua]
  const prima = fallito ? t.ultimoTentativo : t.aggiornati
  const giorno = oggiRoma(new Date(istante))
  if (giorno === oggi && motivo === 'notte') return t.stanotte(prima)
  const ora = formatOra(istante)
  if (giorno === oggi) return t.oggiAlle(prima, ora)
  if (giorno === aggiungiGiorni(oggi, -1)) return t.ieriAlle(prima, ora)
  return t.ilAlle(prima, formato(lingua).formatData(giorno), ora)
}

export type StatoGiro = {
  ultimo_giro_il: string | null
  ultimo_giro_esito: string | null
  ultimo_giro_motivo: string | null
  ultimo_giro_letti: number | null
  campi: string | null
  ultimo_errore: string | null
} | null

/**
 * The state line of the posts' run, under the title of Pubblicati (it was the one of Post di Instagram): when the
 * posts were read last and how many, a failed run said as failed (never «Aggiornati»), the run's last error in
 * words (the admin gets the link to where the token is), and, when Instagram does not give the captions, that the
 * automatic link then has less to go on.
 */
export function StatoGiroInstagram({
  stato,
  oggi,
  puoAggiornare,
  admin,
  lingua = 'it',
}: {
  stato: StatoGiro
  oggi: string
  puoAggiornare: boolean
  admin: boolean
  lingua?: Lingua
}) {
  const t = PUBBLICATI[lingua]
  const fallito = stato?.ultimo_giro_esito === 'fallito'
  const senzaDidascalie = stato?.campi === 'senza_didascalia' || stato?.campi === 'minimi'
  return (
    <div className="space-y-1.5" data-testid="stato-post-instagram">
      {stato?.ultimo_giro_il ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="num">
            {quandoAggiornati(stato.ultimo_giro_il, stato.ultimo_giro_motivo, oggi, fallito, lingua)}
            {stato.ultimo_giro_letti !== null && !fallito ? t.postLetti(stato.ultimo_giro_letti) : ''}
            {fallito ? t.nonRiuscito : ''}
            {stato.ultimo_giro_esito === 'parziale' ? t.inParte : ''}
            {puoAggiornare ? '' : t.ogniNotte}
          </span>
        </p>
      ) : null}
      {stato?.ultimo_errore ? (
        <p className="flex items-start gap-1.5 text-sm text-rosso-testo" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span lang="it">{stato.ultimo_errore}</span>
            {admin ? (
              <>
                {' '}
                <Link href="/settings/chiavi#instagram" className="underline underline-offset-4 hover:text-foreground">
                  {t.chiavi}
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      {senzaDidascalie ? (
        <p className="flex items-start gap-1.5 text-sm text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.senzaDidascalie}
        </p>
      ) : null}
    </div>
  )
}
