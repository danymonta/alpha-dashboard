import { MessageSquareQuote, PhoneOff } from 'lucide-react'

import { FiltroSetter } from '@/components/setting/filtro-setter'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formatData, formatNumero, formatPercentuale } from '@/lib/format'
import {
  LIMITE_MARKETING,
  MARKETING,
  MOTIVO_NON_CHIUSURA,
  NOTE_CALL,
  SCALE_COMMENTO,
  TESTI_COMMENTO,
  etichettaLivello,
  type CampoScala,
} from '@/lib/setting/commento'
import type { Database } from '@/lib/supabase/database.types'
import { ETICHETTA_ESITO } from '@/lib/validation/esito'

type Funzioni = Database['public']['Functions']
type RigaSql = Funzioni['commenti_setter_periodo']['Returns'][number]
/** The generated type says every column is set: on each kind of row, half of them are null. */
export type RigaCommento = { [K in keyof RigaSql]: RigaSql[K] | null }

type RigaMotivoSql = Funzioni['motivi_non_chiusura_periodo']['Returns'][number]
/** Lead, closer, reason and notes can be missing (a deleted closer, a call with notes only). */
export type RigaMotivo = Omit<RigaMotivoSql, 'lead' | 'closer' | 'motivo' | 'note' | 'qualificata'> & {
  lead: string | null
  closer: string | null
  motivo: string | null
  note: string | null
  qualificata: boolean | null
}

/**
 * "Per il marketing: cosa dicono i lead" (Dany, 30/09/2026), for the period
 * and the setter chosen, in two parts:
 * - "Dal setting": what the setters answered in their daily report. The days
 *   per level and their share come from SQL (commenti_setter_periodo);
 * - "Dalle call": why the held calls did not close, as the closers wrote it
 *   (motivi_non_chiusura_periodo). The price objections live here.
 * Everything is only written out here. One setter or all together, never side
 * by side: no comparison between people (CLAUDE.md section 17). Only what was
 * answered is shown: a day never says which answer is missing.
 */
export function CommentiMarketing({
  righe,
  motivi,
  periodo,
  setter,
  persone,
  parametri,
}: {
  righe: RigaCommento[]
  motivi: RigaMotivo[]
  /** "settembre 2026" */
  periodo: string
  setter: string | null
  persone: readonly { id: string; nome: string }[]
  parametri: Record<string, string>
}) {
  const M = MARKETING
  const scale = righe.filter((r) => r.tipo === 'scala')
  const giorni = righe.filter((r) => r.tipo === 'giorno')
  const conRisposte = scale.some((r) => Number(r.giorni) > 0)
  // SQL lists the most recent LIMITE_MARKETING: at the limit, the older ones are left out
  const giorniTroncati = giorni.length >= LIMITE_MARKETING
  const motiviTroncati = motivi.length >= LIMITE_MARKETING

  return (
    <section aria-labelledby="per-il-marketing" className="scroll-mt-20 space-y-4" data-testid="commenti-marketing" id="marketing">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1">
        <div className="min-w-0 sm:flex-1">
          <h2 id="per-il-marketing" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {M.titolo}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{M.descrizione}</p>
        </div>
        <FiltroSetter
          valore={setter}
          persone={persone}
          parametri={parametri}
          etichetta={M.filtroSetter}
          spiegazione={M.filtroSetterSpiegazione}
          tutti={M.tutti}
        />
      </div>

      {/* 1. The setters' daily report */}
      <div className="space-y-3" data-testid="marketing-setting">
        <Parte titolo={M.setting.titolo} descrizione={M.setting.descrizione} id="marketing-setting" />
        {!conRisposte && giorni.length === 0 ? (
          <StatoVuoto
            Icona={MessageSquareQuote}
            titolo={M.setting.vuoto}
            descrizione={`${M.setting.vuotoDescrizione} Periodo: ${periodo}.`}
          />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {SCALE_COMMENTO.map((scala) => (
                <Conteggi key={scala.campo} campo={scala.campo} righe={scale.filter((r) => r.scala === scala.campo)} />
              ))}
            </div>

            <div className="space-y-2">
              <h4 className="px-1 text-sm font-medium">
                {M.setting.giorni}{' '}
                <span className="num font-normal text-muted-foreground">
                  ({giorniTroncati ? M.piuRecenti : formatNumero(giorni.length)})
                </span>
              </h4>
              {giorniTroncati ? <p className="px-1 text-xs text-muted-foreground">{M.troncati}</p> : null}
              {giorni.length === 0 ? (
                <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">{M.setting.nessunTesto}</p>
              ) : (
                <ul className="grid gap-2 md:grid-cols-2" data-testid="giorni-commentati">
                  {giorni.map((g) => (
                    <li key={g.report_id} className="space-y-2 rounded-xl bg-card p-3">
                      <p className="text-sm font-medium">
                        {formatData(g.data)} <span className="font-normal text-muted-foreground">· {g.setter}</span>
                      </p>
                      <Risposte giorno={g} />
                      <dl className="space-y-2 text-sm">
                        {TESTI_COMMENTO.map((t) =>
                          g[t.campo] ? (
                            <div key={t.campo}>
                              <dt className="text-xs text-muted-foreground">{t.titolo}</dt>
                              <dd className="break-words whitespace-pre-line">{g[t.campo]}</dd>
                            </div>
                          ) : null,
                        )}
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {/* 2. The closers' reasons for not closing */}
      <div className="space-y-3" data-testid="marketing-call">
        <Parte
          titolo={M.call.titolo}
          descrizione={M.call.descrizione}
          id="marketing-call"
          conteggio={motiviTroncati ? M.piuRecenti : formatNumero(motivi.length)}
        />
        {motiviTroncati ? <p className="px-1 text-xs text-muted-foreground">{M.troncati}</p> : null}
        {motivi.length === 0 ? (
          <StatoVuoto Icona={PhoneOff} titolo={M.call.vuoto} descrizione={`${M.call.vuotoDescrizione} Periodo: ${periodo}.`} />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2" data-testid="motivi-non-chiusura">
            {motivi.map((c) => (
              <li key={c.call_id} className="space-y-2 rounded-xl bg-card p-3">
                <p className="text-sm font-medium">
                  {formatData(c.data)} <span className="font-normal text-muted-foreground">· {c.lead ?? 'Lead senza nome'}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="mr-3 inline-block">
                    Esito: <span className="text-foreground">{ETICHETTA_ESITO[c.esito]}</span>
                  </span>
                  {c.closer ? (
                    <span className="mr-3 inline-block">
                      Closer: <span className="text-foreground">{c.closer}</span>
                    </span>
                  ) : null}
                </p>
                <dl className="space-y-2 text-sm">
                  {/* what was written: an older call may have only its notes */}
                  {c.motivo ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">{MOTIVO_NON_CHIUSURA.titolo}</dt>
                      <dd className="break-words whitespace-pre-line">{c.motivo}</dd>
                    </div>
                  ) : null}
                  {c.note ? (
                    <div>
                      <dt className="text-xs text-muted-foreground">{NOTE_CALL.titolo}</dt>
                      <dd className="break-words whitespace-pre-line">{c.note}</dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** The scales a day answered, in the form's words: an unanswered one is simply not there. */
function Risposte({ giorno }: { giorno: RigaCommento }) {
  const risposte = SCALE_COMMENTO.flatMap((scala) => {
    const livello = etichettaLivello(scala.campo, giorno[scala.campo])
    return livello ? [{ scala, livello }] : []
  })
  if (risposte.length === 0) return null
  return (
    <p className="text-xs text-muted-foreground">
      {risposte.map(({ scala, livello }) => (
        <span key={scala.campo} className="mr-3 inline-block">
          {scala.titolo}: <span className="text-foreground">{livello}</span>
        </span>
      ))}
    </p>
  )
}

function Parte({ titolo, descrizione, id, conteggio }: { titolo: string; descrizione: string; id: string; conteggio?: string }) {
  return (
    <div className="px-1">
      <h3 id={id} className="text-sm font-medium">
        {titolo}
        {conteggio !== undefined ? <span className="num font-normal text-muted-foreground"> ({conteggio})</span> : null}
      </h3>
      <p className="text-xs text-muted-foreground">{descrizione}</p>
    </div>
  )
}

/** One scale: the days at each level, with the level's meaning, as a small table. */
function Conteggi({ campo, righe }: { campo: CampoScala; righe: RigaCommento[] }) {
  const scala = SCALE_COMMENTO.find((s) => s.campo === campo)!
  const suGiorni = righe[0]?.su_giorni ?? 0
  return (
    <div className="rounded-xl bg-card p-4" data-testid={`conteggi-${campo}`}>
      <table className="w-full text-sm">
        <caption className="text-left">
          <span className="block font-medium">{scala.titolo}</span>
          <span className="block text-xs text-muted-foreground">
            <span className="num">{formatNumero(suGiorni)}</span>{' '}
            {suGiorni === 1 ? MARKETING.setting.suGiorno : MARKETING.setting.suGiorni}
          </span>
        </caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-2 text-left font-normal">
              Livello
            </th>
            <th scope="col" className="py-2 pl-3 text-right font-normal">
              Giorni
            </th>
            <th scope="col" className="w-14 py-2 pl-3 text-right font-normal">
              Quota
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {scala.opzioni.map((o) => {
            const r = righe.find((x) => x.livello === o.valore)
            return (
              <tr key={o.valore}>
                <th scope="row" className="py-2 text-left font-normal">
                  <span className="block">{o.etichetta}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{o.definizione}</span>
                </th>
                <td className="num py-2 pl-3 text-right align-top font-medium">{formatNumero(r?.giorni ?? 0)}</td>
                <td className="num py-2 pl-3 text-right align-top text-muted-foreground">{formatPercentuale(r?.quota, { unDecimale: true })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
