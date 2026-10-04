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

export const cartellaDriveSchema = z.object({
  client_id: z.string().uuid('Cliente non valido'),
  url: z
    .string()
    .transform(normalizzaUrlDrive)
    .refine((v) => v.length > 0, 'Incolla il link della cartella')
    .refine((v) => v.length <= URL_DRIVE_MAX, `Al massimo ${URL_DRIVE_MAX} caratteri`)
    .refine((v) => v.length > URL_DRIVE_MAX || v.length === 0 || URL_DRIVE.test(v), ERRORE_URL_DRIVE),
})

export type CartellaDriveInput = z.input<typeof cartellaDriveSchema>
