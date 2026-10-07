import { aggiungiGiorni, lunediDellaSettimana, nomeGiorno } from '@/lib/date'
import { formatData, formatEuro, parseDataISO } from '@/lib/format'

/**
 * The admins' weekly email (Dany, 07/10/2026: "non mi inviare ogni giorno la
 * mail con gli incassi e il recap del setter, mi basta ogni venerdì sera").
 * The daily cron (app/api/cron/giornaliero) sends it on Friday evening in
 * Europe/Rome, with the week from Saturday to Friday: seven days, so nothing
 * falls between two emails. Pure: tested in tests/riepilogo-settimana.test.ts.
 */

type TipoVendita = 'nuovo' | 'rinnovo' | 'upsell'

/**
 * Which of the four parts of the cash a payment is (CLAUDE.md section 9): a
 * client who entered in the week, an instalment of a client already in, a
 * renewal, an upsell.
 */
type ParteCash = 'nuovi_clienti' | 'rate_precedenti' | 'rinnovo' | 'upsell'

/**
 * What public.riepilogo_settimana returns: the week's business numbers, team
 * totals and clients only. Amounts and counts come from SQL: nothing is added
 * up here.
 */
export type Riepilogo = {
  da: string
  a: string
  cash: number
  /** the four parts, adding up to cash */
  cash_per_parte: Record<ParteCash, number>
  /** cash-ins and refunds, oldest first */
  incassi: {
    giorno: string
    cliente: string
    importo: number
    metodo: string | null
    rimborso: boolean
    tipo: TipoVendita
    numero_rata: number
    numero_rate: number
    parte: ParteCash
  }[]
  /** sales signed in the week, oldest first */
  vendite: { giorno: string; cliente: string; tipo: TipoVendita; valore: number }[]
  vendite_per_tipo: Record<TipoVendita, number>
  /** as of p_a (the Friday) */
  in_ritardo: { numero: number; totale: number }
  /** the 8 clients late the longest, oldest first */
  clienti_in_ritardo: string[]
  /** how many clients are late, all of them: the names past 8 are in the app */
  clienti_in_ritardo_totale: number
  in_scadenza_7_giorni: { numero: number; totale: number }
  /** from the setters' reports */
  dm_totali: number
  conversazioni: number
  call_prenotate: number
  /** calls by day of programmata_il */
  call_svolte: number
  no_show: number
  chiuse: number
}

/** At most this many lines of each list; the rest are in the app. */
export const MASSIMO_INCASSI = 40
export const MASSIMO_VENDITE = 20

/**
 * The week the summary covers when the cron runs on `oggi` (YYYY-MM-DD in
 * Europe/Rome): on Friday, from the Saturday before to that Friday; any other
 * day, null (no email).
 */
export function settimanaDelRiepilogo(oggi: string): { da: string; a: string } | null {
  // Italian weeks start on Monday: Friday is four days later
  if (aggiungiGiorni(lunediDellaSettimana(oggi), 4) !== oggi) return null
  return { da: aggiungiGiorni(oggi, -6), a: oggi }
}

const TESTO = '#1C1C1E'
const TENUE = '#6B6B70'
const SFONDO = '#F4F2EE'
const BORDEAUX = '#7A1F2B'
const TIPO: Record<TipoVendita, string> = { nuovo: 'nuovo cliente', rinnovo: 'rinnovo', upsell: 'upsell' }
const PARTE: Record<ParteCash, string> = {
  nuovi_clienti: 'nuovo cliente',
  rate_precedenti: 'cliente già entrato',
  rinnovo: 'rinnovo',
  upsell: 'upsell',
}
/** The "Di cui" under the cash: the same words as the overview. */
const DI_CUI: Record<ParteCash, string> = {
  nuovi_clienti: 'nuovi clienti della settimana',
  rate_precedenti: 'rate di clienti già entrati',
  rinnovo: 'rinnovi',
  upsell: 'upsell',
}
/** Payment methods inside a sentence: "bonifico", "PayPal". */
const METODO: Record<string, string> = {
  bonifico: 'bonifico',
  stripe: 'Stripe',
  paypal: 'PayPal',
  carta: 'carta',
  contanti: 'contanti',
  altro: 'altro metodo',
}
// "2 nuovi clienti, 1 rinnovo": singular and plural of each type
const QUANTE: Record<TipoVendita, [string, string]> = {
  nuovo: ['nuovo cliente', 'nuovi clienti'],
  rinnovo: ['rinnovo', 'rinnovi'],
  upsell: ['upsell', 'upsell'],
}

const giornoBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })

/** "09/10" */
function giornoMese(iso: string): string {
  return formatData(iso).slice(0, 5)
}

/** "ven 09/10": the day in front of each line. */
function giornoRiga(iso: string): string {
  return `${giornoBreve.format(parseDataISO(iso))} ${giornoMese(iso)}`
}

/** "sabato 03/10 a venerdì 09/10/2026"; the year on both ends when it changes. */
function periodo(r: Riepilogo): string {
  const stessoAnno = r.da.slice(0, 4) === r.a.slice(0, 4)
  const inizio = stessoAnno ? giornoMese(r.da) : formatData(r.da)
  return `da ${nomeGiorno(r.da)} ${inizio} a ${nomeGiorno(r.a)} ${formatData(r.a)}`
}

/** "3 (2 nuovi clienti, 1 rinnovo)": the week's sales, split by type in SQL. */
function venditeDellaSettimana(r: Riepilogo): string {
  const perTipo = r.vendite_per_tipo
  if (r.vendite.length === 0) return '0'
  const parti = (Object.keys(QUANTE) as TipoVendita[])
    .filter((t) => perTipo[t] > 0)
    .map((t) => `${perTipo[t]} ${QUANTE[t][perTipo[t] === 1 ? 0 : 1]}`)
  return parti.length ? `${r.vendite.length} (${parti.join(', ')})` : String(r.vendite.length)
}

/** "nuovi clienti della settimana 1.500,00 €, rinnovi 350,00 €": the parts that are not zero. */
function diCui(r: Riepilogo): string | null {
  const parti = (Object.keys(DI_CUI) as ParteCash[])
    .filter((p) => Number(r.cash_per_parte[p]) !== 0)
    .map((p) => `${DI_CUI[p]} ${formatEuro(r.cash_per_parte[p])}`)
  return parti.length ? parti.join(', ') : null
}

/** "ven 09/10 · Incasso: Mario Rossi, 500,00 € (rata 2 di 4, cliente già entrato, bonifico)" */
function rigaIncasso(i: Riepilogo['incassi'][number]): string {
  const dettagli = [
    `rata ${i.numero_rata} di ${i.numero_rate}`,
    PARTE[i.parte] ?? null,
    i.metodo ? (METODO[i.metodo] ?? i.metodo) : null,
  ].filter(Boolean)
  const cosa = i.rimborso ? 'Rimborso' : 'Incasso'
  return `${giornoRiga(i.giorno)} · ${cosa}: ${i.cliente}, ${formatEuro(i.importo)} (${dettagli.join(', ')})`
}

/** "mer 07/10 · Vendita: Elia Martini, nuovo cliente, 1.500,00 €" */
function rigaVendita(v: Riepilogo['vendite'][number]): string {
  return `${giornoRiga(v.giorno)} · Vendita: ${v.cliente}, ${TIPO[v.tipo] ?? v.tipo}, ${formatEuro(v.valore)}`
}

/** One line of the details; the "and N more" one links to its page. */
type Riga = { testo: string; url?: string }

/** The first `massimo` lines, then "e altri 3: li trovi in Incassi". */
function taglia<T>(
  elenco: T[],
  massimo: number,
  riga: (x: T) => string,
  resto: (n: number) => string,
  url: string,
): Riga[] {
  const righe: Riga[] = elenco.slice(0, massimo).map((x) => ({ testo: riga(x) }))
  const altri = elenco.length - massimo
  return altri > 0 ? [...righe, { testo: resto(altri), url }] : righe
}

const altriIncassi = (n: number) => (n === 1 ? 'e un altro: lo trovi in Incassi' : `e altri ${n}: li trovi in Incassi`)
const altreVendite = (n: number) => (n === 1 ? 'e un’altra: la trovi in Vendite' : `e altre ${n}: le trovi in Vendite`)
const altriClienti = (n: number) => (n === 1 ? 'e un altro: lo trovi in Incassi' : `e altri ${n}: li trovi in Incassi`)

/** "In ritardo: Mario Rossi, …" (late the longest first), then "e altri 3: li trovi in Incassi". */
function clientiInRitardo(r: Riepilogo, base: string): Riga[] {
  if (r.clienti_in_ritardo.length === 0) return []
  const righe: Riga[] = [{ testo: `In ritardo: ${r.clienti_in_ritardo.join(', ')}` }]
  const altri = Number(r.clienti_in_ritardo_totale ?? 0) - r.clienti_in_ritardo.length
  return altri > 0 ? [...righe, { testo: altriClienti(altri), url: `${base}/payments?vista=ritardo` }] : righe
}

function escape(testo: string) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The admins' Friday email. Team totals and clients: nobody is named for what they filled in or not. */
export function emailRiepilogo(r: Riepilogo, urlApp: string): { oggetto: string; html: string; testo: string } {
  const base = urlApp.replace(/\/$/, '')
  const intestazione = `La settimana ${periodo(r)}`
  const oggetto = `Alpha Management · settimana dal ${giornoMese(r.da)} al ${giornoMese(r.a)}: ${formatEuro(r.cash)} incassati`
  const cuiParti = diCui(r)
  const righe: [string, string][] = [
    ['Vendite firmate', venditeDellaSettimana(r)],
    ['Rate in ritardo oggi', `${r.in_ritardo.numero} · ${formatEuro(r.in_ritardo.totale)}`],
    ['In scadenza nei prossimi 7 giorni', `${r.in_scadenza_7_giorni.numero} · ${formatEuro(r.in_scadenza_7_giorni.totale)}`],
    ['DM del team', String(r.dm_totali)],
    ['Conversazioni', String(r.conversazioni)],
    ['Call prenotate', String(r.call_prenotate)],
    ['Call svolte', String(r.call_svolte)],
    ['No show', String(r.no_show)],
    ['Chiuse', String(r.chiuse)],
  ]
  const gruppi: { titolo: string; righe: Riga[] }[] = [
    {
      titolo: 'Incassi della settimana',
      righe: taglia(r.incassi, MASSIMO_INCASSI, rigaIncasso, altriIncassi, `${base}/payments`),
    },
    {
      titolo: 'Vendite della settimana',
      righe: taglia(r.vendite, MASSIMO_VENDITE, rigaVendita, altreVendite, `${base}/sales`),
    },
    {
      titolo: 'Clienti con rate in ritardo',
      righe: clientiInRitardo(r, base),
    },
  ].filter((g) => g.righe.length > 0)

  const testo = [
    intestazione,
    '',
    `Cash incassato nella settimana: ${formatEuro(r.cash)}`,
    ...(cuiParti ? [`Di cui: ${cuiParti}`] : []),
    ...righe.map(([k, v]) => `${k}: ${v}`),
    ...gruppi.flatMap((g) => ['', g.titolo, ...g.righe.map((x) => (x.url ? `${x.testo} (${x.url})` : x.testo))]),
    '',
    `Apri la dashboard: ${base}`,
  ].join('\n')

  const html = `<!doctype html>
<html lang="it"><body style="margin:0;padding:24px;background:${SFONDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TESTO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 4px;font-size:13px;color:${TENUE};">${escape(intestazione)}</p>
      <p style="margin:0 0 ${cuiParti ? '4px' : '16px'};font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;">${escape(formatEuro(r.cash))} <span style="font-size:14px;font-weight:400;color:${TENUE};">incassati nella settimana</span></p>
      ${cuiParti ? `<p style="margin:0 0 16px;font-size:13px;color:${TENUE};">Di cui: ${escape(cuiParti)}</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${righe
          .map(
            ([k, v]) =>
              `<tr><td style="padding:5px 0;color:${TENUE};">${escape(k)}</td><td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">${escape(v)}</td></tr>`,
          )
          .join('')}
      </table>
      ${gruppi
        .map(
          (g) =>
            `<p style="margin:20px 0 4px;font-size:13px;font-weight:600;color:${TENUE};">${escape(g.titolo)}</p>` +
            `<ul style="margin:0;padding-left:18px;font-size:13px;color:${TESTO};">${g.righe
              .map((x) =>
                x.url
                  ? `<li style="margin:2px 0;"><a href="${escape(x.url)}" style="color:${BORDEAUX};">${escape(x.testo)}</a></li>`
                  : `<li style="margin:2px 0;">${escape(x.testo)}</li>`,
              )
              .join('')}</ul>`,
        )
        .join('')}
      <p style="margin:20px 0 0;"><a href="${escape(base)}" style="color:${BORDEAUX};font-size:14px;font-weight:600;">Apri Alpha Management</a></p>
    </td></tr>
  </table>
</body></html>`
  return { oggetto, html, testo }
}
