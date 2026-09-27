import { formatData, formatEuro } from '@/lib/format'

/** What public.riepilogo_serale returns: business numbers of the day, team totals only. */
export type Riepilogo = {
  giorno: string
  cash: number
  incassi: { cliente: string; importo: number; metodo: string | null }[]
  vendite: { cliente: string; tipo: 'nuovo' | 'rinnovo' | 'upsell'; valore: number }[]
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

function escape(testo: string) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The admins' evening email. No person is listed for what they filled in or not. */
export function emailRiepilogo(r: Riepilogo, urlApp: string): { oggetto: string; html: string; testo: string } {
  const giorno = formatData(r.giorno)
  const oggetto = `Alpha Management · ${giorno}: ${formatEuro(r.cash)} incassati`
  const righe: [string, string][] = [
    ['Cash incassato oggi', formatEuro(r.cash)],
    ['Vendite firmate oggi', String(r.vendite.length)],
    ['Rate in ritardo', `${r.in_ritardo.numero} · ${formatEuro(r.in_ritardo.totale)}`],
    ['In scadenza nei prossimi 7 giorni', `${r.in_scadenza_7_giorni.numero} · ${formatEuro(r.in_scadenza_7_giorni.totale)}`],
    ['DM del team', String(r.dm_totali)],
    ['Call svolte', String(r.call_svolte)],
    ['Chiuse', String(r.chiuse)],
  ]
  const dettagli = [
    ...r.incassi.map((i) => `Incasso: ${i.cliente}, ${formatEuro(i.importo)}${i.metodo ? ` (${i.metodo})` : ''}`),
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
