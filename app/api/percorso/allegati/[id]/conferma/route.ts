import { NextResponse, type NextRequest } from 'next/server'

import { BYTE_FIRMA, tipoDaFirma } from '@/lib/percorso/firme'
import { confermaAllegato } from '@/lib/percorso/operazioni'
import { SENZA_CACHE, clienteDellaRichiesta, rifiuto } from '@/lib/percorso/richiesta'
import { createAdminClient } from '@/lib/supabase/admin'
import { allegatoIdSchema } from '@/lib/validation/questionario'

const BUCKET = 'onboarding-allegati'

/**
 * The first bytes of an object, through a signed URL of a few seconds and a Range: the storage
 * answers 206 with those bytes only. Read whole (never a cancelled stream: in the dev server a
 * cancelled body hangs the request); an answer without the Range is at most the 10 MB of the bucket.
 */
async function primiByte(url: string): Promise<Uint8Array | null> {
  try {
    const risposta = await fetch(url, { headers: { Range: `bytes=0-${BYTE_FIRMA - 1}` }, cache: 'no-store' })
    if (!risposta.ok) return null
    return new Uint8Array(await risposta.arrayBuffer()).subarray(0, BYTE_FIRMA)
  } catch {
    return null
  }
}

/**
 * A file of the questionnaire, step two (release B1b): the client from the verified session,
 * the first 16 bytes of the object read with the service role, their signature
 * (lib/percorso/firme.ts), then allegato_conferma with the service role: the row of that
 * client, the object there with an admitted size, the signature equal to the declared type.
 * A page or a PDF with a script declared as a photo is refused and its row goes da_cancellare.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cliente = await clienteDellaRichiesta(request)
  if (!cliente.ok) return cliente.risposta

  const parsed = allegatoIdSchema.safeParse({ id: (await params).id })
  if (!parsed.success) return rifiuto('Richiesta non valida.', 400)
  const id = parsed.data.id
  const percorso = `${cliente.clientId}/${id}`

  const admin = createAdminClient()
  const { data: firmato } = await admin.storage.from(BUCKET).createSignedUrl(percorso, 30)
  const byte = firmato?.signedUrl ? await primiByte(firmato.signedUrl) : null
  const tipoLetto = byte ? tipoDaFirma(byte) : null

  const esito = await confermaAllegato(admin, cliente.clientId, id, tipoLetto)
  if (!esito.ok) {
    // a refused file goes from the bucket now, not in the evening: it was never the client's file to keep
    // (only when the database marked the row: a confirmed file of before is never touched)
    if (esito.scartato) await admin.storage.from(BUCKET).remove([percorso]).catch(() => undefined)
    return rifiuto(esito.errore, 422)
  }
  return NextResponse.json({ allegato: esito.allegato }, { headers: SENZA_CACHE })
}
