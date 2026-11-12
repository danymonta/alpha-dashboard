import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ha, supabaseFinto, type Chiamata, type RispostaFinta } from './helpers/supabase-finto-mcp'

let rispondi: (c: Chiamata) => RispostaFinta
let fake: ReturnType<typeof supabaseFinto>

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/pm', () => ({ negaSeNonPm: vi.fn(async () => null) }))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => null) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake.client) }))

import { eliminaModello, eliminaVoce } from '@/app/(app)/settings/progetti/actions'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'

/**
 * The template «Onboarding cliente» in Impostazioni › Progetti (1.77.0): the wizard adds
 * its list to every client's project and recognises each task by its key, and the
 * database has no guard on the template's rows. So the editor renames them and never
 * deletes them; «Nuovo progetto» does not offer the template.
 */

const ID = '0b0a0000-0000-4000-8000-000000000051'

beforeEach(() => {
  rispondi = () => ({ data: null })
  fake = supabaseFinto((c) => rispondi(c))
})

const eliminazioni = () => fake.chiamate.filter((c) => ha(c, 'delete'))

describe('le attività del modello dell’onboarding', () => {
  it('una con la chiave dell’onboarding non si elimina: lo dice e non tocca niente', async () => {
    rispondi = (c) => (ha(c, 'delete') ? { data: [{ modello_id: ID }] } : { data: { chiave_onboarding: 'call_onboarding' } })
    const esito = await eliminaVoce({ id: ID })
    expect(esito.ok).toBe(false)
    if (!esito.ok) {
      expect(esito.errore).toContain('Le attività dell’onboarding non si eliminano')
      expect(traduciErroreProgetti(esito.errore, 'en')).toBe(
        'The onboarding tasks cannot be deleted: the path recognises them by their key. You can change their title.',
      )
    }
    expect(eliminazioni()).toEqual([])
  })

  it('un’attività di un altro modello, o aggiunta a mano a quello dell’onboarding, si elimina come sempre', async () => {
    rispondi = (c) => (ha(c, 'delete') ? { data: [{ modello_id: ID }] } : { data: { chiave_onboarding: null } })
    expect(await eliminaVoce({ id: ID })).toEqual({ ok: true })
    expect(eliminazioni().map((c) => c.nome)).toEqual(['pm_modelli_voci'])
  })

  it('prima della migration la colonna non c’è: la lettura non risponde e l’eliminazione va come prima', async () => {
    rispondi = (c) =>
      ha(c, 'delete')
        ? { data: [{ modello_id: ID }] }
        : { error: { code: '42703', message: 'column pm_modelli_voci.chiave_onboarding does not exist' } }
    expect(await eliminaVoce({ id: ID })).toEqual({ ok: true })
  })
})

describe('il modello dell’onboarding', () => {
  it('non si elimina', async () => {
    rispondi = (c) => (ha(c, 'delete') ? { data: [{ id: ID }] } : { data: { per_onboarding: true } })
    const esito = await eliminaModello({ id: ID })
    expect(esito.ok).toBe(false)
    if (!esito.ok) {
      expect(esito.errore).toContain('Il modello dell’onboarding non si elimina')
      expect(traduciErroreProgetti(esito.errore, 'en')).toContain('The onboarding template cannot be deleted')
    }
    expect(eliminazioni()).toEqual([])
  })

  it('gli altri modelli si eliminano come sempre', async () => {
    rispondi = (c) => (ha(c, 'delete') ? { data: [{ id: ID }] } : { data: { per_onboarding: false } })
    expect(await eliminaModello({ id: ID })).toEqual({ ok: true })
    expect(eliminazioni().map((c) => c.nome)).toEqual(['pm_modelli'])
  })

  it('«Nuovo progetto» non lo offre, e regge anche prima della migration', () => {
    const pagina = readFileSync(join(process.cwd(), 'app/(app)/progetti/page.tsx'), 'utf8')
    expect(pagina).toContain(".eq('per_onboarding', false)")
    expect(pagina).toContain("=== '42703'")
    expect(pagina).toContain('creatore ? modelliPerNuovoProgetto(supabase)')
  })
})
