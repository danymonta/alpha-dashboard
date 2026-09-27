import { formatData } from '@/lib/format'
import type { Backup } from '@/lib/backup/formato'
import { conteggi } from '@/lib/backup/formato'

const TESTO = '#1C1C1E'
const TENUE = '#6B6B70'
const SFONDO = '#F4F2EE'

const NOMI: Record<string, string> = {
  clients: 'Clienti',
  sales: 'Vendite',
  payments: 'Rate e incassi',
  expenses: 'Costi',
  setter_daily_reports: 'Report giornalieri',
  leads: 'Lead',
  calls: 'Call',
  commission_payouts: 'Provvigioni pagate',
  pm_progetti: 'Progetti',
  pm_task: 'Task',
  pm_tempo: 'Voci di tempo',
}

/** The weekly backup email: what is inside, and how to put it back. */
export function emailBackup(backup: Backup, nomeFile: string): { oggetto: string; html: string; testo: string } {
  const giorno = formatData(backup.creato_il.slice(0, 10))
  const oggetto = `Backup settimanale Alpha Economics · ${giorno}`
  const principali = conteggi(backup).filter((c) => NOMI[c.tabella])
  const righe = principali.map((c) => `${NOMI[c.tabella]}: ${c.righe}`)
  const istruzioni = [
    'Tieni questa email: l’allegato è la copia completa del database di questa settimana.',
    `Per ripristinare: npm run backup:sql -- ${nomeFile} ripristino.sql, poi esegui ripristino.sql nel SQL Editor di Supabase.`,
    'Il ripristino rimette solo le righe mancanti, quelle presenti restano come sono.',
  ]

  const testo = [`Backup del ${giorno}`, '', ...righe, '', ...istruzioni].join('\n')
  const html = `<!doctype html>
<html lang="it"><body style="margin:0;padding:24px;background:${SFONDO};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TESTO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;">
    <tr><td style="padding:24px;">
      <p style="margin:0 0 4px;font-size:18px;font-weight:600;">Backup del ${giorno}</p>
      <p style="margin:0 0 16px;font-size:14px;color:${TENUE};">Copia completa del database in allegato (${nomeFile}).</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
        ${principali
          .map(
            (c) =>
              `<tr><td style="padding:4px 0;color:${TENUE};">${NOMI[c.tabella]}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums;">${c.righe}</td></tr>`,
          )
          .join('')}
      </table>
      ${istruzioni.map((i) => `<p style="margin:16px 0 0;font-size:13px;color:${TENUE};">${i}</p>`).join('')}
    </td></tr>
  </table>
</body></html>`
  return { oggetto, html, testo }
}
