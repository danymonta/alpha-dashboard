import { z } from 'zod'

/**
 * What the client's server actions and route receive (release B1a,
 * docs/onboarding/rilascio-b.md, «Codice»). The database decides again (percorso_avanza
 * has its closed list of pairs, video_progresso its checks): these schemas only keep a
 * malformed request from reaching it. B1b adds the questionnaire's attachments here.
 */

export const ERRORI_PERCORSO = {
  nonValidi: 'Qualcosa non torna: ricarica la pagina e riprova.',
  video: 'Video non valido.',
} as const

/**
 * The pairs (step, action) this release serves, with their data: the same closed list as
 * percorso_avanza (B1a). B1b and B2 add their pairs to the union.
 */
export const avanzaPassoSchema = z.discriminatedUnion('azione', [
  z.object({ passo: z.literal('benvenuto'), azione: z.literal('completa') }),
  z.object({
    passo: z.literal('regole'),
    azione: z.literal('accetta'),
    dati: z.object({
      regole: z.array(z.string().uuid(ERRORI_PERCORSO.nonValidi)).max(50, ERRORI_PERCORSO.nonValidi),
      consenso_salute: z.string().min(1).max(40),
    }),
  }),
])
export type AvanzaPasso = z.infer<typeof avanzaPassoSchema>

/** A consent given again after its text changed. */
export const consensoSchema = z.object({
  tipo: z.literal('salute'),
  versione: z.string().min(1).max(40),
})

/** The longest video a block can have: 3 hours, as the check of onboarding_video_visti.durata. */
export const DURATA_VIDEO_MAX_S = 10800
/** At most 50 intervals per call (video_progresso). */
export const INTERVALLI_MAX = 50

/** A stretch of seconds seen, [da, a). */
export const intervalloSchema = z
  .tuple([z.number().int().min(0).max(DURATA_VIDEO_MAX_S), z.number().int().min(1).max(DURATA_VIDEO_MAX_S + 2)])
  .refine(([da, a]) => a > da, ERRORI_PERCORSO.video)

/**
 * POST /api/percorso/video: exactly one of `blocco` and `consegna` (the coach's deliveries are
 * B2: the database refuses them in B1a), the length the player declared, the stretches seen.
 */
export const progressoVideoSchema = z
  .object({
    blocco: z.string().uuid().optional(),
    consegna: z.string().uuid().optional(),
    durata: z.number().int().min(1).max(DURATA_VIDEO_MAX_S),
    intervalli: z.array(intervalloSchema).min(1).max(INTERVALLI_MAX),
  })
  .refine((v) => (v.blocco ? 1 : 0) + (v.consegna ? 1 : 0) === 1, ERRORI_PERCORSO.video)
export type ProgressoVideo = z.infer<typeof progressoVideoSchema>

// ---------------------------------------------------------------------------
// The admin's CMS (contenuti_blocchi): the same rules as the checks of the table
// ---------------------------------------------------------------------------
export const TIPI_BLOCCO = ['testo', 'avviso', 'video', 'regola', 'voce', 'pulsante', 'domande'] as const
export const PAGINE_BLOCCO = ['passo', 'dopo_lancio'] as const

export const ERRORI_BLOCCO = {
  soloAdmin: 'I contenuti del percorso li scrive l’admin.',
  titolo: 'Il titolo è al massimo di 120 caratteri',
  titoloObbligatorio: 'Scrivi il titolo',
  corpo: 'Il testo è al massimo di 8.000 caratteri',
  youtube: 'Incolla l’indirizzo del video di YouTube o il suo id di 11 caratteri',
  url: 'Il link deve cominciare con https://',
  urlObbligatorio: 'Il pulsante vuole un link',
  ordine: 'Ordine non valido',
  passo: 'Scegli lo step',
  nonSalvato: 'Contenuto non salvato. Riprova.',
  nonEliminato: 'Contenuto non eliminato. Riprova.',
  nonValidi: 'Dati non validi.',
} as const

const testoFacoltativo = (max: number, messaggio: string) =>
  z
    .string()
    .max(max, messaggio)
    .nullish()
    .transform((v) => {
      const t = v?.trim() ?? ''
      return t === '' ? null : t
    })

/**
 * «https://youtu.be/abc…», «https://www.youtube.com/watch?v=abc…», «/shorts/abc…» or the bare id:
 * the 11 characters of the id, or null when there is none.
 */
export function idYoutube(valore: string | null | undefined): string | null {
  const v = valore?.trim() ?? ''
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v
  let url: URL
  try {
    url = new URL(v)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v')
    if (!id) {
      const m = /^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname)
      id = m?.[1] ?? null
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

export const bloccoSchema = z
  .object({
    id: z.string().uuid().optional(),
    pagina: z.enum(PAGINE_BLOCCO),
    passo: z.string().regex(/^[a-z_]{1,40}$/, ERRORI_BLOCCO.passo).nullish(),
    tipo: z.enum(TIPI_BLOCCO),
    ordine: z.coerce.number().int(ERRORI_BLOCCO.ordine).min(0, ERRORI_BLOCCO.ordine).max(10000, ERRORI_BLOCCO.ordine),
    titolo: testoFacoltativo(120, ERRORI_BLOCCO.titolo),
    corpo: testoFacoltativo(8000, ERRORI_BLOCCO.corpo),
    youtube: z.string().max(500).nullish(),
    url: testoFacoltativo(500, ERRORI_BLOCCO.url).refine((u) => u === null || u.startsWith('https://'), ERRORI_BLOCCO.url),
    obbligatorio: z.boolean().default(false),
    pubblicato: z.boolean().default(true),
  })
  .transform((v, ctx) => {
    const youtube_id = v.youtube?.trim() ? idYoutube(v.youtube) : null
    if (v.youtube?.trim() && !youtube_id) ctx.addIssue({ code: 'custom', path: ['youtube'], message: ERRORI_BLOCCO.youtube })
    if (v.tipo === 'video' && !youtube_id && !v.youtube?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['youtube'], message: ERRORI_BLOCCO.youtube })
    }
    if (v.tipo === 'pulsante' && !v.url) ctx.addIssue({ code: 'custom', path: ['url'], message: ERRORI_BLOCCO.urlObbligatorio })
    if ((v.tipo === 'pulsante' || v.tipo === 'regola' || v.tipo === 'voce') && !v.titolo) {
      ctx.addIssue({ code: 'custom', path: ['titolo'], message: ERRORI_BLOCCO.titoloObbligatorio })
    }
    const passo = v.pagina === 'passo' ? (v.passo ?? null) : null
    if (v.pagina === 'passo' && !passo) ctx.addIssue({ code: 'custom', path: ['passo'], message: ERRORI_BLOCCO.passo })
    return {
      id: v.id,
      pagina: v.pagina,
      passo,
      tipo: v.tipo,
      ordine: v.ordine,
      titolo: v.titolo,
      corpo: v.corpo,
      youtube_id: v.tipo === 'video' ? youtube_id : null,
      url: v.url,
      // only a video can be compulsory: rules and items always are
      obbligatorio: v.tipo === 'video' ? v.obbligatorio : false,
      pubblicato: v.pubblicato,
    }
  })
export type BloccoInput = z.input<typeof bloccoSchema>
export type Blocco = z.output<typeof bloccoSchema>

export const eliminaBloccoSchema = z.object({ id: z.string().uuid(ERRORI_BLOCCO.nonValidi) })

/** «Cliente di prova» on the card. */
export const segnaProvaSchema = z.object({ invito_id: z.string().uuid(), prova: z.boolean() })

/** «Elimina onboarding». */
export const eliminaOnboardingSchema = z.object({ client_id: z.string().uuid() })
