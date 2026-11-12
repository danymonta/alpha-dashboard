import { z } from 'zod'

import { separaJoin } from '@/lib/onboarding/link'

/**
 * The client's way in (release B1a, docs/onboarding/rilascio-b.md, «Autenticazione»): the
 * personal link /join/<slug>-<token>, the registration with an 8 digit code of ours, the
 * return through /entra with Supabase's code. The same schemas bind the forms and the
 * server actions; the words are the client's (Italian only, lib/percorso/testi.ts).
 */

/** Digits of both codes: the registration's (ours) and the return's (Supabase's Email OTP Length). */
export const CIFRE_CODICE_CLIENTE = 8

/** How long the registration code lasts (onboarding_join_codice: 15 minutes). */
export const VALIDITA_CODICE_REGISTRAZIONE_MINUTI = 15

/** How long the code of /entra lasts: Supabase's otp_expiry. */
export const VALIDITA_CODICE_ENTRA_MINUTI = 60

/** Seconds before «Invia di nuovo» lights up again. */
export const ATTESA_NUOVO_CODICE_CLIENTE_S = 60

export const ERRORI_REGISTRAZIONE = {
  email: 'Scrivi un’email valida, ad esempio nome@dominio.it',
  emailVuota: 'Scrivi la tua email',
  codice: `Il codice ha ${CIFRE_CODICE_CLIENTE} cifre`,
  codiceVuoto: 'Scrivi il codice',
  segmento: 'Link non valido',
} as const

/** The address the client types: the same rules as the team's, with the client's words. */
export const emailClienteSchema = z
  .string({ required_error: ERRORI_REGISTRAZIONE.emailVuota })
  .trim()
  .toLowerCase()
  .min(1, ERRORI_REGISTRAZIONE.emailVuota)
  .max(320, ERRORI_REGISTRAZIONE.email)
  .email(ERRORI_REGISTRAZIONE.email)

/** «1234 5678», «1234-5678» and spaces around are the same code; then exactly 8 digits. */
export const codiceClienteSchema = z
  .string({ required_error: ERRORI_REGISTRAZIONE.codiceVuoto })
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .min(1, ERRORI_REGISTRAZIONE.codiceVuoto)
      .regex(new RegExp(`^\\d{${CIFRE_CODICE_CLIENTE}}$`), ERRORI_REGISTRAZIONE.codice),
  )

/** The last segment of /join/<slug>-<token>: separaJoin must read it. */
export const segmentoJoinSchema = z
  .string()
  .max(200, ERRORI_REGISTRAZIONE.segmento)
  .refine((s) => separaJoin(s) !== null, ERRORI_REGISTRAZIONE.segmento)

/** «Continua» on the page of the link. */
export const apriInvitoSchema = z.object({ segmento: segmentoJoinSchema })

/** «Inviami il codice» on /join/registrati. */
export const codiceRegistrazioneSchema = z.object({ email: emailClienteSchema })

/** The code of the registration. */
export const verificaRegistrazioneSchema = z.object({ codice: codiceClienteSchema })

/** /entra: the address, then the code. */
export const chiediCodiceClienteSchema = z.object({ email: emailClienteSchema })
export const verificaCodiceClienteSchema = z.object({ email: emailClienteSchema, codice: codiceClienteSchema })

/** The forms (one field each step). */
export const formEmailClienteSchema = z.object({ email: emailClienteSchema })
export const formCodiceClienteSchema = z.object({ codice: codiceClienteSchema })
export type FormEmailClienteInput = z.input<typeof formEmailClienteSchema>
export type FormCodiceClienteInput = z.input<typeof formCodiceClienteSchema>

/** «1234 5678»: the code as the email writes it, easier to read. */
export function codiceLeggibile(codice: string): string {
  return /^\d{8}$/.test(codice) ? `${codice.slice(0, 4)} ${codice.slice(4)}` : codice
}
