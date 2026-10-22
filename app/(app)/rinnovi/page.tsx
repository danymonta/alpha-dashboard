import { Archive, CalendarClock, History, RefreshCw, UserMinus } from 'lucide-react'
import Link from 'next/link'

import { BottoneArchivio, RiapriCliente, SezioneArchiviabile } from '@/app/(app)/clients/[id]/chiusura-cliente'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { BottoneWhatsApp } from '@/components/pagamento/whatsapp'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import { buttonVariants } from '@/components/ui/button'
import { puoScrivere, RUOLI_COME_ADMIN } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, fineMese, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { RINNOVI } from '@/lib/i18n/testi/rinnovi'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { linkWhatsApp, messaggioRinnovo } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const FINESTRE = [30, 60] as const

type Cliente = {
  client_id: string | null
  nome: string | null
  cognome: string | null
  data_fine_ultima: string | null
  valore_firmato: number | null
}

function giorniTra(da: string, a: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000)
}

/**
 * "Rinnovi": who ends soon and who ended not long ago, each with "Registra
 * rinnovo" and a WhatsApp message ready. The renewal rate of the month comes
 * from metriche_periodo (CLAUDE.md section 9). The clients the admin closed
 * ("Non rinnova", 04/10/2026) are never among them: they have their own
 * section, "Non rinnovano", with "Archivia" (05/10/2026: ex cliente, out of
 * this page; the focus goes to the next row, SezioneArchiviabile) and "Riapri".
 */
export default async function RinnoviPage({ searchParams }: { searchParams: Promise<{ entro?: string }> }) {
  // the admin, and the business coach in read only (22/10/2026): no message, no renewal, no archive
  const profilo = await requireRuolo(RUOLI_COME_ADMIN)
  const scrive = puoScrivere(profilo.ruolo)
  const { entro } = await searchParams
  const giorni = FINESTRE.includes(Number(entro) as (typeof FINESTRE)[number]) ? Number(entro) : 30
  const oggi = oggiRoma()
  const lingua = await getLingua()
  const t = RINNOVI[lingua]
  const { formatData, formatEuro, formatMese, formatPercentuale } = formato(lingua)
  const primo = primoDelMeseISO(oggi)
  const supabase = await createClient()

  const [inScadenza, scaduti, chiusi, chiusure, metriche] = await Promise.all([
    supabase
      .from('v_clienti')
      .select('client_id, nome, cognome, data_fine_ultima, valore_firmato')
      // the dates say it: whoever ends in the window, started or not (attivo, in_scadenza, da_iniziare)
      .gte('data_fine_ultima', oggi)
      .lte('data_fine_ultima', aggiungiGiorni(oggi, giorni))
      // a closed client does not renew, an archived one even less: never among the ones to chase
      .not('stato', 'in', '(chiuso,ex_cliente,sospeso)')
      .order('data_fine_ultima'),
    supabase
      .from('v_clienti')
      .select('client_id, nome, cognome, data_fine_ultima, valore_firmato')
      .eq('stato', 'scaduto')
      // ended means an end in the past: never "finito il …, -182 giorni fa" for a path not started yet
      .lt('data_fine_ultima', oggi)
      .order('data_fine_ultima', { ascending: false }),
    supabase
      .from('v_clienti')
      .select('client_id, nome, cognome, data_fine_ultima, valore_firmato')
      .eq('stato', 'chiuso'),
    // the day and the reason of each closure in force, and who is archived (05/10/2026)
    supabase.from('v_clienti_chiusi').select('client_id, chiuso_il, motivo, archiviato_il'),
    supabase.rpc('metriche_periodo', { p_da: primo, p_a: fineMese(primo) }).single(),
  ])
  if (inScadenza.error || scaduti.error || chiusi.error || chiusure.error || metriche.error) {
    throw new Error(t.errore)
  }

  const chiusura = new Map(chiusure.data.map((c) => [c.client_id, c]))
  // archived as ex clienti: out of "Non rinnovano", in Clienti under "Ex cliente"
  const archiviati = chiusure.data.filter((c) => c.archiviato_il).length
  // the most recent closure first
  const nonRinnovano = chiusi.data
    .map((c) => ({ ...c, chiuso_il: chiusura.get(c.client_id)?.chiuso_il ?? null, motivo: chiusura.get(c.client_id)?.motivo ?? null }))
    .sort((a, b) => (b.chiuso_il ?? '').localeCompare(a.chiuso_il ?? ''))

  const ids = [...inScadenza.data, ...scaduti.data, ...nonRinnovano]
    .map((c) => c.client_id)
    .filter((id): id is string => Boolean(id))
  const { data: contatti } = ids.length
    ? await supabase.from('clients').select('id, telefono').in('id', ids)
    : { data: [] as { id: string; telefono: string | null }[] }
  const telefono = new Map((contatti ?? []).map((c) => [c.id, c.telefono]))
  const m = metriche.data

  const riga = (c: Cliente, scaduto: boolean) => {
    const nome = [c.nome, c.cognome].filter(Boolean).join(' ')
    const mancano = c.data_fine_ultima ? giorniTra(oggi, c.data_fine_ultima) : null
    return (
      <li key={c.client_id} aria-label={nome} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-48">
          <LinkRiga href={`/clients/${c.client_id}`} className="flex items-center gap-1.5 text-sm font-medium hover:underline">
            <span className="truncate">{nome}</span>
            <IndicatoreLink />
          </LinkRiga>
          <p className={cn('flex items-center gap-1 text-xs', scaduto ? 'text-status-warning' : 'text-muted-foreground')}>
            {scaduto ? <History className="size-3.5" aria-hidden="true" /> : <CalendarClock className="size-3.5" aria-hidden="true" />}
            <span className="num">
              {scaduto
                ? t.finitoFa(formatData(c.data_fine_ultima), -(mancano ?? 0))
                : mancano === 0
                  ? t.finisceOggi
                  : t.finisceTra(formatData(c.data_fine_ultima), mancano ?? 0)}
            </span>
          </p>
        </div>
        <span className="num text-sm text-muted-foreground" title={t.valoreFirmato}>
          {formatEuro(c.valore_firmato, { compatto: true })}
        </span>
        {scrive ? (
          <div className="flex items-center gap-2">
            <BottoneWhatsApp
              compatto
              etichetta={`Scrivi a ${nome} su WhatsApp per il rinnovo`}
              href={linkWhatsApp(
                c.client_id ? telefono.get(c.client_id) : null,
                messaggioRinnovo({ nome, data_fine: c.data_fine_ultima!, oggi }),
              )}
            />
            {/* one per row: prefetched only on intent (LinkRiga), styled as LinkBottone */}
            <LinkRiga href={`/sales/new?cliente=${c.client_id}&tipo=rinnovo`} className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>
              <IndicatoreLink riposo={<RefreshCw className="size-4" />} />
              Registra rinnovo
            </LinkRiga>
          </div>
        ) : null}
      </li>
    )
  }

  const rigaChiuso = (c: Cliente & { chiuso_il: string | null; motivo: string | null }) => {
    const nome = [c.nome, c.cognome].filter(Boolean).join(' ')
    return (
      <li key={c.client_id} aria-label={nome} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-48">
          <LinkRiga href={`/clients/${c.client_id}`} className="flex items-center gap-1.5 text-sm font-medium hover:underline">
            <span className="truncate">{nome}</span>
            <IndicatoreLink />
          </LinkRiga>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Archive className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="num">
              {c.chiuso_il ? t.chiusoIl(formatData(c.chiuso_il)) : t.chiuso}
              {c.data_fine_ultima ? t.percorsoFino(formatData(c.data_fine_ultima)) : ''}
            </span>
          </p>
          {c.motivo ? (
            <p className="mt-0.5 line-clamp-2 text-xs break-words text-muted-foreground" title={c.motivo}>
              {c.motivo}
            </p>
          ) : null}
        </div>
        {scrive ? (
          <div className="flex flex-wrap items-center gap-2">
            {c.data_fine_ultima ? (
              <BottoneWhatsApp
                compatto
                etichetta={`Scrivi a ${nome} su WhatsApp`}
                href={linkWhatsApp(
                  c.client_id ? telefono.get(c.client_id) : null,
                  messaggioRinnovo({ nome, data_fine: c.data_fine_ultima, oggi }),
                )}
              />
            ) : null}
            {c.client_id ? <BottoneArchivio clientId={c.client_id} cliente={nome} archiviato={false} breve /> : null}
            {c.client_id ? <RiapriCliente clientId={c.client_id} cliente={nome} /> : null}
            {/* one per row: prefetched only on intent (LinkRiga), styled as LinkBottone */}
            <LinkRiga href={`/sales/new?cliente=${c.client_id}&tipo=rinnovo`} className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>
              <IndicatoreLink riposo={<RefreshCw className="size-4" />} />
              Registra rinnovo
            </LinkRiga>
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={scrive ? t.descrizioneAdmin : t.descrizioneLettura}
      />

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-card p-4 sm:grid-cols-3" data-testid="tasso-rinnovo">
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">{t.tassoDi(formatMese(primo))}</dt>
          <dd className="num text-2xl font-semibold text-foreground">{formatPercentuale(m.tasso_rinnovo)}</dd>
          <dd className="num text-xs text-muted-foreground">
            {t.rinnovatiSu(m.rinnovati, m.in_scadenza)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t.entro(giorni)}</dt>
          <dd className="num text-2xl font-semibold">{inScadenza.data.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t.daRecuperare}</dt>
          <dd className="num text-2xl font-semibold">{scaduti.data.length}</dd>
          <dd className="text-xs text-muted-foreground">{t.finiti90}</dd>
        </div>
      </dl>

      <section aria-labelledby="titolo-scadenza" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titolo-scadenza" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t.inScadenza}
          </h2>
          <nav aria-label={t.finestra} className="flex gap-2">
            {FINESTRE.map((f) => (
              <Link
                key={f}
                href={f === 30 ? '/rinnovi' : `/rinnovi?entro=${f}`}
                aria-current={f === giorni ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-pillola border px-3 text-sm',
                  f === giorni
                    ? 'border-selezione bg-selezione text-selezione-foreground'
                    : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {t.nGiorni(f)}
              </Link>
            ))}
          </nav>
        </div>
        {inScadenza.data.length === 0 ? (
          <StatoVuoto
            Icona={CalendarClock}
            titolo={t.nessunoFinisce(giorni)}
            descrizione={giorni === 30 ? t.guardaAvanti : t.nessunaChiusura}
            azione={giorni === 30 ? <LinkBottone href="/rinnovi?entro=60" variant="outline">{t.vedi60}</LinkBottone> : undefined}
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="elenco-in-scadenza">
            {inScadenza.data.map((c) => riga(c, false))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titolo-recuperare" className="space-y-2">
        <h2 id="titolo-recuperare" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t.daRecuperare}
        </h2>
        {scaduti.data.length === 0 ? (
          <p className="rounded-xl bg-card px-3 py-4 text-sm text-muted-foreground">
            {t.nessunScaduto}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="elenco-da-recuperare">
            {scaduti.data.map((c) => riga(c, true))}
          </ul>
        )}
      </section>

      {/* an archived row leaves the list: the focus goes to the next one, not to the page */}
      <SezioneArchiviabile aria-labelledby="titolo-non-rinnovano" className="space-y-2">
        <h2
          id="titolo-non-rinnovano"
          tabIndex={-1}
          data-focus-archivio="titolo"
          className="rounded-sm px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {t.nonRinnovano} <span className="num">({nonRinnovano.length})</span>
        </h2>
        {nonRinnovano.length === 0 ? (
          <p className="rounded-xl bg-card px-3 py-4 text-sm text-muted-foreground">
            {/* the archived ones are closed too: counted just below */}
            {archiviati > 0 ? t.nessunoDaArchiviare : t.nessunChiuso} {t.quandoChiuso}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="elenco-non-rinnovano">
            {nonRinnovano.map(rigaChiuso)}
          </ul>
        )}
        {archiviati > 0 ? (
          <Link
            href="/clients?stato=ex_cliente"
            data-testid="link-archiviati"
            data-focus-archivio="archiviati"
            className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <UserMinus className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {t.archiviati} <span className="num">{archiviati}</span>
              {t.archiviatiDopo}
            </span>
          </Link>
        ) : null}
      </SezioneArchiviabile>
    </div>
  )
}
