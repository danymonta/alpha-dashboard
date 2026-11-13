'use client'

import { Link2, Lock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useId } from 'react'

import { useFormato, useLingua } from '@/components/i18n/lingua-provider'
import { ConsensoGenitore, RevocaLink, RiattivaLink, RigeneraLink } from '@/components/onboarding/azioni-link'
import { ConfermaPagamento } from '@/components/onboarding/conferma-pagamento'
import { Copia } from '@/components/onboarding/copia'
import { ProvaCliente } from '@/components/onboarding/prova-cliente'
import { oggiRoma } from '@/lib/date'
import { ONBOARDING, motivoInLingua } from '@/lib/i18n/testi/onboarding'
import { dettaglioStato, type AzioniLink, type RigaOnboarding, type StatoOnboarding } from '@/lib/onboarding/stati'

export type LinkDellaScheda = Pick<
  RigaOnboarding,
  | 'invito_id'
  | 'invito_stato'
  | 'attivato_il'
  | 'attivato_da'
  | 'scade_il'
  | 'usato_il'
  | 'revocato_il'
  | 'revocato_motivo'
  | 'minorenne'
  | 'consenso_genitore_il'
  | 'pagamento_confermato'
  | 'prova'
  | 'account_stato'
>

/**
 * The box «Link» of the card: the state in words, when and how the link turned active,
 * when it expires, and the admin's actions (only the ones the functions in SQL accept in
 * that state: lib/onboarding/stati.ts azioniLink). «Copia link» and the ready message
 * appear only with the client area open and a link the client can use; with the area
 * closed one line says why, and the token is not even read.
 */
export function RiquadroLink({
  riga,
  stato,
  azioni,
  aperto,
  giorni,
  link,
  cliente,
}: {
  riga: LinkDellaScheda
  stato: StatoOnboarding
  azioni: AzioniLink
  /** onboarding_impostazioni.aperto_ai_clienti. */
  aperto: boolean
  /** onboarding_impostazioni.giorni_validita_link. */
  giorni: number
  /** The address and the ready message: null with the client area closed. */
  link: { indirizzo: string; messaggio: string } | null
  cliente: string
}) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua]
  const l = t.link
  const { formatData } = useFormato()
  const giorno = (istante: string) => formatData(oggiRoma(new Date(istante)))
  const attendeConsenso = riga.minorenne === true && !riga.consenso_genitore_il

  const fatti: { chiave: string; testo: string }[] = []
  if (riga.attivato_il) {
    const come = riga.attivato_da === 'manuale' ? l.attivatoDa.manuale : riga.attivato_da === 'pagamento' ? l.attivatoDa.pagamento : ''
    fatti.push({ chiave: 'attivato', testo: [l.attivatoIl(giorno(riga.attivato_il)), come].filter(Boolean).join(' ') })
  }
  if (riga.invito_stato === 'scaduto' && riga.scade_il) fatti.push({ chiave: 'scaduto', testo: l.scadutoIl(giorno(riga.scade_il)) })
  else if (riga.invito_stato === 'attivo' && riga.scade_il) fatti.push({ chiave: 'scade', testo: l.scadeIl(giorno(riga.scade_il)) })
  else if (riga.invito_stato === 'attivo') fatti.push({ chiave: 'senza-scadenza', testo: l.senzaScadenza(giorni) })
  if (riga.usato_il) fatti.push({ chiave: 'usato', testo: l.usatoIl(giorno(riga.usato_il)) })
  // the payment is there and the link still waits: only the parent's consent is missing
  if (riga.pagamento_confermato) fatti.push({ chiave: 'pagamento-confermato', testo: l.pagamentoConfermatoConsenso })
  if (riga.invito_stato === 'revocato' && riga.revocato_il) {
    fatti.push({ chiave: 'revocato', testo: l.revocatoIl(giorno(riga.revocato_il)) })
    if (riga.revocato_motivo?.trim()) {
      fatti.push({ chiave: 'motivo', testo: l.motivo(motivoInLingua(riga.revocato_motivo.trim(), lingua)) })
    }
  }

  const haAzioni = azioni.confermaPagamento || azioni.riattiva || azioni.consensoGenitore || azioni.rigenera || azioni.revoca

  return (
    <section aria-labelledby={`${id}-titolo`} className="space-y-3 rounded-xl bg-card p-3" data-testid="riquadro-link">
      <h2 id={`${id}-titolo`} className="flex min-h-11 items-center gap-1.5 text-sm font-medium">
        <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
        {l.titolo}
      </h2>

      {/* the state itself is under the client's name, at the top of the card: here what it means */}
      <p className="text-sm text-muted-foreground" data-testid="link-stato" data-stato={stato}>
        {dettaglioStato(stato, lingua)}
      </p>

      {fatti.length > 0 || riga.minorenne ? (
        <ul className="space-y-1 border-t border-border pt-3 text-sm" data-testid="link-fatti">
          {fatti.map((f) => (
            <li key={f.chiave} className="break-words" data-fatto={f.chiave}>
              {f.testo}
            </li>
          ))}
          {riga.minorenne ? (
            riga.consenso_genitore_il ? (
              <li className="flex items-start gap-1.5" data-fatto="consenso">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
                <span>
                  {l.minorenne}. {l.consensoIl(giorno(riga.consenso_genitore_il))}
                </span>
              </li>
            ) : (
              <li className="flex items-start gap-1.5 text-status-warning" data-fatto="consenso-manca">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {l.minorenne}. {l.consensoManca}
                </span>
              </li>
            )
          ) : null}
        </ul>
      ) : null}

      {link ? (
        <div className="space-y-3 border-t border-border pt-3" data-testid="link-copia">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{l.indirizzo}</p>
            <p className="num rounded-lg border border-border px-2.5 py-2 text-sm break-all select-all">{link.indirizzo}</p>
            <Copia testo={link.indirizzo} etichetta={l.copiaLink} fatto={l.linkCopiato} testId="copia-link" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{t.messaggio.titolo}</p>
            {/* the message goes to the client: Italian in both languages */}
            <p lang="it" className="text-sm break-words whitespace-pre-line">
              {link.messaggio}
            </p>
            <Copia testo={link.messaggio} etichetta={l.copiaMessaggio} fatto={l.messaggioCopiato} testId="copia-messaggio" />
            <p className="text-xs text-muted-foreground">{t.messaggio.nota}</p>
          </div>
        </div>
      ) : !aperto && riga.prova !== true && riga.invito_stato !== 'usato' && riga.account_stato == null ? (
        <p className="flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground" data-testid="area-non-aperta">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {l.nonAperto}
        </p>
      ) : null}

      {/* «Cliente di prova» (1.78.0): a link not used yet */}
      {azioni.prova && riga.invito_id ? <ProvaCliente invitoId={riga.invito_id} prova={riga.prova === true} /> : null}

      {haAzioni && riga.invito_id ? (
        <div role="group" aria-label={l.azioni} className="flex flex-wrap items-start gap-2 border-t border-border pt-3">
          {/* the one primary action of the box: what moves the link on */}
          {azioni.confermaPagamento ? (
            <ConfermaPagamento invitoId={riga.invito_id} cliente={cliente} attendeConsenso={attendeConsenso} aperto={aperto} />
          ) : null}
          {azioni.riattiva ? <RiattivaLink invitoId={riga.invito_id} /> : null}
          {azioni.consensoGenitore ? <ConsensoGenitore invitoId={riga.invito_id} cliente={cliente} /> : null}
          {azioni.rigenera ? <RigeneraLink invitoId={riga.invito_id} /> : null}
          {azioni.revoca ? <RevocaLink invitoId={riga.invito_id} cliente={cliente} /> : null}
        </div>
      ) : null}
    </section>
  )
}
