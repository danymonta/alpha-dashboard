import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabaseFinto } from './helpers/supabase-finto'

vi.mock('server-only', () => ({}))
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

import { creaOpzione, eliminaOpzione, modificaOpzione } from '@/lib/marketing/operazioni-opzioni'
import type { Db } from '@/lib/marketing/operazioni'

const ID = '7e1f3a2b-0000-4000-8000-0000000000aa'
const AREA = [['/marketing', 'layout']]

function riga(altro: Record<string, unknown> = {}) {
  return { id: ID, campo: 'reel_type', valore: 'case_study', nome: 'Case study', colore: 'orange', ordine: 60, ...altro }
}

let finto: ReturnType<typeof supabaseFinto>
let db: Db

beforeEach(() => {
  finto = supabaseFinto()
  db = finto.client as unknown as Db
  cache.revalidatePath.mockClear()
})

describe('creaOpzione', () => {
  it('chiama la funzione del database (codice, ordine e colore sono suoi) e dà l’etichetta creata', async () => {
    finto.risponde({ data: riga() })
    expect(await creaOpzione(db, { campo: 'reel_type', nome: '  Case   study ' })).toEqual({
      ok: true,
      opzione: { id: ID, campo: 'reel_type', valore: 'case_study', nome: 'Case study', colore: 'orange', ordine: 60 },
    })
    expect(finto.rpc).toEqual([{ nome: 'crea_opzione_marketing', args: { p_campo: 'reel_type', p_nome: 'Case study' } }])
    expect(cache.revalidatePath.mock.calls).toEqual(AREA)
  })

  it('con un colore detto lo manda; senza, non manda niente', async () => {
    finto.risponde({ data: riga({ colore: 'pink' }) })
    await creaOpzione(db, { campo: 'formato', nome: 'Meme', colore: 'pink' })
    expect(finto.rpc[0].args).toEqual({ p_campo: 'formato', p_nome: 'Meme', p_colore: 'pink' })
  })

  it('un nome non valido si ferma prima del database', async () => {
    expect(await creaOpzione(db, { campo: 'reel_type', nome: '   ' })).toEqual({ ok: false, errore: 'Scrivi il nome dell’etichetta.' })
    expect(await creaOpzione(db, { campo: 'reel_type', nome: 'a'.repeat(61) })).toEqual({
      ok: false,
      errore: 'Il nome è lungo al massimo 60 caratteri.',
    })
    expect(await creaOpzione(db, { campo: 'stato', nome: 'X' })).toEqual({ ok: false, errore: 'Campo non valido.' })
    expect(finto.intatto()).toBe(true)
    expect(cache.revalidatePath).not.toHaveBeenCalled()
  })

  it('un nome già usato, un permesso negato e un errore qualsiasi dicono parole umane', async () => {
    finto.risponde({ error: { code: '23505', message: 'duplicate key value violates unique constraint "marketing_opzioni_nome_unico"' } })
    expect(await creaOpzione(db, { campo: 'reel_type', nome: 'Education' })).toEqual({
      ok: false,
      errore: 'C’è già un’etichetta con questo nome.',
    })
    finto.risponde({ error: { code: '42501', message: 'new row violates row-level security policy for table "marketing_opzioni"' } })
    expect(await creaOpzione(db, { campo: 'reel_type', nome: 'Altro' })).toEqual({
      ok: false,
      errore: 'Le etichette sono dell’area Marketing.',
    })
    finto.risponde({ error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    const esito = await creaOpzione(db, { campo: 'reel_type', nome: 'Altro' })
    expect(esito.ok).toBe(false)
    expect(JSON.stringify(esito)).not.toContain('statement timeout')
  })
})

describe('modificaOpzione', () => {
  it('rinomina e ricolora in una scrittura sola, per id: mai il codice né il campo', async () => {
    finto.risponde({ data: riga({ nome: 'Caso studio', colore: 'green' }) })
    expect(await modificaOpzione(db, { id: ID, nome: ' Caso   studio ', colore: 'green', valore: 'altro', campo: 'formato' })).toEqual({
      ok: true,
      opzione: { id: ID, campo: 'reel_type', valore: 'case_study', nome: 'Caso studio', colore: 'green', ordine: 60 },
    })
    expect(finto.passi('update')).toEqual([[{ nome: 'Caso studio', colore: 'green' }]])
    expect(finto.passi('eq')).toEqual([['id', ID]])
    expect(cache.revalidatePath.mock.calls).toEqual(AREA)
  })

  it('il solo colore non tocca il nome', async () => {
    finto.risponde({ data: riga({ colore: 'red' }) })
    await modificaOpzione(db, { id: ID, colore: 'red' })
    expect(finto.passi('update')).toEqual([[{ colore: 'red' }]])
  })

  it('un’etichetta eliminata nel frattempo lo dice; un nome già usato anche', async () => {
    finto.risponde({ data: null })
    expect(await modificaOpzione(db, { id: ID, colore: 'red' })).toEqual({ ok: false, errore: 'Questa etichetta non c’è più.' })
    finto.risponde({ error: { code: '23505', message: 'duplicate key' } })
    expect(await modificaOpzione(db, { id: ID, nome: 'Education' })).toEqual({
      ok: false,
      errore: 'C’è già un’etichetta con questo nome.',
    })
  })

  it('senza niente da cambiare, o con un id che non è un id, non arriva al database', async () => {
    expect(await modificaOpzione(db, { id: ID })).toEqual({ ok: false, errore: 'Dimmi cosa cambiare: il nome o il colore.' })
    expect(await modificaOpzione(db, { id: 'x', nome: 'A' })).toEqual({ ok: false, errore: 'Etichetta non valida.' })
    expect(finto.intatto()).toBe(true)
  })
})

describe('eliminaOpzione', () => {
  it('elimina per id e dice che è andata; i contenuti li svuota il database', async () => {
    finto.risponde({ data: [{ id: ID }] })
    expect(await eliminaOpzione(db, { id: ID })).toEqual({ ok: true })
    expect(finto.passi('delete')).toHaveLength(1)
    expect(finto.passi('eq')).toEqual([['id', ID]])
    // only the label: nothing is written on the contents from here (the foreign key empties them)
    expect(finto.query.map((q) => q.tabella)).toEqual(['marketing_opzioni'])
    expect(cache.revalidatePath.mock.calls).toEqual(AREA)
  })

  it('nessuna riga eliminata: c’era già sparita (o non è tua)', async () => {
    finto.risponde({ data: [] })
    expect(await eliminaOpzione(db, { id: ID })).toEqual({ ok: false, errore: 'Questa etichetta non c’è più.' })
  })

  it('un id che non è un id non arriva al database', async () => {
    expect(await eliminaOpzione(db, { id: 'x' })).toEqual({ ok: false, errore: 'Etichetta non valida.' })
    expect(finto.intatto()).toBe(true)
  })
})
