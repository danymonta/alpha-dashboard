import 'server-only'

import { z } from 'zod'

import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { FRASI_FATHOM } from '@/lib/fathom/frasi'
import { AVVISI_INSIGHT } from '@/lib/insight/frasi'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { statoToken } from '@/lib/instagram/stato-token'
import { avvisaRateInRitardo, registraAvviso, type AvvisoDaRegistrare } from '@/lib/notifiche/avvisi'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = Pick<ReturnType<typeof createAdminClient>, 'rpc'>

/** What public.notifiche_collegamenti_stato() reads of the connections: never a token or a key. */
const statoSchema = z.object({
  instagram: z
    .object({
      presente: z.boolean(),
      scade_il: z.string().nullable(),
      versione: z.string().nullable().optional(),
      errore: z.string().nullable(),
      errore_il: z.string().nullable(),
    })
    .nullable()
    .optional(),
  messenger: z
    .object({
      presente: z.boolean(),
      versione: z.string().nullable().optional(),
      errore: z.string().nullable(),
      errore_il: z.string().nullable(),
    })
    .nullable()
    .optional(),
  fathom: z
    .object({
      presente: z.boolean(),
      versione: z.string().nullable().optional(),
      errore: z.string().nullable(),
      errore_il: z.string().nullable(),
    })
    .nullable()
    .optional(),
})
export type StatoCollegamenti = z.infer<typeof statoSchema>

/** A rejection older than this was not seen by the last night's run: it is not news. */
const FINESTRA_ERRORE_MS = 36 * 3_600_000

const LINK = '/settings/chiavi'
const DOVE = 'Impostazioni › Chiavi e collegamenti'

/**
 * The episode of a refusal: the token or key that was refused (the time it was
 * saved), so a refusal that the night keeps writing is announced once, and a new
 * token refused again is a new alert. Without a version, the day of the refusal.
 */
function episodio(versione: string | null | undefined, giorno: string): string {
  return versione ? `v${Date.parse(versione) || versione}` : giorno
}

/** The error is the one of a rejected token or key, written in the last 36 hours. */
function rifiutataDi(frase: string, errore: string | null, erroreIl: string | null, adesso: Date): string | null {
  if (errore !== frase || !erroreIl) return null
  const quando = Date.parse(erroreIl)
  if (!Number.isFinite(quando) || adesso.getTime() - quando > FINESTRA_ERRORE_MS) return null
  return oggiRoma(new Date(quando))
}

/**
 * The alerts the connections call for (pure, tested): the Instagram token that
 * ends within 7 days, that is expired or that Meta refused; the Messenger Page
 * token and the Fathom key that were refused. The key says the event: the end
 * date of the token (once), or the refused token or key (once per token: a
 * refusal the night keeps writing is not news again). All of them open Impostazioni › Chiavi e collegamenti.
 */
export function avvisiCollegamenti(stato: StatoCollegamenti, adesso: Date): AvvisoDaRegistrare[] {
  const avvisi: AvvisoDaRegistrare[] = []

  const ig = stato.instagram
  if (ig?.presente) {
    const rifiutatoDaMeta = ig.errore === FRASI_ERRORE.token
    const giornoRifiuto = rifiutataDi(FRASI_ERRORE.token, ig.errore, ig.errore_il, adesso)
    const t = statoToken({ presente: true, scadeIl: ig.scade_il, rifiutatoDaMeta, adesso: adesso.getTime() })
    const giornoFine = ig.scade_il ? oggiRoma(new Date(ig.scade_il)) : null
    if (t.scadePresto && giornoFine && t.giorniAllaScadenza !== null) {
      const giorni = t.giorniAllaScadenza
      avvisi.push({
        tipo: 'chiave_in_scadenza',
        titolo: `Il token di Instagram scade il ${formatData(giornoFine)}: rigeneralo in ${DOVE}`,
        anteprima: `Mancano ${giorni === 1 ? '1 giorno' : `${giorni} giorni`}. Dopo non si leggono più i DM, i post e l’Insight.`,
        dettagli: [
          'Senza un token valido si fermano il tracciamento dei DM, la lettura dei post per il calendario dei contenuti e l’Insight.',
          'Meta › Alpha DM Reader › Instagram › Genera token: la guida passo passo è nella scheda Instagram.',
        ],
        link: LINK,
        chiave: `instagram-token-scade/${giornoFine}`,
      })
    } else if (t.scadutoPerData && giornoFine) {
      avvisi.push({
        tipo: 'chiave_rifiutata',
        titolo: `Il token di Instagram è scaduto: generane uno nuovo in ${DOVE}`,
        anteprima: `È scaduto il ${formatData(giornoFine)}: i DM, i post e l’Insight non si leggono più.`,
        dettagli: ['Meta › Alpha DM Reader › Instagram › Genera token, poi incollalo qui. La guida è nella scheda Instagram.'],
        link: LINK,
        chiave: `instagram-token-scaduto/${giornoFine}`,
      })
    } else if (rifiutatoDaMeta && giornoRifiuto) {
      avvisi.push({
        tipo: 'chiave_rifiutata',
        titolo: `Instagram ha rifiutato il token: generane uno nuovo in ${DOVE}`,
        anteprima: 'Succede quando cambia la password dell’account o Meta lo invalida: i DM, i post e l’Insight sono fermi.',
        dettagli: ['Meta › Alpha DM Reader › Instagram › Genera token, poi incollalo qui. La guida è nella scheda Instagram.'],
        link: LINK,
        chiave: `instagram-token-rifiutato/${episodio(ig.versione, giornoRifiuto)}`,
      })
    }
  }

  const fb = stato.messenger
  if (fb?.presente) {
    const giorno = rifiutataDi(AVVISI_INSIGHT.messenger_token, fb.errore, fb.errore_il, adesso)
    if (giorno) {
      avvisi.push({
        tipo: 'chiave_rifiutata',
        titolo: `Meta ha rifiutato il token della Pagina di Messenger: incollane uno nuovo in ${DOVE}`,
        anteprima: 'Le chat di Messenger non si leggono più nell’Insight finché non lo cambi.',
        dettagli: ['Meta › Messenger › Impostazioni dell’API: la guida è nella scheda Messenger.'],
        link: LINK,
        chiave: `messenger-token-rifiutato/${episodio(fb.versione, giorno)}`,
      })
    }
  }

  const fa = stato.fathom
  if (fa?.presente) {
    const giorno = rifiutataDi(FRASI_FATHOM.chiave, fa.errore, fa.errore_il, adesso)
    if (giorno) {
      avvisi.push({
        tipo: 'chiave_rifiutata',
        titolo: `Fathom ha rifiutato la chiave API: generane una nuova in ${DOVE}`,
        anteprima: 'Le registrazioni delle call non si leggono e le analisi di Claude sulle call restano ferme.',
        dettagli: ['Fathom › My Settings › API Access › Generate Api Key: la guida è nella scheda Fathom.'],
        link: LINK,
        chiave: `fathom-chiave-rifiutata/${episodio(fa.versione, giorno)}`,
      })
    }
  }

  return avvisi
}

/** The evening scan of the connections: reads the states in SQL, decides here, writes through the one writer. */
export async function avvisaCollegamenti({
  db,
  destinatari,
  adesso = new Date(),
}: {
  db: Db
  destinatari: string[]
  adesso?: Date
}): Promise<number | null> {
  try {
    const { data, error } = await db.rpc('notifiche_collegamenti_stato')
    if (error) {
      console.error('[avvisi] stato dei collegamenti:', error.code ?? 'errore')
      return null
    }
    const letto = statoSchema.safeParse(data)
    if (!letto.success) {
      console.error('[avvisi] stato dei collegamenti: forma inattesa')
      return null
    }
    let scritti = 0
    for (const avviso of avvisiCollegamenti(letto.data, adesso)) {
      const n = await registraAvviso({ db, destinatari, avviso })
      scritti += n ?? 0
    }
    return scritti
  } catch {
    console.error('[avvisi] stato dei collegamenti: errore')
    return null
  }
}

/**
 * The in-app alerts of the evening cron (1.42.0): the overdue instalments and
 * the connections. Each part on its own: one that fails is logged and never
 * stops the other, nor the emails after it.
 */
export async function creaAvvisiDellaSera({
  db,
  oggi,
  destinatari,
  adesso = new Date(),
}: {
  db: Db
  /** the day in Europe/Rome */
  oggi: string
  /** the active admins' profile ids */
  destinatari: string[]
  adesso?: Date
}) {
  const [rate, collegamenti] = await Promise.all([
    avvisaRateInRitardo(db, oggi),
    avvisaCollegamenti({ db, destinatari, adesso }),
  ])
  return { rate: rate ?? 'non riuscito', collegamenti: collegamenti ?? 'non riusciti' }
}
