import 'server-only'

import { createHash } from 'node:crypto'

/**
 * The fingerprint of a section's text as the page shows it: the md5 that
 * public.salva_sezione_contenuto compares, md5(coalesce(testo, '')) over the
 * same UTF-8 bytes. A section is saved only over the text whose fingerprint
 * the person started from.
 */
export function improntaTesto(testo: string | null): string {
  return createHash('md5').update(testo ?? '', 'utf8').digest('hex')
}
