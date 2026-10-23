import { z } from 'zod'

/**
 * Sign-in by email (Supabase email OTP): the person asks for a code, the email
 * carries a link and an 8 digit code (the cloud project's Email OTP Length), either one signs in. The same field
 * schemas bind the form and the server actions.
 */

/** Digits in the code: Supabase › Authentication › Email › OTP length (config.toml: otp_length). */
export const CIFRE_CODICE = 8

/** Seconds before a new code can be asked for (the form counts down, the server does not rely on it). */
export const ATTESA_NUOVO_CODICE_S = 60

/** How long the code and the link last: config.toml `otp_expiry` (3600), the Supabase default. */
export const VALIDITA_CODICE_MINUTI = 60

export const emailAccessoSchema = z
  .string({ required_error: 'Scrivi il tuo indirizzo di posta' })
  .trim()
  .toLowerCase()
  .min(1, 'Scrivi il tuo indirizzo di posta')
  .max(160, 'Questo indirizzo è troppo lungo')
  .email('Scrivi un indirizzo valido, ad esempio nome@dominio.it')

/**
 * The code as it is typed or pasted: "123 456", "123-456" and a trailing space
 * are the same code. Whatever is left must be exactly the digits.
 */
export const codiceAccessoSchema = z
  .string({ required_error: 'Scrivi il codice' })
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .min(1, 'Scrivi il codice')
      .regex(new RegExp(`^\\d{${CIFRE_CODICE}}$`), `Il codice ha ${CIFRE_CODICE} cifre`),
  )

/** "da": where to go afterwards. A string here; the server action reduces it to a path of this app. */
const da = z.string().max(2000).optional().default('/')

/** The two steps of the form, one field each. */
export const formEmailSchema = z.object({ email: emailAccessoSchema })
export const formCodiceSchema = z.object({ codice: codiceAccessoSchema })

/** What the server actions receive. */
export const richiestaCodiceSchema = z.object({ email: emailAccessoSchema, da })
export const verificaCodiceSchema = z.object({ email: emailAccessoSchema, codice: codiceAccessoSchema, da })

export type FormEmailInput = z.input<typeof formEmailSchema>
export type FormCodiceInput = z.input<typeof formCodiceSchema>

/** The link in the email: `type` as Supabase writes it, a token_hash made only of token characters. */
export const TIPI_LINK_ACCESSO = ['email', 'magiclink'] as const

export const linkAccessoSchema = z.object({
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/),
  type: z.enum(TIPI_LINK_ACCESSO),
})
