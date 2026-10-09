import { z } from 'zod'

/*
 * Claude connected to Alpha Management (MCP, Dany 09/10/2026): the consent page
 * /oauth/consent and «App collegate» in Profilo › Account. The same schemas
 * check the page's query and the server actions.
 */

export const NON_VALIDA = 'Questa richiesta di collegamento non è valida: riprova da Claude.'

/**
 * Supabase Auth generates the authorization id as 32 letters and digits
 * (crypto.SecureAlphanumeric(32)); the wider pattern survives a change, and
 * nothing outside it ever reaches the GoTrue path it is pasted into.
 */
export const idAutorizzazioneSchema = z.string().regex(/^[A-Za-z0-9_-]{8,200}$/, NON_VALIDA)

/**
 * consenti: first consent, approve. rifiuta: refuse (also who may not connect).
 * continua and annulla: Supabase had already approved a repeat consent and the
 * code exists; continua delivers it, annulla sends Claude an access_denied
 * without it. Both carry the redirect_url the page received.
 */
export const DECISIONI_CONSENSO = ['consenti', 'rifiuta', 'continua', 'annulla'] as const
export type DecisioneConsenso = (typeof DECISIONI_CONSENSO)[number]

export const consensoSchema = z
  .object({
    authorization_id: idAutorizzazioneSchema,
    decisione: z.enum(DECISIONI_CONSENSO, { message: NON_VALIDA }),
    redirect_url: z.string().max(2000, NON_VALIDA).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.decisione === 'continua' || v.decisione === 'annulla') && !v.redirect_url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['redirect_url'], message: NON_VALIDA })
    }
  })
export type ConsensoInput = z.infer<typeof consensoSchema>

/** «Scollega» in App collegate: the OAuth client to revoke, a uuid. */
export const scollegaAppSchema = z.object({
  clientId: z.string().uuid('App non valida: ricarica la pagina.'),
})
