import { CircleAlert, PackageX, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'

import { CollegaVendita } from '@/app/(app)/calls/collega-vendita'
import type { RataAnteprima } from '@/app/(app)/sales/new/actions'
import {
  NuovaVenditaForm,
  type IniziVendita,
  type PercorsoPrecedente,
} from '@/app/(app)/sales/new/nuova-vendita-form'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { percorsoDiRitorno } from '@/lib/auth/origine'
import { requireRuolo } from '@/lib/auth/session'
import { GIORNI_VENDITA_VICINA } from '@/lib/call/follow-up'
import { aggiungiGiorni, oggiRoma, stessoGiornoTraMesi } from '@/lib/date'
import { formato, formatImportoInput } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { VENDITA_TESTI, dettaglioVenditaIn } from '@/lib/i18n/testi/esito'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { NUOVA_VENDITA } from '@/lib/i18n/testi/nuova-vendita'
import { createClient } from '@/lib/supabase/server'
import { leggiPianoPredefinito } from '@/lib/validation/anagrafiche'
import {
  GIORNI_INIZIO_PRIMA,
  TIPI_VENDITA,
  inizioMassimo,
  type TipoVendita,
} from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

type Indietro = { href: string; etichetta: string }

function Pagina({
  descrizione,
  indietro,
  children,
  lingua,
}: {
  descrizione?: string
  indietro: Indietro
  children: ReactNode
  lingua: Lingua
}) {
  return (
    <div className="max-w-xl space-y-6">
      <IntestazionePagina titolo={NUOVA_VENDITA[lingua].titolo} descrizione={descrizione} indietro={indietro} />
      {children}
    </div>
  )
}

function Impossibile({
  titolo,
  descrizione,
  azione,
  indietro,
  lingua,
}: {
  titolo: string
  descrizione: string
  azione: ReactNode
  indietro: Indietro
  lingua: Lingua
}) {
  return (
    <Pagina indietro={indietro} lingua={lingua}>
      <StatoVuoto Icona={SearchX} titolo={titolo} descrizione={descrizione} azione={azione} />
    </Pagina>
  )
}

function TornaAlleCall({ lingua }: { lingua: Lingua }) {
  return (
    <LinkBottone href="/calls" variant="outline">
      {NUOVA_VENDITA[lingua].tornaAlleCall}
    </LinkBottone>
  )
}

type VenditaPassata = {
  tipo: TipoVendita
  product_id: string | null
  prodotto_personalizzato: string | null
  data_inizio: string
  data_fine: string
  valore_contratto: number
  created_at: string
  prodotto: { nome: string } | null
}

/** The period a renewal extends: the path (not an upsell) that ends last. */
function ultimoPercorso(vendite: VenditaPassata[]): VenditaPassata | null {
  const piuTardi = (a: VenditaPassata, b: VenditaPassata) =>
    b.data_fine.localeCompare(a.data_fine) || b.created_at.localeCompare(a.created_at)
  const percorsi = vendite.filter((v) => v.tipo !== 'upsell')
  return [...(percorsi.length > 0 ? percorsi : vendite)].sort(piuTardi)[0] ?? null
}

type VenditaSimile = {
  sale_id: string
  cliente: string
  tipo: TipoVendita
  data_vendita: string
  valore_contratto: number
}

/**
 * The sale of the closed call may be there already, registered without the
 * call (Vendite, Alfire): a client with the lead's name or handle, signed
 * within a month of the call (public.vendite_da_collegare: the admin's
 * candidates, the closer's among his own sales). Said before the form, so
 * nobody makes a second client and a second sale for the same money; the
 * admin ties it, the closer asks him. The form stays: it may be another sale.
 */
function VenditaGiaRegistrata({
  vendite,
  admin,
  callId,
  nomeLead,
  hrefVendita,
  lingua,
}: {
  vendite: VenditaSimile[]
  admin: boolean
  callId: string
  nomeLead: string
  hrefVendita: string
  lingua: Lingua
}) {
  const idTitolo = 'vendita-gia-registrata'
  const VENDITA_DA_REGISTRARE = VENDITA_TESTI[lingua]
  const ETICHETTA_TIPO_VENDITA = ETICHETTE[lingua].tipoVendita
  const { formatData, formatEuro } = formato(lingua)
  return (
    <section
      aria-labelledby={idTitolo}
      className="space-y-3 rounded-xl border border-status-warning/40 bg-card p-3"
      data-testid="vendita-gia-registrata"
    >
      <h2 id={idTitolo} tabIndex={-1} className="flex items-center gap-1.5 text-sm font-medium text-status-warning">
        <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        {VENDITA_DA_REGISTRARE.giaRegistrataTitolo}
      </h2>
      <p className="text-sm text-muted-foreground">{VENDITA_DA_REGISTRARE.giaRegistrataTesto}</p>
      <ul className="space-y-2">
        {vendite.map((v) => {
          const dettaglio = dettaglioVenditaIn(ETICHETTA_TIPO_VENDITA[v.tipo], formatData(v.data_vendita), formatEuro(v.valore_contratto), lingua)
          return (
            <li key={v.sale_id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{v.cliente}</p>
                <p className="text-sm text-muted-foreground">
                  {ETICHETTA_TIPO_VENDITA[v.tipo]} · {formatData(v.data_vendita)} ·{' '}
                  <span className="num">{formatEuro(v.valore_contratto)}</span>
                </p>
              </div>
              <LinkBottone
                href={`/sales/${v.sale_id}`}
                variant="outline"
                className="px-3"
                aria-label={VENDITA_DA_REGISTRARE.nomeApriVendita(v.cliente, dettaglio)}
              >
                {VENDITA_DA_REGISTRARE.apriVendita}
              </LinkBottone>
            </li>
          )
        })}
      </ul>
      <p className="text-sm">{admin ? VENDITA_DA_REGISTRARE.giaRegistrataAdmin : VENDITA_DA_REGISTRARE.giaRegistrataCloser}</p>
      {admin ? (
        <CollegaVendita callId={callId} idTitolo={idTitolo} nomeLead={nomeLead} hrefVendita={hrefVendita} />
      ) : null}
    </section>
  )
}

/** "Marco De Luca" -> nome "Marco", cognome "De Luca". Only a prefill, editable. */
function dividiNome(completo: string) {
  const [nome = '', ...resto] = completo.trim().split(/\s+/)
  return { nome, cognome: resto.join(' ') }
}

export default async function NuovaVenditaPage({
  searchParams,
}: {
  searchParams: Promise<{ call?: string; cliente?: string; tipo?: string; da?: string }>
}) {
  const profilo = await requireRuolo(['closer', 'admin'])
  const { call: callId, cliente: clienteId, tipo, da } = await searchParams
  const lingua = await getLingua()
  const t = NUOVA_VENDITA[lingua]
  const { formatData } = formato(lingua)
  const tornaAlleCall = <TornaAlleCall lingua={lingua} />
  // "?da=": the page the call was closed from (the closer's day), only a path of this app
  const tornaA = percorsoDiRitorno(da)
  // back to where the sale starts from: that page, the closed call, the client's page, or the sales list
  const indietro: Indietro = tornaA
    ? { href: tornaA, etichetta: t.indietro }
    : callId
      ? { href: '/calls', etichetta: t.leMieCall }
      : clienteId && profilo.ruolo === 'admin'
        ? { href: `/clients/${clienteId}`, etichetta: t.schedaCliente }
        : profilo.ruolo === 'admin'
          ? { href: '/sales', etichetta: t.vendite }
          : { href: '/my-sales', etichetta: t.leMieVendite }
  const supabase = await createClient()
  const nessuno = Promise.resolve({ data: null })

  // Everything that does not depend on another read, in one round (spec 1.33.0 A10):
  // the products, and the call with its sale, or the client with its past sales
  const [
    { data: prodotti, error: erroreProdotti },
    { data: call },
    { data: venditaEsistente },
    { data: clienteScelto },
    { data: passate },
  ] = await Promise.all([
    supabase
      .from('products')
      .select('id, nome, durata_mesi, prezzo_listino, piano_predefinito')
      .eq('attivo', true)
      .order('durata_mesi'),
    callId
      ? supabase
          .from('calls')
          .select(
            'id, esito, lead_id, programmata_il, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)',
          )
          .eq('id', callId)
          .maybeSingle()
      : nessuno,
    callId ? supabase.from('sales').select('id').eq('call_id', callId).maybeSingle() : nessuno,
    !callId && clienteId ? supabase.from('clients').select('id, nome, cognome').eq('id', clienteId).maybeSingle() : nessuno,
    !callId && clienteId && tipo === 'rinnovo'
      ? supabase
          .from('sales')
          .select('tipo, product_id, prodotto_personalizzato, data_inizio, data_fine, valore_contratto, created_at, prodotto:products(nome)')
          .eq('client_id', clienteId)
      : nessuno,
  ])
  if (erroreProdotti) throw new Error(t.errore)

  const oggi = oggiRoma()
  let clienteEsistente: { id: string; nome: string } | null = null
  let prefill = { nome: '', cognome: '', instagram_handle: '' }
  let riepilogo: [string, string][] = []
  let percorsoPrecedente: PercorsoPrecedente | null = null
  let iniziali: IniziVendita | null = null
  let anteprimaIniziale: RataAnteprima[] | null = null
  // the day the sale is signed: today, or the day of the closed call
  let dataVenditaIniziale = oggi
  // a sale without the call that looks like this one (VenditaGiaRegistrata)
  let simili: VenditaSimile[] = []
  let nomeLead = ''

  if (callId) {
    if (!call) {
      return (
        <Impossibile
          indietro={indietro}
          lingua={lingua}
          titolo={t.callNonTrovata}
          descrizione={t.callNonTrovataDescrizione}
          azione={tornaAlleCall}
        />
      )
    }
    if (call.esito !== 'chiusa') {
      return (
        <Impossibile
          indietro={indietro}
          lingua={lingua}
          titolo={t.nonChiusa}
          descrizione={t.nonChiusaDescrizione}
          azione={tornaAlleCall}
        />
      )
    }

    if (venditaEsistente) {
      return (
        <Impossibile
          indietro={indietro}
          lingua={lingua}
          titolo={t.giaRegistrata}
          descrizione={t.giaRegistrataDescrizione}
          azione={<LinkBottone href={`/sales/${venditaEsistente.id}`}>{t.apriVendita}</LinkBottone>}
        />
      )
    }

    const giornoCall = oggiRoma(new Date(call.programmata_il))
    const [{ data: cliente }, candidate] = await Promise.all([
      supabase
        .from('clients')
        .select('id, nome, cognome')
        .eq('lead_id', call.lead_id)
        .order('created_at')
        .limit(1)
        .maybeSingle(),
      // a reminder, never a reason for the form to fail: an error shows nothing
      supabase.rpc('vendite_da_collegare', { p_call_id: call.id }),
    ])
    const dal = aggiungiGiorni(giornoCall, -GIORNI_VENDITA_VICINA)
    const al = aggiungiGiorni(giornoCall, GIORNI_VENDITA_VICINA)
    simili = (candidate.data ?? []).filter((v) => v.stesso_cliente && v.data_vendita >= dal && v.data_vendita <= al)
    nomeLead = call.lead?.nome ?? t.leadSenzaNome

    if (cliente) {
      clienteEsistente = { id: cliente.id, nome: [cliente.nome, cliente.cognome].filter(Boolean).join(' ') }
    } else if (call.lead) {
      prefill = {
        ...dividiNome(call.lead.nome),
        instagram_handle: call.lead.instagram_handle?.replace(/^@/, '') ?? '',
      }
    }

    // A call closed on a past day (from the closer's day) is signed that day: the
    // closer's row then shows the close, the cash and the revenue together
    dataVenditaIniziale = giornoCall < oggi ? giornoCall : oggi

    riepilogo = [
      [t.setter, call.setter?.nome ?? '–'],
      [t.closer, call.closer?.nome ?? '–'],
      [t.callDel, formatData(giornoCall)],
    ]
  } else if (clienteId) {
    const cliente = clienteScelto
    if (!cliente) {
      return (
        <Impossibile
          indietro={indietro}
          lingua={lingua}
          titolo={t.clienteNonTrovato}
          descrizione={t.clienteNonTrovatoDescrizione}
          azione={tornaAlleCall}
        />
      )
    }
    clienteEsistente = { id: cliente.id, nome: [cliente.nome, cliente.cognome].filter(Boolean).join(' ') }

    // "Ha rinnovato": the new period starts the day after the last one, with the same product
    if (tipo === 'rinnovo') {
      const ultimo = ultimoPercorso(passate ?? [])
      if (ultimo) {
        const giornoDopo = aggiungiGiorni(ultimo.data_fine, 1)
        // the form takes a start from a month before the sale date to a year after
        // (a renewal signed early): outside that window the renewal starts today
        const partenza: PercorsoPrecedente['partenza'] =
          giornoDopo < aggiungiGiorni(oggi, -GIORNI_INIZIO_PRIMA)
            ? 'oggi_finito'
            : giornoDopo > inizioMassimo('rinnovo', oggi)
              ? 'oggi_lontano'
              : 'giorno_dopo'
        percorsoPrecedente = {
          prodotto: ultimo.prodotto?.nome ?? ultimo.prodotto_personalizzato ?? '–',
          data_inizio: ultimo.data_inizio,
          data_fine: ultimo.data_fine,
          valore_contratto: ultimo.valore_contratto,
          partenza,
        }

        // the same product only while it is still sold; the rest as if chosen by hand
        const prodotto = prodotti.find((p) => p.id === ultimo.product_id)
        const piano = prodotto ? leggiPianoPredefinito(prodotto.piano_predefinito) : null
        iniziali = {
          data_inizio: partenza === 'giorno_dopo' ? giornoDopo : oggi,
          product_id: prodotto?.id,
          valore_contratto: prodotto ? formatImportoInput(prodotto.prezzo_listino) : '',
          piano: piano?.length ? 'personalizzato' : 'uguale',
          rate: (piano ?? []).map((r) => ({
            scadenza: stessoGiornoTraMesi(oggi, r.mese),
            importo: formatImportoInput(r.importo),
          })),
        }
        // the equal-split preview, from the same function the form asks
        if (prodotto && !piano?.length) {
          const { data } = await supabase.rpc('piano_rate', {
            p_valore: prodotto.prezzo_listino,
            p_numero_rate: 1,
            p_data_vendita: oggi,
          })
          anteprimaIniziale = data ?? null
        }
      }
    }
  }

  if (prodotti.length === 0) {
    return (
      <Pagina indietro={indietro} lingua={lingua}>
        <StatoVuoto Icona={PackageX} titolo={t.nessunProdotto} descrizione={t.nessunProdottoDescrizione} />
      </Pagina>
    )
  }

  // opened from a client (sheet, Rinnovi, Panoramica: those links name the type):
  // after saving, back to the client's history, where the new period shows on top
  const ritorno =
    tornaA ??
    (clienteEsistente && !callId && profilo.ruolo === 'admin' && TIPI_VENDITA.includes(tipo as TipoVendita)
      ? `/clients/${clienteEsistente.id}`
      : null)

  const tipoIniziale: TipoVendita =
    clienteEsistente && TIPI_VENDITA.includes(tipo as TipoVendita)
      ? (tipo as TipoVendita)
      : clienteEsistente && !callId
        ? 'rinnovo'
        : 'nuovo'

  return (
    <Pagina indietro={indietro} lingua={lingua} descrizione={callId ? t.precompilata : undefined}>
      {riepilogo.length > 0 ? (
        <dl className="divide-y divide-border rounded-xl bg-card px-3" data-testid="precompilata">
          {riepilogo.map(([etichetta, valore]) => (
            <div key={etichetta} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <dt className="text-sm text-muted-foreground">{etichetta}</dt>
              <dd className="text-right text-sm">{valore}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {callId && simili.length > 0 ? (
        <VenditaGiaRegistrata
          vendite={simili}
          admin={profilo.ruolo === 'admin'}
          callId={callId}
          nomeLead={nomeLead}
          lingua={lingua}
          hrefVendita={`/sales/new?${new URLSearchParams({ call: callId, ...(tornaA ? { da: tornaA } : {}) }).toString()}`}
        />
      ) : null}

      <NuovaVenditaForm
        oggi={oggi}
        dataVenditaIniziale={dataVenditaIniziale}
        prodotti={prodotti.map((p) => ({ ...p, piano_predefinito: leggiPianoPredefinito(p.piano_predefinito) }))}
        callId={callId ?? null}
        clienteEsistente={clienteEsistente}
        prefill={prefill}
        tipoIniziale={tipoIniziale}
        iniziali={iniziali}
        anteprimaIniziale={anteprimaIniziale}
        percorsoPrecedente={percorsoPrecedente}
        ritorno={ritorno}
      />
    </Pagina>
  )
}
