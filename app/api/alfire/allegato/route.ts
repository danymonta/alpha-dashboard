import { DIMENSIONE_MAX, ERRORI_ALLEGATO, nomePulito } from '@/lib/alfire/allegati'
import { alfireConfigurata, budgetVisione, visioneAttiva } from '@/lib/alfire/config'
import { ErroreAllegato, leggiAllegato } from '@/lib/alfire/estrazione'
import { leggiConVisione } from '@/lib/alfire/visione'
import { soloRecap } from '@/lib/auth/roles'
import { getProfilo } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** The multipart envelope around a 4 MB file. */
const CORPO_MAX = DIMENSIONE_MAX + 256 * 1024

/** Reading gives up before Vercel stops the function. */
const TEMPO_MAX_MS = 50_000

/** Vercel's logs: type, size, pages, time and outcome. Never the name, never the content. */
function registra(voce: { tipo?: string; byte: number; pagine?: number | null; ms: number; visione?: boolean; esito: string }) {
  console.info('[alfire] allegato', JSON.stringify(voce))
}

/**
 * One attached file becomes text for Alfire (Dany, 30/09/2026). Every role
 * may attach: the file only feeds the chat, which keeps working with the
 * role's own tools. Nothing is stored: the bytes stay in memory for this
 * request, the text goes back to the browser and lives in the open chat.
 */
export async function POST(req: Request) {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo) {
    return Response.json({ errore: 'Sessione scaduta. Rientra e riprova.' }, { status: 401 })
  }
  // the business coach has no Alfire (1.58.0): his one page is the sales recap
  if (soloRecap(profilo.ruolo)) {
    return Response.json({ errore: 'Alfire non è attiva per il tuo account.' }, { status: 403 })
  }
  if (!alfireConfigurata()) {
    return Response.json({ errore: 'Alfire non è ancora configurata.' }, { status: 503 })
  }
  // too big before a byte is read, when the browser says how big
  if (Number(req.headers.get('content-length') ?? 0) > CORPO_MAX) {
    return Response.json({ errore: 'Il file è troppo grande: il massimo è 4 MB.' }, { status: 413 })
  }

  let file: File | null = null
  try {
    const campo = (await req.formData()).get('file')
    file = campo instanceof File ? campo : null
  } catch {
    file = null
  }
  if (!file || file.size === 0) return Response.json({ errore: 'Nessun file ricevuto.' }, { status: 400 })
  const nome = nomePulito(file.name)
  if (file.size > DIMENSIONE_MAX) {
    registra({ byte: file.size, ms: 0, esito: 'troppo_grande' })
    return Response.json({ errore: ERRORI_ALLEGATO.troppoGrande(nome) }, { status: 413 })
  }

  const inizio = Date.now()
  // the browser gave up (the chip removed), or the time is over
  const segnale = AbortSignal.any([req.signal, AbortSignal.timeout(TEMPO_MAX_MS)])
  try {
    const { allegato, pagine } = await leggiAllegato(new Uint8Array(await file.arrayBuffer()), file.name, file.type, {
      visione: visioneAttiva() ? (immagini, { pagine }) => leggiConVisione(immagini, { signal: segnale, pagine }) : null,
      pagineScansione: budgetVisione().pagine,
      signal: segnale,
    })
    registra({ tipo: allegato.tipo, byte: file.size, pagine, ms: Date.now() - inizio, visione: allegato.visione, esito: 'ok' })
    return Response.json(allegato)
  } catch (e) {
    const errore =
      e instanceof ErroreAllegato ? e : new ErroreAllegato(422, ERRORI_ALLEGATO.illeggibile(nome), 'errore_inatteso')
    if (!(e instanceof ErroreAllegato)) console.error('[alfire] allegato', e instanceof Error ? e.name : typeof e)
    registra({ byte: file.size, ms: Date.now() - inizio, esito: errore.codice })
    return Response.json({ errore: errore.message }, { status: errore.stato })
  }
}
