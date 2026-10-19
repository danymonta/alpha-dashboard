import { LIMITI_NOTIFICA } from '@/lib/notifiche/tipi'

/**
 * The words of the notifications that are not an email's own body, and the
 * short line of the list. Pure (tests/notifiche-registra.test.ts).
 */

export function escapaHtml(testo: string) {
  return testo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** One short plain-text line from an email's text: the first lines, spaces collapsed, cut with an ellipsis. */
export function anteprimaDaTesto(testo: string, massimo = 160): string {
  const righe = testo
    .split('\n')
    .map((riga) => riga.replace(/\s+/g, ' ').trim())
    // links and bare URLs say nothing in a preview
    .filter((riga) => riga && !/^https?:\/\//i.test(riga) && !/https?:\/\/\S+\s*$/i.test(riga))
  const riga = righe.slice(0, 2).join(' · ')
  if (riga.length <= massimo) return riga
  return `${riga.slice(0, massimo - 1).trimEnd()}…`
}

/** A plain body for when the email's own HTML is too big for the table: the title and the line, nothing else. */
export function corpoDiRiserva(titolo: string, anteprima: string) {
  return `<!doctype html><html lang="it"><body style="margin:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1C1E;"><p style="margin:0 0 8px;font-size:18px;font-weight:600;">${escapaHtml(titolo)}</p><p style="margin:0;font-size:14px;color:#6B6B70;">${escapaHtml(anteprima)}</p></body></html>`
}

/**
 * The backup's own notification: no attachment, no data, no counts: it says
 * the backup went by email (or did not) and where it can be downloaded
 * (Impostazioni › Esporta). The email is the backup, never this.
 */
export function notificaBackup({ giorno, inviata }: { giorno: string; inviata: boolean }) {
  const titolo = inviata
    ? `Backup settimanale Alpha Management · ${giorno}`
    : `Backup settimanale non inviato · ${giorno}`
  const anteprima = inviata
    ? 'Il backup completo è partito per email: tieni l’email, serve per ripristinare il database.'
    : 'Il backup non è partito per email. Lo scarichi da Impostazioni › Esporta.'
  const righe = inviata
    ? [
        `Il backup completo del database del ${giorno} è stato mandato per email agli admin.`,
        'Tieni l’email: l’allegato è la copia di questa settimana e serve per ripristinare i dati.',
        'Qui non c’è nessun allegato né nessun dato: il file sta solo nell’email. Lo stesso file si scarica da Impostazioni › Esporta.',
      ]
    : [
        `Il backup settimanale del ${giorno} non è partito per email.`,
        'Succede quando l’email non è configurata o il servizio non ha risposto. Non si è perso niente: puoi scaricare il backup da Impostazioni › Esporta.',
      ]
  const html = `<!doctype html><html lang="it"><body style="margin:0;padding:24px;background:#F4F2EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1C1E;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;"><tr><td style="padding:24px;"><p style="margin:0 0 12px;font-size:18px;font-weight:600;">${escapaHtml(titolo)}</p>${righe
    .map((r) => `<p style="margin:0 0 10px;font-size:14px;color:#1C1C1E;">${escapaHtml(r)}</p>`)
    .join('')}</td></tr></table></body></html>`
  return { titolo: titolo.slice(0, LIMITI_NOTIFICA.titolo), anteprima, html, link: '/settings/export' }
}
