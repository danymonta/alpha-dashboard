/**
 * The email of a notification as it is shown in the app: the HTML our own code
 * generated, inside a sandboxed iframe (srcdoc), with a policy of its own so
 * that nothing is loaded beyond what the email already uses (our logo, from
 * the app's own origin). Pure, server side (the page builds the srcdoc).
 *
 * - <base target="_blank">: every link opens in a new tab, never inside the frame;
 * - Content-Security-Policy in a <meta>: no script, no frame, no font or media,
 *   no connection; images only from the app's origin (the logo) and `data:`;
 *   inline styles (an email is made of them).
 */
export function documentoSicuro(html: string, origineApp: string): string {
  let origine = ''
  try {
    origine = new URL(origineApp).origin
  } catch {
    origine = ''
  }
  const immagini = ['data:', origine].filter(Boolean).join(' ')
  const testa =
    `<head><meta charset="utf-8"><base target="_blank">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${immagini}; style-src 'unsafe-inline'">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"></head>`
  // after the <html> tag when there is one (our emails have no <head>), else in front of everything
  const conHtml = /<html[^>]*>/i
  if (conHtml.test(html)) {
    // an email that has its own <head>: ours goes first inside it
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, (m) => `${m}<meta charset="utf-8"><base target="_blank"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${immagini}; style-src 'unsafe-inline'">`)
    }
    return html.replace(conHtml, (m) => `${m}${testa}`)
  }
  return `<!doctype html><html lang="it">${testa}<body>${html}</body></html>`
}
