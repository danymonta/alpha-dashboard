import { NextResponse, type NextRequest } from 'next/server'

import { getProfilo } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { allegatoIdSchema } from '@/lib/validation/questionario'

const SENZA_CACHE = { 'Cache-Control': 'no-store' }
const BUCKET = 'onboarding-allegati'
/** The signed address lives one minute: enough to open the file, never a lasting link. */
const SECONDI_INDIRIZZO = 60

/**
 * A file of a client's questionnaire, opened by the team (release B1b): the row read with
 * the session of whoever asks, under RLS (the admin; B2 the coach in charge through his own
 * function), then a signed address of 60 seconds made with the service role and a redirect.
 * Every file is downloaded (Content-Disposition: attachment), never opened inline in our
 * origin's tab: a polyglot that slipped past the checks never runs as a page. Never a public
 * address, never the path in the page.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = allegatoIdSchema.safeParse({ id: (await params).id })
  if (!parsed.success) return NextResponse.json({ errore: 'File non valido.' }, { status: 400, headers: SENZA_CACHE })

  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return NextResponse.json({ errore: 'Accesso non valido.' }, { status: 401, headers: SENZA_CACHE })
  }

  const supabase = await createClient()
  const { data: riga, error } = await supabase
    .from('onboarding_allegati')
    .select('percorso, nome_file')
    .eq('id', parsed.data.id)
    .eq('stato', 'caricato')
    .maybeSingle()
  if (error) return NextResponse.json({ errore: 'Il file non si apre: riprova.' }, { status: 503, headers: SENZA_CACHE })
  if (!riga) return NextResponse.json({ errore: 'Questo file non c’è più.' }, { status: 404, headers: SENZA_CACHE })

  const { data, error: errFirma } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(riga.percorso, SECONDI_INDIRIZZO, { download: riga.nome_file })
  if (errFirma || !data?.signedUrl) {
    return NextResponse.json({ errore: 'Il file non si apre: riprova.' }, { status: 503, headers: SENZA_CACHE })
  }
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: SENZA_CACHE })
}
