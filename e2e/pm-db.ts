import { expect, type Page } from '@playwright/test'

import { aggiungiGiorni, oggiRoma } from '../lib/date'
import { ID_ADMIN, ID_CLOSER, ID_SETTER, dbLocale } from './db'

/**
 * Fixtures of the time, notes and Gantt tests: one project with the three seed
 * users as members, two lists and four tasks around today. Local database and
 * secret key only (dbLocale refuses anything but 127.0.0.1). Deleting the
 * project removes its members, lists, tasks, time and notes (cascade).
 */

export type ProgettoDiProva = {
  id: string
  nome: string
  task: { brief: string; montaggio: string; revisione: string; idee: string }
}

async function ok<T>(richiesta: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await richiesta
  if (error) throw error
  if (data === null || data === undefined) throw new Error('Nessun dato')
  return data as NonNullable<T>
}

export async function creaProgettoDiProva(nome: string): Promise<ProgettoDiProva> {
  const db = dbLocale()
  const oggi = oggiRoma()
  const giorno = (n: number) => aggiungiGiorni(oggi, n)

  const reparto = await ok(db.from('pm_reparti').select('id').order('ordine').limit(1).single())
  const progetto = await ok(
    db
      .from('pm_progetti')
      .insert({ reparto_id: reparto.id, nome, data_inizio: giorno(-14), data_fine: giorno(30), created_by: ID_ADMIN })
      .select('id')
      .single(),
  )

  await ok(
    db
      .from('pm_membri')
      .insert([ID_ADMIN, ID_SETTER, ID_CLOSER].map((profile_id) => ({ progetto_id: progetto.id, profile_id, aggiunto_da: ID_ADMIN })))
      .select('id'),
  )

  const liste = await ok(
    db
      .from('pm_tasklist')
      .insert([
        { progetto_id: progetto.id, nome: 'Preparazione', ordine: 1, data_inizio: giorno(-10), data_fine: giorno(5), created_by: ID_ADMIN },
        // no dates of its own: the Gantt spans it over its tasks
        { progetto_id: progetto.id, nome: 'Consegna', ordine: 2, created_by: ID_ADMIN },
      ])
      .select('id, nome'),
  )
  const preparazione = liste.find((l) => l.nome === 'Preparazione')!
  const consegna = liste.find((l) => l.nome === 'Consegna')!

  const task = await ok(
    db
      .from('pm_task')
      .insert([
        {
          progetto_id: progetto.id,
          tasklist_id: preparazione.id,
          titolo: 'Brief e materiali',
          ordine: 1,
          stato: 'completato' as const,
          data_inizio: giorno(-10),
          scadenza: giorno(-6),
          created_by: ID_ADMIN,
        },
        {
          progetto_id: progetto.id,
          tasklist_id: preparazione.id,
          titolo: 'Montaggio',
          ordine: 2,
          stato: 'in_corso' as const,
          data_inizio: giorno(-3),
          scadenza: giorno(4),
          created_by: ID_ADMIN,
        },
        {
          progetto_id: progetto.id,
          tasklist_id: consegna.id,
          titolo: 'Revisione cliente',
          ordine: 1,
          scadenza: giorno(8),
          created_by: ID_ADMIN,
        },
        { progetto_id: progetto.id, titolo: 'Idee per il prossimo mese', ordine: 9, created_by: ID_ADMIN },
        // rows with different columns: the missing ones take their database default
      ], { defaultToNull: false })
      .select('id, titolo'),
  )
  const idDi = (titolo: string) => task.find((t) => t.titolo === titolo)!.id

  // "Montaggio" is the setter's: the others have nobody
  await ok(
    db
      .from('pm_task_assegnatari')
      .insert({ task_id: idDi('Montaggio'), profile_id: ID_SETTER, created_by: ID_ADMIN })
      .select('task_id'),
  )

  return {
    id: progetto.id,
    nome,
    task: {
      brief: idDi('Brief e materiali'),
      montaggio: idDi('Montaggio'),
      revisione: idDi('Revisione cliente'),
      idee: idDi('Idee per il prossimo mese'),
    },
  }
}

/** A timer started "on another device": a running entry written straight to the database. */
export async function avviaTimerAltrove(profileId: string, progettoId: string, minutiFa: number) {
  const db = dbLocale()
  // one running timer per person: stop any left over first
  await db.from('pm_tempo').delete().eq('profile_id', profileId).is('fine', null).not('inizio', 'is', null)
  await ok(
    db
      .from('pm_tempo')
      .insert({
        profile_id: profileId,
        progetto_id: progettoId,
        data: oggiRoma(),
        inizio: new Date(Date.now() - minutiFa * 60_000).toISOString(),
      })
      .select('id')
      .single(),
  )
}

/**
 * Stops a timer left running by avviaTimerAltrove: the running entry is
 * removed, so no minutes are logged and the seed data stay as they were.
 */
export async function fermaTimerAltrove(profileId: string) {
  const { error } = await dbLocale().from('pm_tempo').delete().eq('profile_id', profileId).is('fine', null).not('inizio', 'is', null)
  if (error) throw error
}

/** Removes the test projects and everything in them. */
export async function pulisciProgetti(prefisso: string) {
  const { error } = await dbLocale().from('pm_progetti').delete().like('nome', `${prefisso}%`)
  if (error) throw error
}

/**
 * After a navigation: wait until streaming is done. A suspended segment first
 * arrives in a hidden <div> and React reveals it a moment later, so for a few
 * hundred ms the page content exists twice in the DOM.
 */
export async function attendiPagina(page: Page) {
  await expect(page.locator('div[hidden][id^="S:"]')).toHaveCount(0, { timeout: 10_000 })
}
