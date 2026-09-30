import type { DataUIPart, UIDataTypes, UIMessage } from 'ai'
import { z } from 'zod'

/**
 * Attachments in Alfire (Dany, 30/09/2026): PDF, photos and screenshots, Word,
 * Excel and CSV. A file is read once by /api/alfire/allegato and becomes text;
 * the text lives in the open chat, like the messages, and is never stored
 * anywhere (no Storage, no table, no content in the logs). Shared by the
 * browser and the server.
 */

/** Per message: more would not fit a sensible request anyway. */
export const ALLEGATI_MAX = 3

/**
 * Per file, as it reaches the server. Vercel refuses request bodies over
 * 4.5 MB, so one file travels per request and stays under 4 MB. Photos are
 * made smaller in the browser first (see IMMAGINE_ORIGINALE_MAX).
 */
export const DIMENSIONE_MAX = 4 * 1024 * 1024

/** A photo straight from the phone may be bigger: the browser shrinks it before it leaves. */
export const IMMAGINE_ORIGINALE_MAX = 30 * 1024 * 1024

/** The longest side of a photo after the browser shrinks it: enough to read a receipt. */
export const LATO_IMMAGINE_MAX = 2000

/** What the server hands back for one file, at most: the chat then cuts it per plan. */
export const TESTO_FILE_MAX = 40_000

/**
 * The most text of attachments the model ever reads (budgetAllegati on the
 * Developer plan): with one message, and in the whole history.
 */
export const ALLEGATI_PER_MESSAGGIO_MAX = 24_000
export const ALLEGATI_STORIA_MAX = 48_000

export const TIPI_ALLEGATO = ['pdf', 'immagine', 'docx', 'xlsx', 'csv'] as const
export type TipoAllegato = (typeof TIPI_ALLEGATO)[number]

/**
 * The file picker: PDF, every image the phone offers (camera and photos), Word,
 * Excel, CSV. No explicit HEIC: with a plain image/* the iPhone hands its HEIC
 * photos over as JPEG, and elsewhere image/* lists .heic files anyway.
 */
export const ACCETTA_ALLEGATI = [
  'application/pdf',
  '.pdf',
  'image/*',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsx',
  'text/csv',
  '.csv',
].join(',')

/** One file, read: what the chat keeps and sends back with every question. */
export const schemaAllegato = z.object({
  nome: z.string().min(1).max(200),
  tipo: z.enum(TIPI_ALLEGATO),
  /** "PDF, 3 pagine", "Foto", "Excel, 2 fogli": said to the model next to the name. */
  descrizione: z.string().max(80),
  dimensione: z.number().int().nonnegative(),
  testo: z.string().max(TESTO_FILE_MAX + 500),
  /** Read by the vision model (a photo, a scan) rather than from the file's own text. */
  visione: z.boolean(),
})

export type Allegato = z.infer<typeof schemaAllegato>

/** The part of a user message that carries an attachment. */
export const PARTE_ALLEGATO = 'data-allegato'

type Parte = UIMessage['parts'][number]

export function isParteAllegato(p: Parte): p is DataUIPart<UIDataTypes> {
  return p.type === PARTE_ALLEGATO
}

/** The valid attachments of a message, in order; anything malformed is left out. */
export function allegatiDelMessaggio(m: UIMessage): Allegato[] {
  return m.parts.flatMap((p) => {
    if (!isParteAllegato(p)) return []
    const letto = schemaAllegato.safeParse(p.data)
    return letto.success ? [letto.data] : []
  })
}

const byte = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

/** 1536 → "1,5 KB"; 3.4 MB → "3,4 MB". */
export function dimensioneLeggibile(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${byte.format(n / 1024)} KB`
  return `${byte.format(n / (1024 * 1024))} MB`
}

/** A file name fit for a chip and for the model: no paths, no control characters, not too long. */
export function nomePulito(nome: string): string {
  const base = nome.split(/[\\/]/).at(-1) ?? ''
  const pulito = base.replace(/[\u0000-\u001f\u007f[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!pulito) return 'file'
  if (pulito.length <= 120) return pulito
  const punto = pulito.lastIndexOf('.')
  const estensione = punto > 0 && pulito.length - punto <= 6 ? pulito.slice(punto) : ''
  return `${pulito.slice(0, 120 - estensione.length - 1)}…${estensione}`
}

/** What the browser can tell before sending: by extension and declared type. The server checks the bytes. */
export function tipoDichiarato(nome: string, mime: string): TipoAllegato | 'heic' | 'vecchio' | null {
  const estensione = nome.toLowerCase().split('.').at(-1) ?? ''
  if (estensione === 'heic' || estensione === 'heif' || /image\/hei[cf]/.test(mime)) return 'heic'
  if (mime.startsWith('image/')) return 'immagine'
  if (estensione === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (estensione === 'docx') return 'docx'
  if (estensione === 'xlsx') return 'xlsx'
  if (estensione === 'csv' || mime === 'text/csv') return 'csv'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff'].includes(estensione)) return 'immagine'
  if (['doc', 'xls'].includes(estensione)) return 'vecchio'
  return null
}

/** The errors of reading a file, the same words in the browser and on the server. */
export const ERRORI_ALLEGATO = {
  troppi: `Al massimo ${ALLEGATI_MAX} file per messaggio.`,
  troppoGrande: (nome: string) => `«${nome}» è troppo grande: il massimo è 4 MB. Manda solo le pagine che servono o comprimilo.`,
  fotoTroppoGrande: (nome: string) => `La foto «${nome}» è troppo grande: il massimo è 30 MB. Mandane una più leggera o uno screenshot.`,
  troppoGrandeAperto: (nome: string) =>
    `«${nome}» è troppo grande da leggere una volta aperto: salva in un file a parte solo il foglio o le pagine che servono.`,
  nonSupportato: (nome: string) =>
    `«${nome}»: tipo di file non supportato. Allega un PDF, una foto (JPG, PNG, HEIC, WebP), un Word (.docx), un Excel (.xlsx) o un CSV.`,
  vecchio: (nome: string) =>
    `«${nome}» è un Word o un Excel vecchio (.doc, .xls) o protetto da password: salvalo come .docx o .xlsx, senza password, e riallegalo.`,
  heic: (nome: string) =>
    `«${nome}»: questo browser non apre le foto HEIC. Esportala in JPG, o fai uno screenshot, e riallegala.`,
  fotoIllegibile: (nome: string) => `Non riesco ad aprire la foto «${nome}»: prova con uno screenshot o un JPG.`,
  illeggibile: (nome: string) => `Non riesco a leggere «${nome}»: il file sembra danneggiato o protetto da password.`,
  vuoto: (nome: string) => `«${nome}» non contiene testo da leggere.`,
  scansioneSenzaVisione: (nome: string) =>
    `«${nome}» è una scansione senza testo, e la lettura delle immagini non è attiva: allega un PDF con testo o chiedi all’admin di attivarla.`,
  visioneSpenta: (nome: string) =>
    `La lettura delle immagini non è attiva, quindi non posso leggere «${nome}». Chiedi all’admin di attivarla.`,
  limite: 'Limite della lettura dei file raggiunto per questo minuto: riprova tra poco.',
  lento: (nome: string) => `«${nome}» richiede troppo tempo da leggere: prova con un file più piccolo.`,
  visioneFallita: (nome: string) => `Non sono riuscita a leggere l’immagine di «${nome}». Riprova.`,
  rete: (nome: string) => `Non sono riuscita a mandare «${nome}». Controlla la connessione e riprova.`,
} as const

/** A fair split: short files keep all their text, the others share what is left equally. */
export function quote(lunghezze: number[], totale: number): number[] {
  const ordine = lunghezze.map((l, i) => ({ l, i })).sort((a, b) => a.l - b.l)
  const out = lunghezze.map(() => 0)
  let resto = Math.max(0, totale)
  ordine.forEach(({ l, i }, k) => {
    out[i] = Math.min(l, Math.floor(resto / (ordine.length - k)))
    resto -= out[i]
  })
  return out
}

/**
 * What the browser sends with every question: the whole chat. Each file
 * travels whole while the server could still read some of it on the most
 * generous plan (ALLEGATI_PER_MESSAGGIO_MAX a message, ALLEGATI_STORIA_MAX in
 * all, newest first, as allegatiComeTesto counts); the server then cuts it per
 * plan, and says so. Older files, beyond that, travel without their text, so
 * the request stays far from Vercel's 4.5 MB even after many files. The last
 * message with files is never emptied.
 */
export function alleggerisciAllegati<M extends UIMessage>(
  messaggi: M[],
  storia = ALLEGATI_STORIA_MAX,
  perMessaggio = ALLEGATI_PER_MESSAGGIO_MAX,
): M[] {
  let resto = storia
  const out = [...messaggi]
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i]
    if (m.role !== 'user' || !m.parts.some(isParteAllegato)) continue
    const lunghezze = allegatiDelMessaggio(m)
      .slice(0, ALLEGATI_MAX)
      .map((a) => a.testo.length)
    if (resto > 0) {
      resto -= quote(lunghezze, Math.min(perMessaggio, resto)).reduce((s, q) => s + q, 0)
      continue
    }
    out[i] = {
      ...m,
      parts: m.parts.map((p) => {
        if (!isParteAllegato(p)) return p
        const letto = schemaAllegato.safeParse(p.data)
        return letto.success ? { ...p, data: { ...letto.data, testo: '' } } : p
      }),
    }
  }
  return out
}

/** The user's message: the files first, then the words (none: the model is asked for a summary). */
export function messaggioConAllegati(testo: string, allegati: Allegato[]): { text: string } | { parts: UIMessage['parts'] } {
  if (allegati.length === 0) return { text: testo }
  return {
    parts: [
      ...allegati.map((a) => ({ type: PARTE_ALLEGATO, data: a }) as DataUIPart<UIDataTypes>),
      ...(testo ? [{ type: 'text' as const, text: testo }] : []),
    ],
  }
}
