import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabaseFinto } from './helpers/supabase-finto'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { COLONNE_ELENCO } from '@/lib/marketing/elenco'
import { GRUPPI_STATUS } from '@/lib/marketing/etichette'
import {
  COLONNE_CONTENUTO,
  LetturaNonRiuscita,
  contaPerGruppo,
  leggiContenuto,
  leggiElenco,
  leggiProprietaContenuto,
} from '@/lib/marketing/letture'
import type { Db } from '@/lib/marketing/operazioni'

const ID = '7e1f3a2b-0000-4000-8000-000000000001'

let finto: ReturnType<typeof supabaseFinto>
let db: Db

beforeEach(() => {
  finto = supabaseFinto()
  db = finto.client as unknown as Db
})

describe('leggiElenco', () => {
  it('le proprietà soltanto, dalla Post Date più recente (senza data in fondo), col totale', async () => {
    const righe = [{ id: ID, nome: 'Trazioni' }]
    finto.risponde({ data: righe, count: 132 })
    expect(await leggiElenco(db, {}, 50)).toEqual({ righe, totale: 132 })
    expect(finto.query).toEqual([
      {
        tabella: 'marketing_contenuti',
        passi: [
          ['select', COLONNE_ELENCO, { count: 'exact', head: false }],
          ['order', 'post_date', { ascending: false, nullsFirst: false }],
          ['order', 'created_at', { ascending: false }],
          ['order', 'id'],
          ['limit', 50],
        ],
      },
    ])
    expect(COLONNE_ELENCO).not.toMatch(/messaggio|bozza|commenti|finale|created_by/)
  })

  it('i filtri della pagina, più le date della Post Date e i contenuti senza', async () => {
    finto.risponde({ data: [], count: 0 })
    await leggiElenco(
      db,
      {
        gruppo: 'in_progress',
        stato: 'to_be_edited',
        reel_type: 'education',
        formato: 'show_and_tell',
        tipo: 'reel',
        q: '50%_*\\',
        da: '2026-10-01',
        a: '2026-10-31',
      },
      10,
    )
    expect(finto.query[0].passi.slice(1, 8)).toEqual([
      ['in', 'stato', ['to_be_edited']],
      ['eq', 'reel_type', 'education'],
      ['eq', 'formato', 'show_and_tell'],
      ['eq', 'tipo', 'reel'],
      // every character literal: never ilike, where PostgREST reads * as %
      ['regexIMatch', 'nome', '***=50%_*\\'],
      ['gte', 'post_date', '2026-10-01'],
      ['lte', 'post_date', '2026-10-31'],
    ])

    finto.risponde({ data: [], count: 0 })
    await leggiElenco(db, { gruppo: 'to_do', senzaData: true }, 5)
    expect(finto.query[1].passi.slice(1, 3)).toEqual([
      ['in', 'stato', GRUPPI_STATUS.to_do],
      ['is', 'post_date', null],
    ])
  })

  it('il calendario legge giorno per giorno', async () => {
    finto.risponde({ data: [], count: 0 })
    await leggiElenco(db, { da: '2026-09-28', a: '2026-11-08' }, 500, 'giorni')
    expect(finto.query[0].passi.slice(3)).toEqual([
      ['order', 'post_date'],
      ['order', 'created_at'],
      ['order', 'id'],
      ['limit', 500],
    ])
  })

  it('una lettura che non riesce lancia LetturaNonRiuscita col codice, mai il messaggio di PostgREST', async () => {
    finto.risponde({ error: { code: '42501', message: 'Da Claude si usa solo il calendario dei contenuti.' } })
    const errore = await leggiElenco(db, {}, 50).catch((e: unknown) => e)
    expect(errore).toBeInstanceOf(LetturaNonRiuscita)
    expect(errore).toMatchObject({ codice: '42501', message: 'Impossibile caricare i contenuti' })
  })
})

describe('contaPerGruppo', () => {
  it('come i chip: ogni gruppo coi filtri che il suo link apre, le date comprese', async () => {
    finto.risponde({ count: 9 }, { count: 0 }, { count: 0 }, { count: 9 })
    expect(
      await contaPerGruppo(db, { stato: 'posted', reel_type: 'education', da: '2026-10-01', a: '2026-10-31' }),
    ).toEqual({ tutti: 9, to_do: 0, in_progress: 0, complete: 9 })
    expect(finto.query).toHaveLength(4)
    for (const q of finto.query) {
      expect(q.passi[0]).toEqual(['select', COLONNE_ELENCO, { count: 'exact', head: true }])
      expect(q.passi).toContainEqual(['eq', 'reel_type', 'education'])
      expect(q.passi).toContainEqual(['gte', 'post_date', '2026-10-01'])
      expect(q.passi).toContainEqual(['lte', 'post_date', '2026-10-31'])
    }
    const stati = finto.query.map((q) => q.passi.find(([m]) => m === 'in')?.[2])
    // "tutti" keeps the Status; a group chip drops a Status of another group
    expect(stati).toEqual([['posted'], GRUPPI_STATUS.to_do, GRUPPI_STATUS.in_progress, ['posted']])
  })

  it('un conteggio che non riesce lancia', async () => {
    finto.risponde({ count: 1 }, { error: { code: 'PGRST002', message: 'schema cache' } })
    await expect(contaPerGruppo(db, {})).rejects.toMatchObject({ name: 'LetturaNonRiuscita', codice: 'PGRST002' })
  })
})

describe('leggiContenuto', () => {
  it('le proprietà e le sezioni, mai chi l’ha creato', async () => {
    const riga = { id: ID, nome: 'Trazioni', messaggio: null, bozza: 'Hook:', commenti: null, finale: null }
    finto.risponde({ data: riga })
    expect(await leggiContenuto(db, ID)).toEqual(riga)
    expect(finto.query[0].passi).toEqual([['select', COLONNE_CONTENUTO], ['eq', 'id', ID], ['maybeSingle']])
    expect(COLONNE_CONTENUTO).toBe(`${COLONNE_ELENCO}, messaggio, bozza, commenti, finale, notion_page_id`)
    expect(COLONNE_CONTENUTO).not.toMatch(/created_by/)
  })

  it('un id che non è un id non arriva al database; un contenuto che RLS nasconde è null', async () => {
    expect(await leggiContenuto(db, 'non-un-id')).toBeNull()
    expect(finto.intatto()).toBe(true)
    finto.risponde({ data: null })
    expect(await leggiContenuto(db, ID)).toBeNull()
  })

  it('una lettura che non riesce lancia', async () => {
    finto.risponde({ error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    await expect(leggiContenuto(db, ID)).rejects.toMatchObject({
      name: 'LetturaNonRiuscita',
      codice: '57014',
      message: 'Impossibile caricare il contenuto',
    })
  })
})

describe('leggiProprietaContenuto', () => {
  it('le sole proprietà, come un elenco: mai le sezioni né chi l’ha creato', async () => {
    const riga = { id: ID, nome: 'Trazioni', updated_at: '2026-10-09T08:15:42.123456+00:00' }
    finto.risponde({ data: riga })
    expect(await leggiProprietaContenuto(db, ID)).toEqual(riga)
    expect(finto.query[0].passi).toEqual([['select', COLONNE_ELENCO], ['eq', 'id', ID], ['maybeSingle']])
    expect(COLONNE_ELENCO).not.toMatch(/messaggio|bozza|commenti|finale|created_by/)
  })

  it('un id che non è un id non arriva al database; una lettura che non riesce lancia', async () => {
    expect(await leggiProprietaContenuto(db, 'non-un-id')).toBeNull()
    expect(finto.intatto()).toBe(true)
    finto.risponde({ error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    await expect(leggiProprietaContenuto(db, ID)).rejects.toMatchObject({ name: 'LetturaNonRiuscita', codice: '57014' })
  })
})
