import { z } from 'zod'

import { ICONE_MODULO } from '@/lib/percorso/campo-base'
import { idYoutube } from '@/lib/validation/percorso'

/**
 * The Aula of the client's home base (1.83.0): the admin's modules and lessons, with the same rules
 * as the checks of aula_moduli and aula_lezioni.
 */
export const ERRORI_AULA = {
  titolo: 'Scrivi un titolo di al massimo 120 caratteri.',
  descrizione: 'La descrizione è al massimo di 500 caratteri.',
  corpo: 'Il testo è al massimo di 20.000 caratteri.',
  youtube: 'Incolla l’indirizzo del video di YouTube o il suo id di 11 caratteri.',
  url: 'Il link deve cominciare con https://',
  urlObbligatorio: 'Un PDF o un link vuole il suo indirizzo https://',
  ordine: 'Ordine non valido.',
  nonValidi: 'Dati non validi.',
  soloAdmin: 'L’Aula la scrive l’admin.',
  nonSalvato: 'Non salvato. Riprova.',
  nonEliminato: 'Non eliminato. Riprova.',
  copertina: 'La copertina è un’immagine JPG, PNG o WebP fino a 3 MB.',
} as const

export const STATI_MODULO = ['bozza', 'pubblicato', 'prossimamente', 'bloccato'] as const
export const TIPI_LEZIONE = ['video', 'testo', 'pdf', 'link'] as const

const facoltativo = (max: number, messaggio: string) =>
  z
    .string()
    .max(max, messaggio)
    .nullish()
    .transform((v) => (v && v.trim() !== '' ? v : null))

export const moduloSchema = z.object({
  id: z.string().uuid().optional(),
  titolo: z.string().trim().min(1, ERRORI_AULA.titolo).max(120, ERRORI_AULA.titolo),
  descrizione: facoltativo(500, ERRORI_AULA.descrizione),
  copertina_url: facoltativo(500, ERRORI_AULA.url).refine((u) => u === null || u.startsWith('https://'), ERRORI_AULA.url),
  icona: z.enum(ICONE_MODULO as unknown as [string, ...string[]]),
  ordine: z.coerce.number().int(ERRORI_AULA.ordine).min(0, ERRORI_AULA.ordine).max(10000, ERRORI_AULA.ordine),
  stato: z.enum(STATI_MODULO),
  durante_onboarding: z.boolean().default(false),
})
export type ModuloInput = z.infer<typeof moduloSchema>

export const lezioneSchema = z
  .object({
    id: z.string().uuid().optional(),
    modulo_id: z.string().uuid(ERRORI_AULA.nonValidi),
    titolo: z.string().trim().min(1, ERRORI_AULA.titolo).max(120, ERRORI_AULA.titolo),
    ordine: z.coerce.number().int(ERRORI_AULA.ordine).min(0, ERRORI_AULA.ordine).max(10000, ERRORI_AULA.ordine),
    tipo: z.enum(TIPI_LEZIONE),
    corpo: facoltativo(20000, ERRORI_AULA.corpo),
    youtube: z.string().max(500).nullish(),
    url: facoltativo(500, ERRORI_AULA.url).refine((u) => u === null || u.startsWith('https://'), ERRORI_AULA.url),
    obbligatoria: z.boolean().default(false),
    pubblicata: z.boolean().default(true),
  })
  .transform((v, ctx) => {
    const youtube_id = v.youtube?.trim() ? idYoutube(v.youtube) : null
    if (v.tipo === 'video' && !youtube_id) ctx.addIssue({ code: 'custom', path: ['youtube'], message: ERRORI_AULA.youtube })
    if ((v.tipo === 'pdf' || v.tipo === 'link') && !v.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: ERRORI_AULA.urlObbligatorio })
    }
    return {
      id: v.id,
      modulo_id: v.modulo_id,
      titolo: v.titolo,
      ordine: v.ordine,
      tipo: v.tipo,
      corpo: v.corpo,
      youtube_id: v.tipo === 'video' ? youtube_id : null,
      url: v.tipo === 'pdf' || v.tipo === 'link' ? v.url : null,
      obbligatoria: v.obbligatoria,
      pubblicata: v.pubblicata,
    }
  })
export type LezioneInput = z.input<typeof lezioneSchema>

export const idSchema = z.object({ id: z.string().uuid(ERRORI_AULA.nonValidi) })

export const TIPI_COPERTINA = ['image/jpeg', 'image/png', 'image/webp'] as const
export const BYTE_COPERTINA_MAX = 3 * 1024 * 1024
