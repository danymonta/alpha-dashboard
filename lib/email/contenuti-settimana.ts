import { CATEGORIE_OBIEZIONI } from '@/lib/call/analisi/icp-call'
import { BREVE_FASCIA } from '@/lib/marketing/analisi/cosa-fare'
import { parseDataISO } from '@/lib/format'
import { periodoEmail } from '@/lib/email/tempo-team'
import { lunediDi } from '@/lib/tempo'

/**
 * What public.riepilogo_contenuti_settimana returns (Dany, 22/10/2026): the week
 * of the contents in a few numbers. Counted in SQL from what the app already
 * stored, nothing asks Claude; no names of people, only counts and the names of
 * the contents.
 */
export type RiepilogoContenutiSettimana = {
  da: string
  a: string
  lead: {
    totale: number
    in_target: number
    fuori_target: number
    da_verificare: number
    da_un_contenuto: number
    da_storie: number
  }
  nuovi_clienti: number
  rinnovi: number
  call: { fissate: number; svolte: number; no_show: number; chiuse: number; da_registrare: number }
  contenuti: {
    pubblicati: number
    reel_non_valutati: number
    migliori: {
      permalink: string | null
      titolo: string
      giorno: string | null
      tipo: string
      views: number | null
      lead: number
      in_target: number
      fuori_target: number
      punteggio: number | null
      fascia: string | null
    }[]
    da_cambiare: {
      permalink: string | null
      titolo: string
      giorno: string | null
      views: number | null
      punteggio: number | null
      fascia: string | null
      verdetto: string | null
      problema: string | null
    }[]
  }
  fathom: {
    svolte: number
    registrate: number
    analizzate: number
    in_target: number
    fuori_target: number
    obiezioni: { categoria: string; n: number }[]
  }
}

const TESTO = '#1C1C1E'
const TENUE = '#6B6B70'
const SFONDO = '#F4F2EE'
const BORDO = '#E6E3DD'
const BORDEAUX = '#7A1F2B'
const VERDE = '#2F7D55'
const NOTA =
  'Numeri dalle chat lette dall’Insight, dalle call e dalle vendite dell’app e dalle analisi già fatte. Questa mail non chiede nessuna analisi nuova a Claude.'

function escape(testo: string) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const numero = new Intl.NumberFormat('it-IT')
const n = (valore: number | null | undefined) => (valore === null || valore === undefined ? '-' : numero.format(valore))

/** "lead" does not change in the plural */
function lead(numeroLead: number) {
  return `${numeroLead} lead`
}

function etichettaFascia(codice: string | null): string | null {
  if (!codice) return null
  return (BREVE_FASCIA as Record<string, string>)[codice] ?? null
}

function etichettaObiezione(categoria: string): string {
  return (CATEGORIE_OBIEZIONI as Record<string, string>)[categoria] ?? categoria
}

/** The week of the email, sent on Sunday evening (Rome): Monday to today. Null on any other day. */
export function settimanaDeiContenuti(oggi: string): { da: string; a: string } | null {
  if (parseDataISO(oggi).getDay() !== 0) return null
  return { da: lunediDi(oggi), a: oggi }
}

/** The page of the published contents. */
export function linkPubblicati(urlApp: string): string {
  return new URL('/marketing/pubblicati', urlApp).toString()
}

/** The titles of the headline, the lines of the sections: one place so the text and the HTML say the same. */
function frasi(r: RiepilogoContenutiSettimana) {
  const l = r.lead
  const titolo =
    l.totale === 0
      ? 'Questa settimana nessun lead nuovo dai DM.'
      : `Questa settimana hai attratto ${lead(l.totale)}: ${l.in_target} in target e ${l.fuori_target} fuori target${
          l.da_verificare > 0 ? `, ${l.da_verificare} da verificare` : ''
        }.`
  const origine =
    l.totale === 0
      ? null
      : l.da_un_contenuto === l.totale
        ? 'Tutti arrivano da un tuo contenuto.'
        : `${l.da_un_contenuto} su ${l.totale} arrivano da un tuo contenuto${
            l.da_storie > 0 ? `, ${l.da_storie} da una risposta a una storia` : ''
          }.`

  const migliori = r.contenuti.migliori.map((m) => ({
    titolo: `${m.tipo} · ${m.titolo}`,
    permalink: m.permalink,
    dettaglio: `${m.in_target} in target su ${lead(m.lead)}${m.views !== null ? ` · ${n(m.views)} views` : ''}`,
  }))

  const daCambiare = r.contenuti.da_cambiare.map((d) => {
    const fascia = etichettaFascia(d.fascia)
    const sintesi =
      d.punteggio !== null && fascia
        ? `${d.punteggio}/100 · ${fascia}`
        : d.verdetto === 'cambiare'
          ? 'I numeri sono sotto la mediana dei tuoi reel'
          : 'Da rivedere'
    return {
      titolo: `Reel · ${d.titolo}`,
      permalink: d.permalink,
      sintesi: d.views !== null ? `${sintesi} · ${n(d.views)} views` : sintesi,
      problema: d.problema ? `Da sistemare per primo: ${d.problema}` : null,
    }
  })
  const nessunoDaCambiare =
    r.contenuti.pubblicati === 0
      ? 'Questa settimana non hai pubblicato niente.'
      : r.contenuti.reel_non_valutati > 0
        ? `${r.contenuti.reel_non_valutati} ${r.contenuti.reel_non_valutati === 1 ? 'reel non è' : 'reel non sono'} ancora ${
            r.contenuti.reel_non_valutati === 1 ? 'valutato' : 'valutati'
          }: apri Pubblicati e tocca Analizza su quelli da controllare.`
        : 'Nessun reel della settimana da rifare.'

  const f = r.fathom
  const fathom: string[] =
    f.svolte === 0
      ? ['Nessuna call svolta questa settimana.']
      : [
          `Call svolte: ${f.svolte} · registrate su Fathom: ${f.registrate} · analizzate da Claude: ${f.analizzate}`,
          ...(f.analizzate > 0 ? [`In target secondo Claude: ${f.in_target} · fuori target: ${f.fuori_target}`] : []),
          ...(f.obiezioni.length > 0
            ? [`Obiezioni più frequenti: ${f.obiezioni.map((o) => `${etichettaObiezione(o.categoria)} (${o.n})`).join(', ')}`]
            : []),
        ]
  const daRegistrare = r.call.da_registrare > 0 ? `${r.call.da_registrare} call svolte aspettano ancora l’esito.` : null

  return { titolo, origine, migliori, daCambiare, nessunoDaCambiare, fathom, daRegistrare }
}

/**
 * The admins' weekend email: how the contents did, in a few numbers. The leads
 * in and out of target, new clients, new calls, what attracted and what to
 * change, and what the calls recorded on Fathom say. Never a person's name or
 * a ranking of people (CLAUDE.md section 17).
 */
export function emailContenutiSettimana(
  r: RiepilogoContenutiSettimana,
  urlApp: string,
): { oggetto: string; html: string; testo: string } {
  const periodo = periodoEmail(r.da, r.a)
  const f = frasi(r)
  const oggetto = `Alpha Management · Contenuti ${periodo}: ${
    r.lead.totale === 0 ? 'nessun lead nuovo' : `${r.lead.in_target} lead in target su ${r.lead.totale}`
  }`
  const link = linkPubblicati(urlApp)
  const tessere: [string, string][] = [
    ['Nuovi clienti', String(r.nuovi_clienti)],
    ['Call fissate', String(r.call.fissate)],
    ['Call svolte', `${r.call.svolte}${r.call.chiuse > 0 ? ` (${r.call.chiuse} chiuse)` : ''}`],
  ]

  const testo = [
    `Andamento dei contenuti ${periodo}`,
    '',
    f.titolo,
    ...(f.origine ? [f.origine] : []),
    '',
    ...tessere.map(([nome, valore]) => `${nome}: ${valore}`),
    ...(r.rinnovi > 0 ? [`Rinnovi: ${r.rinnovi}`] : []),
    ...(f.daRegistrare ? ['', f.daRegistrare] : []),
    '',
    'Cosa ha attirato di più',
    ...(f.migliori.length > 0
      ? f.migliori.map((m) => `- ${m.titolo}: ${m.dettaglio}`)
      : ['- Nessun lead è stato collegato a un contenuto questa settimana.']),
    '',
    'Cosa cambiare',
    ...(f.daCambiare.length > 0
      ? f.daCambiare.flatMap((d) => [`- ${d.titolo}: ${d.sintesi}`, ...(d.problema ? [`  ${d.problema}`] : [])])
      : [`- ${f.nessunoDaCambiare}`]),
    ...(f.daCambiare.length > 0 && r.contenuti.reel_non_valutati > 0
      ? [`- ${r.contenuti.reel_non_valutati} reel della settimana non sono ancora valutati.`]
      : []),
    '',
    'Dalle call (Fathom)',
    ...f.fathom.map((riga) => `- ${riga}`),
    '',
    NOTA,
    '',
    `Apri Pubblicati: ${link}`,
  ].join('\n')

  const titoloSezione = (testoSezione: string) =>
    `<p style="margin:24px 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${TENUE};">${escape(testoSezione)}</p>`
  const nome = (titolo: string, permalink: string | null) =>
    permalink
      ? `<a href="${escape(permalink)}" style="color:${TESTO};font-weight:600;text-decoration:none;">${escape(titolo)}</a>`
      : `<span style="font-weight:600;">${escape(titolo)}</span>`
  const riga = (contenuto: string) =>
    `<tr><td style="padding:10px 0;border-top:1px solid ${BORDO};font-size:14px;line-height:1.45;">${contenuto}</td></tr>`
  const tabella = (righe: string[]) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${righe.join('')}</table>`

  const tessereHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin:16px -4px 0;">
    <tr>${tessere
      .map(
        ([etichetta, valore]) => `<td style="background:${SFONDO};border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;">${escape(valore)}</div>
        <div style="font-size:12px;color:${TENUE};margin-top:2px;">${escape(etichetta)}</div></td>`,
      )
      .join('')}</tr></table>`

  const html = `<!doctype html>
<html lang="it"><body style="margin:0;padding:24px;background:${SFONDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TESTO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 6px;font-size:13px;color:${TENUE};">${escape(`Andamento dei contenuti ${periodo}`)}</p>
      <p style="margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:700;">${escape(f.titolo)}</p>
      ${f.origine ? `<p style="margin:0;font-size:13px;color:${TENUE};">${escape(f.origine)}</p>` : ''}
      ${tessereHtml}
      ${r.rinnovi > 0 ? `<p style="margin:12px 0 0;font-size:13px;color:${TENUE};">${escape(`Rinnovi: ${r.rinnovi}`)}</p>` : ''}
      ${f.daRegistrare ? `<p style="margin:12px 0 0;font-size:13px;font-weight:600;color:${BORDEAUX};">${escape(f.daRegistrare)}</p>` : ''}

      ${titoloSezione('Cosa ha attirato di più')}
      ${tabella(
        f.migliori.length > 0
          ? f.migliori.map((m) =>
              riga(
                `${nome(m.titolo, m.permalink)}<br><span style="color:${VERDE};font-weight:600;">${escape(m.dettaglio)}</span>`,
              ),
            )
          : [riga(escape('Nessun lead è stato collegato a un contenuto questa settimana.'))],
      )}

      ${titoloSezione('Cosa cambiare')}
      ${tabella(
        f.daCambiare.length > 0
          ? f.daCambiare.map((d) =>
              riga(
                `${nome(d.titolo, d.permalink)}<br><span style="color:${BORDEAUX};font-weight:600;">${escape(d.sintesi)}</span>${
                  d.problema ? `<br><span style="color:${TENUE};">${escape(d.problema)}</span>` : ''
                }`,
              ),
            )
          : [riga(escape(f.nessunoDaCambiare))],
      )}
      ${
        f.daCambiare.length > 0 && r.contenuti.reel_non_valutati > 0
          ? `<p style="margin:8px 0 0;font-size:12px;color:${TENUE};">${escape(
              `${r.contenuti.reel_non_valutati} reel della settimana non sono ancora valutati.`,
            )}</p>`
          : ''
      }

      ${titoloSezione('Dalle call (Fathom)')}
      ${tabella(f.fathom.map((riga_) => riga(escape(riga_))))}

      <p style="margin:20px 0 0;font-size:12px;color:${TENUE};">${escape(NOTA)}</p>
      <p style="margin:16px 0 0;"><a href="${escape(link)}" style="color:${BORDEAUX};font-size:14px;font-weight:600;">Apri Pubblicati</a></p>
    </td></tr>
  </table>
</body></html>`

  return { oggetto, html, testo }
}
