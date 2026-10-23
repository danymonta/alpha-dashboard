import { Lightbulb, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { ChiediSpunti } from '@/components/marketing/spunti/chiedi-spunti'
import { IdeaSpuntiCard } from '@/components/marketing/spunti/idea-spunti'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING_LETTURA } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { etichettaContenuto } from '@/lib/i18n/testi/closer'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import { leggiSpunti } from '@/lib/marketing/spunti/leggi'
import type { VoceSpunto } from '@/lib/marketing/spunti/tipi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function Sezione({ titolo, id, children }: { titolo: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titolo}
      </h2>
      {children}
    </section>
  )
}

function Voci({ voci, fatti }: { voci: VoceSpunto[]; fatti: Record<string, string> }) {
  return (
    <ul className="space-y-2">
      {voci.map((v, i) => (
        <li key={i} className="rounded-xl bg-card p-4 text-sm">
          <p lang="it" className="font-medium break-words">
            {v.testo}
          </p>
          <p lang="it" className="break-words text-muted-foreground">
            {v.perche}
          </p>
          <FattiRiga rif={v.rif} fatti={fatti} />
        </li>
      ))}
    </ul>
  )
}

/** The sentences of the facts a point rests on (the numbers are the database's). */
function FattiRiga({ rif, fatti }: { rif: string[]; fatti: Record<string, string> }) {
  const frasi = rif.filter((r) => r.startsWith('F') || r.startsWith('R')).map((r) => fatti[r]).filter(Boolean)
  if (frasi.length === 0) return null
  return (
    <p lang="it" className="mt-1 text-xs text-muted-foreground">
      {frasi.join(' · ')}
    </p>
  )
}

type RigaPerTe = {
  gruppo: string | null
  etichetta: string
  call: number
  svolte: number
  show_rate: number | null
  chiuse: number
  close_rate: number | null
  vendite_nuove: number | null
  revenue_nuovi: number | null
  cash_nuovi: number | null
  obiezioni: { categoria: string }[]
}

export default async function SpuntiPage() {
  // the business coach reads the brief and «Per te» like the admin (22/10/2026), never asks for one
  const profilo = await requireRuolo(RUOLI_MARKETING_LETTURA)
  const admin = profilo.ruolo === 'admin' || profilo.ruolo === 'business_coach'
  const puoChiedere = profilo.ruolo === 'admin' || profilo.ruolo === 'marketing'
  const lingua = await getLingua()
  const t = MARKETING[lingua].spunti
  const { formatData, formatEuro, formatNumero, formatPercentuale } = formato(lingua)
  const supabase = await createClient()
  const { pronta, inCorso, fallita, nelCalendario } = await leggiSpunti(supabase)

  // «Per te» (admin only, with his session): the numbers behind each content; the Marketing area never gets them
  let perTe: RigaPerTe[] = []
  let perTeErrore = false
  if (admin) {
    const oggi = oggiRoma()
    const { data, error } = await supabase.rpc('call_numeri_periodo', { p_da: aggiungiGiorni(oggi, -28), p_a: aggiungiGiorni(oggi, -1), p_per: 'contenuto' })
    perTeErrore = Boolean(error)
    perTe = ((data ?? []) as unknown as RigaPerTe[]).filter((r) => r.gruppo !== null)
  }

  const c = pronta?.contenuto ?? null
  const soloReel = pronta?.fonti?.note_team === false

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={lingua === 'en' ? `${t.descrizione} ${t.inItaliano}` : t.descrizione}
        azione={puoChiedere ? <ChiediSpunti inCorso={inCorso !== null} /> : undefined}
      />

      {inCorso ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="spunti-in-corso">
          <Lightbulb className="size-4 shrink-0" aria-hidden="true" />
          {t.inCorso}
        </p>
      ) : null}
      {fallita && !inCorso ? (
        <p role="alert" className="flex items-start gap-2 text-sm" data-testid="spunti-fallita">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          {fallita.errore ?? t.fallita}
          {puoChiedere ? t.riprova : ''}
        </p>
      ) : null}

      {!pronta || !c ? (
        <StatoVuoto
          Icona={Lightbulb}
          titolo={t.vuoto}
          descrizione={puoChiedere ? t.vuotoChiedi : t.vuotoLettura}
        />
      ) : (
        <>
          <p className="px-1 text-sm text-muted-foreground" data-testid="spunti-titolo">
            {t.del(
              pronta.finita_il ? formatData(pronta.finita_il) : formatData(pronta.created_at),
              formatData(pronta.periodo_da),
              formatData(pronta.periodo_a),
            )}
          </p>
          {soloReel ? (
            <p role="status" className="text-sm text-muted-foreground" data-testid="spunti-solo-reel">
              {profilo.ruolo === 'admin' ? (
                <>
                  {t.soloReelAdmin}{' '}
                  <Link href="/settings/instagram" className="underline underline-offset-4">
                    {t.soloReelLink}
                  </Link>
                  .
                </>
              ) : (
                t.soloReel
              )}
            </p>
          ) : null}

          <section className="rounded-xl bg-card p-4" aria-labelledby="spunti-in-breve">
            <h2 id="spunti-in-breve" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t.inBreve}
            </h2>
            <p lang="it" className="mt-1 text-sm break-words">
              {c.in_breve}
            </p>
          </section>

          {c.cosa_funziona.length > 0 ? (
            <Sezione titolo={t.funziona} id="spunti-funziona">
              <Voci voci={c.cosa_funziona} fatti={c.fatti} />
            </Sezione>
          ) : null}

          {c.temi.length > 0 ? (
            <Sezione titolo={t.temi} id="spunti-temi">
              <ul className="space-y-2">
                {c.temi.map((tema, i) => (
                  <li key={i} className="rounded-xl bg-card p-4 text-sm">
                    <p lang="it" className="font-medium break-words">
                      {tema.tema}
                    </p>
                    <p lang="it" className="break-words">
                      {tema.cosa_dicono}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tema.fonti.map((f) => t.fonte[f]).join(', ')} · {t.tendenza[tema.tendenza]}
                    </p>
                  </li>
                ))}
              </ul>
            </Sezione>
          ) : null}

          {c.obiezioni.length > 0 ? (
            <Sezione titolo={t.obiezioni} id="spunti-obiezioni">
              <ul className="space-y-2">
                {c.obiezioni.map((o, i) => (
                  <li key={i} className="rounded-xl bg-card p-4 text-sm">
                    <p lang="it" className="font-medium break-words">
                      {o.obiezione}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.pesa} {(t.dove as Record<string, string>)[o.dove_pesa] ?? o.dove_pesa}
                    </p>
                    <p lang="it" className="mt-1 break-words">
                      {o.contenuto_che_la_scioglie}
                    </p>
                    <p lang="it" className="break-words text-muted-foreground">
                      {o.perche}
                    </p>
                  </li>
                ))}
              </ul>
            </Sezione>
          ) : null}

          {c.domande.length > 0 ? (
            <Sezione titolo={t.domande} id="spunti-domande">
              <ul className="space-y-2">
                {c.domande.map((d, i) => (
                  <li key={i} className="rounded-xl bg-card p-4 text-sm">
                    <p lang="it" className="font-medium break-words">
                      {d.domanda}
                    </p>
                    <p lang="it" className="break-words text-muted-foreground">
                      {d.risposta_in_breve}
                    </p>
                  </li>
                ))}
              </ul>
            </Sezione>
          ) : null}

          {c.mantieni.length + c.cambia.length + c.potenzia.length > 0 ? (
            <Sezione titolo={t.mcp} id="spunti-mcp">
              {c.mantieni.length > 0 ? (
                <>
                  <h3 className="px-1 text-sm font-medium">{t.mantieni}</h3>
                  <Voci voci={c.mantieni} fatti={c.fatti} />
                </>
              ) : null}
              {c.cambia.length > 0 ? (
                <>
                  <h3 className="px-1 text-sm font-medium">{t.cambia}</h3>
                  <Voci voci={c.cambia} fatti={c.fatti} />
                </>
              ) : null}
              {c.potenzia.length > 0 ? (
                <>
                  <h3 className="px-1 text-sm font-medium">{t.potenzia}</h3>
                  <Voci voci={c.potenzia} fatti={c.fatti} />
                </>
              ) : null}
            </Sezione>
          ) : null}

          {c.idee.length > 0 ? (
            <Sezione titolo={t.idee(c.idee.length)} id="spunti-idee">
              <ul className="space-y-2" data-testid="idee-spunti">
                {c.idee.map((idea, i) => (
                  <IdeaSpuntiCard key={i} spuntiId={pronta.id} indice={i} idea={idea} giaNelCalendario={nelCalendario.get(i) ?? null} />
                ))}
              </ul>
            </Sezione>
          ) : null}
        </>
      )}

      {/* «Per te»: only the admin, read with his session; the rest of the Marketing area never receives it */}
      {admin ? (
        <section aria-labelledby="spunti-per-te" className="space-y-2" data-testid="spunti-per-te">
          <h2 id="spunti-per-te" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t.perTe}
          </h2>
          {perTeErrore ? (
            <p role="alert" className="rounded-xl border border-border p-4 text-sm">
              {t.perTeErrore}
            </p>
          ) : perTe.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{t.perTeVuoto}</p>
          ) : (
            <ul className="space-y-2">
              {perTe.map((r) => (
                <li key={r.gruppo} className="rounded-xl bg-card p-4 text-sm">
                  <p className="font-medium break-words">
                    {etichettaContenuto(r.etichetta, lingua)}
                  </p>
                  <p className="num text-muted-foreground">
                    {t.perTeRiga(
                      formatNumero(r.call),
                      formatPercentuale(r.show_rate),
                      formatNumero(r.chiuse),
                      formatPercentuale(r.close_rate),
                      formatNumero(r.vendite_nuove ?? 0),
                      formatEuro(r.revenue_nuovi ?? 0),
                      formatEuro(r.cash_nuovi ?? 0),
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="px-1 text-xs text-muted-foreground">
            <Link href="/setting/closer?per=contenuto" className="inline-flex min-h-11 items-center underline underline-offset-4">
              {t.tuttiNumeri}
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  )
}
