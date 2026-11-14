import { describe, expect, it } from 'vitest'

import { ERRORE_FISSA, messaggioErroreFissa, rigaLogErroreFissa } from '@/lib/call/errore-fissa'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'

describe('fissa_call: il messaggio quando la call non si fissa', () => {
  it('una regola di fissa_call resta com’è', () => {
    const e = { code: '22023', message: 'Il closer scelto non è attivo o non può chiudere' }
    expect(messaggioErroreFissa(e)).toBe('Il closer scelto non è attivo o non può chiudere')
  })

  it('la rete: senza codice o con fetch failed', () => {
    expect(messaggioErroreFissa({ code: '', message: 'TypeError: fetch failed' })).toBe(ERRORE_FISSA.rete)
    expect(messaggioErroreFissa({ message: 'fetch failed' })).toBe(ERRORE_FISSA.rete)
  })

  it('un database lento e un’app che si aggiorna', () => {
    expect(messaggioErroreFissa({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(ERRORE_FISSA.lento)
    expect(messaggioErroreFissa({ code: 'PGRST202', message: 'Could not find the function' })).toBe(ERRORE_FISSA.aggiornamento)
  })

  it('un rifiuto di RLS dice il codice, un rifiuto nostro resta il nostro', () => {
    const rls = messaggioErroreFissa({ code: '42501', message: 'new row violates row-level security policy for table "calls"' })
    expect(rls).toBe(ERRORE_FISSA.permesso('42501'))
    expect(rls).toContain('codice 42501')
    expect(messaggioErroreFissa({ code: '42501', message: 'Le call le fissano il setter e l\'admin' })).toBe(
      'Le call le fissano il setter e l\'admin',
    )
  })

  it('un vincolo sui dati e ogni altro errore dicono il codice', () => {
    expect(messaggioErroreFissa({ code: '23505', message: 'duplicate key value violates unique constraint "x"' })).toBe(
      ERRORE_FISSA.dati('23505'),
    )
    expect(messaggioErroreFissa({ code: 'PGRST116', message: 'JSON object requested' })).toBe(ERRORE_FISSA.altro('PGRST116'))
  })

  it('la riga del log: codice e parole del database, tagliate, mai altro', () => {
    const riga = rigaLogErroreFissa({ code: '23514', message: `new row for relation "calls" violates check constraint "c"\n${'x'.repeat(400)}` })
    expect(riga.startsWith('[fissa-call] non fissata: codice=23514 messaggio="new row for relation')).toBe(true)
    expect(riga.length).toBeLessThan(260)
    expect(rigaLogErroreFissa({ code: null, message: 'fetch failed' })).toContain('codice=rete')
  })

  it('ogni messaggio ha la sua traduzione in inglese', () => {
    for (const m of [
      ERRORE_FISSA.rete,
      ERRORE_FISSA.lento,
      ERRORE_FISSA.aggiornamento,
      ERRORE_FISSA.permesso('42501'),
      ERRORE_FISSA.dati('23505'),
      ERRORE_FISSA.altro('PGRST116'),
    ]) {
      const en = traduciErrore(m, 'en')
      expect(en).not.toBe(m)
      expect(en).not.toMatch(/[àèéìòù]/)
    }
    expect(traduciErrore(ERRORE_FISSA.altro('PGRST116'), 'en')).toContain('code PGRST116')
  })
})
