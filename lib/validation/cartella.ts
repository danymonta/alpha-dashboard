import { z } from 'zod'

/**
 * The link to the client's Google Drive folder (Dany, 04/10/2026). The same
 * rule as the check of public.clienti_cartelle: https, drive.google.com, no
 * spaces, at most 500 characters. Pasted without "https://", it gets it.
 */
export const URL_DRIVE_MAX = 500
const URL_DRIVE = /^https:\/\/drive\.google\.com\/\S+$/

export const ERRORE_URL_DRIVE = 'Incolla il link di una cartella di Google Drive (https://drive.google.com/…)'

export function normalizzaUrlDrive(valore: string): string {
  const url = valore.trim()
  return /^drive\.google\.com\//.test(url) ? `https://${url}` : url
}

export function urlDriveValido(valore: string): boolean {
  return valore.length <= URL_DRIVE_MAX && URL_DRIVE.test(valore)
}

/** The client whose folder it is: all the actions take. RLS decides who may (admin, the client's coach). */
export const cartellaClienteSchema = z.object({
  client_id: z.string().uuid('Cliente non valido'),
})

export const cartellaDriveSchema = cartellaClienteSchema.extend({
  url: z
    .string()
    .transform(normalizzaUrlDrive)
    .refine((v) => v.length > 0, 'Incolla il link della cartella')
    .refine((v) => v.length <= URL_DRIVE_MAX, `Al massimo ${URL_DRIVE_MAX} caratteri`)
    .refine((v) => v.length > URL_DRIVE_MAX || v.length === 0 || URL_DRIVE.test(v), ERRORE_URL_DRIVE),
})

export type CartellaDriveInput = z.input<typeof cartellaDriveSchema>

/**
 * Who sees and changes the client's Drive folder on his project (Dany,
 * 05/10/2026: «la deve poter modificare ed editare il fitness coach»): the
 * app's admin and the coach of that project, nobody else (not the other
 * members, not a manager who is not the coach; who manages the project picks
 * the coach, and so who sees the folder). The page uses it to show the
 * card and to hand over the Picker's configuration; what is read and saved is
 * decided by RLS (pm_coach_del_cliente), never by this.
 */
export type ChiCartella = 'admin' | 'coach'

export function chiVedeLaCartella(
  persona: { id: string; ruolo: string },
  progetto: { client_id: string | null; coach_id: string | null },
): ChiCartella | null {
  if (!progetto.client_id) return null
  if (persona.ruolo === 'admin') return 'admin'
  return progetto.coach_id !== null && progetto.coach_id === persona.id ? 'coach' : null
}

/** A write RLS refused: the words, never Postgres's. */
export const CARTELLA_NON_TUA = 'Il link della cartella Drive lo cambiano solo l’admin e il coach del cliente.'
/** A delete that touched nothing: gone already, or not one's own any more (coach changed). */
export const CARTELLA_NON_TOLTA = 'Il link non c’è più o non puoi più toglierlo: ricarica la pagina.'
