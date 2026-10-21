import { formatData } from '@/lib/format'
import { formatDurata } from '@/lib/tempo'

/**
 * What public.riepilogo_tempo_team returns: the time logged in a period, per
 * person, project and task, summed in SQL. Only time already declared, only
 * the people who logged something, people in alphabetical order.
 */
export type RiepilogoTempoTeam = {
  da: string
  a: string
  minuti: number
  voci: number
  persone: {
    nome: string
    minuti: number
    voci: number
    /** By time, the first 10; the others are counted in altri_progetti. */
    progetti: {
      nome: string
      minuti: number
      voci: number
      /** By time, the first 5 real tasks. */
      task: { titolo: string; minuti: number }[]
      /** Time without a task (or on a task deleted since), never counted as a task. */
      senza_task_minuti: number
      altri_task: number
      altri_task_minuti: number
    }[]
    altri_progetti: number
    altri_progetti_minuti: number
  }[]
}

const TESTO = '#1C1C1E'
const TENUE = '#6B6B70'
const SFONDO = '#F4F2EE'
const BORDO = '#E6E3DD'
const SENZA_TASK = 'Senza task'
const NOTA_PRIVACY =
  'Solo il tempo già registrato: i timer ancora accesi non compaiono. Compare solo chi ha registrato tempo nel periodo, in ordine alfabetico.'

function escape(testo: string) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** "dal 22/09 al 28/09/2026"; the first year too when the week spans two. */
export function periodoEmail(da: string, a: string): string {
  const inizio = da.slice(0, 4) === a.slice(0, 4) ? formatData(da).slice(0, 5) : formatData(da)
  return `dal ${inizio} al ${formatData(a)}`
}

/** "Altri 2 task", "Altro 1 progetto": what is left past the ones listed. */
function altri(numero: number, singolare: string, plurale: string): string {
  return `${numero === 1 ? 'Altro' : 'Altri'} ${numero} ${numero === 1 ? singolare : plurale}`
}

function voci(numero: number): string {
  return `${numero} ${numero === 1 ? 'voce' : 'voci'}`
}

function persone(numero: number): string {
  return `${numero} ${numero === 1 ? 'persona' : 'persone'}`
}

/** Tempo › Team on the same period. */
export function linkTempoTeam(urlApp: string, da: string, a: string): string {
  const url = new URL('/tempo/team', urlApp)
  url.searchParams.set('da', da)
  url.searchParams.set('a', a)
  return url.toString()
}

/**
 * The admins' Monday email: how much time each person logged in the week,
 * and on what. Never a running timer, nobody listed for not logging, people
 * alphabetical and never ranked (CLAUDE.md sections 17 and 18).
 */
export function emailTempoTeam(r: RiepilogoTempoTeam, urlApp: string): { oggetto: string; html: string; testo: string } {
  const periodo = periodoEmail(r.da, r.a)
  const vuoto = r.persone.length === 0
  const totale = formatDurata(r.minuti)
  const oggetto = vuoto
    ? `Alpha Management · Tempo del team ${periodo}: nessun tempo registrato`
    : `Alpha Management · Tempo del team ${periodo}: ${totale}`
  const link = linkTempoTeam(urlApp, r.da, r.a)
  const intestazione = `Tempo del team ${periodo}`

  const testo = [
    intestazione,
    '',
    ...(vuoto
      ? ['Nessun tempo registrato nel periodo.']
      : [
          `Totale del team: ${totale} (${persone(r.persone.length)}, ${voci(r.voci)})`,
          ...r.persone.flatMap((p) => [
            '',
            `${p.nome}: ${formatDurata(p.minuti)}`,
            ...p.progetti.flatMap((pr) => [
              `  ${pr.nome}: ${formatDurata(pr.minuti)}`,
              ...pr.task.map((t) => `    ${t.titolo}: ${formatDurata(t.minuti)}`),
              ...(pr.senza_task_minuti > 0 ? [`    ${SENZA_TASK}: ${formatDurata(pr.senza_task_minuti)}`] : []),
              ...(pr.altri_task > 0 ? [`    ${altri(pr.altri_task, 'task', 'task')}: ${formatDurata(pr.altri_task_minuti)}`] : []),
            ]),
            ...(p.altri_progetti > 0
              ? [`  ${altri(p.altri_progetti, 'progetto', 'progetti')}: ${formatDurata(p.altri_progetti_minuti)}`]
              : []),
          ]),
        ]),
    '',
    NOTA_PRIVACY,
    '',
    `Apri Tempo › Team: ${link}`,
  ].join('\n')

  // a task sits under its project: the indent is on the cell, so a long title keeps it when it wraps
  const riga = (sinistra: string, destra: string, stile: string, rientro = false) =>
    `<tr><td style="padding:3px 12px 3px ${rientro ? 12 : 0}px;${stile}">${sinistra}</td><td style="padding:3px 0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:top;${stile}">${destra}</td></tr>`

  const blocchiPersone = r.persone
    .map((p) => {
      const righe = [
        riga(
          escape(p.nome),
          escape(formatDurata(p.minuti)),
          `font-size:16px;font-weight:700;color:${TESTO};padding-top:0;`,
        ),
        ...p.progetti.flatMap((pr) => [
          riga(escape(pr.nome), escape(formatDurata(pr.minuti)), `font-size:14px;font-weight:600;color:${TESTO};padding-top:8px;`),
          ...pr.task.map((t) =>
            riga(escape(t.titolo), escape(formatDurata(t.minuti)), `font-size:13px;color:${TENUE};`, true),
          ),
          ...(pr.senza_task_minuti > 0
            ? [riga(SENZA_TASK, escape(formatDurata(pr.senza_task_minuti)), `font-size:13px;color:${TENUE};`, true)]
            : []),
          ...(pr.altri_task > 0
            ? [
                riga(
                  escape(altri(pr.altri_task, 'task', 'task')),
                  escape(formatDurata(pr.altri_task_minuti)),
                  `font-size:13px;color:${TENUE};font-style:italic;`,
                  true,
                ),
              ]
            : []),
        ]),
        ...(p.altri_progetti > 0
          ? [
              riga(
                escape(altri(p.altri_progetti, 'progetto', 'progetti')),
                escape(formatDurata(p.altri_progetti_minuti)),
                `font-size:14px;color:${TENUE};font-style:italic;padding-top:8px;`,
              ),
            ]
          : []),
      ]
      return `<tr><td style="padding:16px 0;border-top:1px solid ${BORDO};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${righe.join('')}</table>
      </td></tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="it"><body style="margin:0;padding:24px;background:${SFONDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TESTO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 4px;font-size:13px;color:${TENUE};">${escape(intestazione)}</p>
      ${
        vuoto
          ? `<p style="margin:0 0 16px;font-size:18px;font-weight:600;">Nessun tempo registrato nel periodo.</p>`
          : `<p style="margin:0 0 4px;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;">${escape(totale)} <span style="font-size:14px;font-weight:400;color:${TENUE};">in totale</span></p>
      <p style="margin:0 0 8px;font-size:13px;color:${TENUE};">${escape(persone(r.persone.length))} · ${escape(voci(r.voci))}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${blocchiPersone}</table>`
      }
      <p style="margin:12px 0 0;font-size:12px;color:${TENUE};">${escape(NOTA_PRIVACY)}</p>
      <p style="margin:20px 0 0;"><a href="${escape(link)}" style="color:#7A1F2B;font-size:14px;font-weight:600;">Apri Tempo › Team</a></p>
    </td></tr>
  </table>
</body></html>`
  return { oggetto, html, testo }
}
