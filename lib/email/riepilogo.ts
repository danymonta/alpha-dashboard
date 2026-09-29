import { formatData, formatEuro } from '@/lib/format'

type TipoVendita = 'nuovo' | 'rinnovo' | 'upsell'

/**
 * Which of the four parts of the cash a payment is (20260929160000): a client
 * who entered that day, an instalment of a client already in, a renewal, an upsell.
 */
type ParteCash = 'nuovi_clienti' | 'rate_precedenti' | 'rinnovo' | 'upsell'

/** What public.riepilogo_serale returns: business numbers of the day, team totals only. */
export type Riepilogo = {
  giorno: string
  cash: number
  incassi: {
    cliente: string
    importo: number
    metodo: string | null
    /** before 20260929160000 the payload had no such fields: the line then just omits them */
    rimborso?: boolean
    tipo?: TipoVendita
    numero_rata?: number
    numero_rate?: number
    parte?: ParteCash
  }[]
  vendite: { cliente: string; tipo: TipoVendita; valore: number }[]
  /** the day's sales counted by type, in SQL */
  vendite_per_tipo?: Record<TipoVendita, number>
  in_ritardo: { numero: number; totale: number }
  clienti_in_ritardo: string[]
  in_scadenza_7_giorni: { numero: number; totale: number }
  dm_totali: number
  call_svolte: number
  chiuse: number
}

const TESTO = '#1C1C1E'
const TENUE = '#6B6B70'
const SFONDO = '#F4F2EE'
const TIPO: Record<string, string> = { nuovo: 'nuovo cliente', rinnovo: 'rinnovo', upsell: 'upsell' }
const PARTE: Record<ParteCash, string> = {
  nuovi_clienti: 'nuovo cliente',
  rate_precedenti: 'cliente già entrato',
  rinnovo: 'rinnovo',
  upsell: 'upsell',
}
// "2 nuovi clienti, 1 rinnovo": singular and plural of each type
const QUANTE: Record<TipoVendita, [string, string]> = {
  nuovo: ['nuovo cliente', 'nuovi clienti'],
  rinnovo: ['rinnovo', 'rinnovi'],
  upsell: ['upsell', 'upsell'],
}

/** "3 (2 nuovi clienti, 1 rinnovo)": the day's sales, split by type when SQL says it. */
function venditeDelGiorno(r: Riepilogo): string {
  const perTipo = r.vendite_per_tipo
  if (!perTipo || r.vendite.length === 0) return String(r.vendite.length)
  const parti = (Object.keys(QUANTE) as TipoVendita[])
    .filter((t) => perTipo[t] > 0)
    .map((t) => `${perTipo[t]} ${QUANTE[t][perTipo[t] === 1 ? 0 : 1]}`)
  return `${r.vendite.length} (${parti.join(', ')})`
}

/** "Incasso: Mario Rossi, 500,00 € (rata 3 di 3, cliente già entrato, bonifico)" */
function rigaIncasso(i: Riepilogo['incassi'][number]): string {
  const dettagli = [
    i.numero_rata ? `rata ${i.numero_rata}${i.numero_rate ? ` di ${i.numero_rate}` : ''}` : null,
    i.parte ? PARTE[i.parte] : null,
    i.metodo,
  ].filter(Boolean)
  const cosa = i.rimborso ? 'Rimborso' : 'Incasso'
  return `${cosa}: ${i.cliente}, ${formatEuro(i.importo)}${dettagli.length ? ` (${dettagli.join(', ')})` : ''}`
}

function escape(testo: string) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The admins' evening email. No person is listed for what they filled in or not. */
export function emailRiepilogo(r: Riepilogo, urlApp: string): { oggetto: string; html: string; testo: string } {
  const giorno = formatData(r.giorno)
  const oggetto = `Alpha Management · ${giorno}: ${formatEuro(r.cash)} incassati`
  const righe: [string, string][] = [
    ['Cash incassato oggi', formatEuro(r.cash)],
    ['Vendite firmate oggi', venditeDelGiorno(r)],
    ['Rate in ritardo', `${r.in_ritardo.numero} · ${formatEuro(r.in_ritardo.totale)}`],
    ['In scadenza nei prossimi 7 giorni', `${r.in_scadenza_7_giorni.numero} · ${formatEuro(r.in_scadenza_7_giorni.totale)}`],
    ['DM del team', String(r.dm_totali)],
    ['Call svolte', String(r.call_svolte)],
    ['Chiuse', String(r.chiuse)],
  ]
  const dettagli = [
    ...r.incassi.map(rigaIncasso),
    ...r.vendite.map((v) => `Vendita: ${v.cliente}, ${TIPO[v.tipo] ?? v.tipo}, ${formatEuro(v.valore)}`),
    ...(r.clienti_in_ritardo.length ? [`In ritardo: ${r.clienti_in_ritardo.join(', ')}`] : []),
  ]

  const testo = [
    `La giornata del ${giorno}`,
    '',
    ...righe.map(([k, v]) => `${k}: ${v}`),
    ...(dettagli.length ? ['', ...dettagli] : []),
    '',
    `Apri la dashboard: ${urlApp}`,
  ].join('\n')

  const html = `<!doctype html>
<html lang="it"><body style="margin:0;padding:24px;background:${SFONDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TESTO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 4px;font-size:13px;color:${TENUE};">La giornata del ${giorno}</p>
      <p style="margin:0 0 16px;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;">${formatEuro(r.cash)} <span style="font-size:14px;font-weight:400;color:${TENUE};">incassati oggi</span></p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${righe
          .slice(1)
          .map(
            ([k, v]) =>
              `<tr><td style="padding:5px 0;color:${TENUE};">${escape(k)}</td><td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;">${escape(v)}</td></tr>`,
          )
          .join('')}
      </table>
      ${
        dettagli.length
          ? `<ul style="margin:16px 0 0;padding-left:18px;font-size:13px;color:${TESTO};">${dettagli.map((d) => `<li style="margin:2px 0;">${escape(d)}</li>`).join('')}</ul>`
          : ''
      }
      <p style="margin:20px 0 0;"><a href="${escape(urlApp)}" style="color:#7A1F2B;font-size:14px;font-weight:600;">Apri Alpha Management</a></p>
    </td></tr>
  </table>
</body></html>`
  return { oggetto, html, testo }
}
