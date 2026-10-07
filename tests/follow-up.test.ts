import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  FOLLOW_UP,
  VENDITA_DA_REGISTRARE,
  chiedeVendita,
  dettaglioVendita,
  erroreFollowUpPrimaDellaCall,
  quandoFollowUp,
  quandoFollowUpDa,
  rigaFollowUpDi,
} from '@/lib/call/follow-up'
import { aggiungiGiorni, nomeGiorno, oggiRoma } from '@/lib/date'
import {
  GIORNI_AVANTI_CALL,
  GIORNI_INDIETRO_CALL_ADMIN,
  erroreFinestraFollowUp,
  erroreGiornoFollowUp,
  schemaFollowUp,
} from '@/lib/validation/call'
import { aggiornamentoDaEsito, esitoCallSchema, followUpEsito } from '@/lib/validation/esito'

// The follow-up call (Dany, 07/10/2026): "Follow-up" asks whether a follow-up
// call was booked; with a day and a time a new call is booked there
// (public.fissa_follow_up), without them the follow-up goes on by chat.
const call_id = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'
const oggi = oggiRoma()
const domani = aggiungiGiorni(oggi, 1)
const base = { call_id, esito: 'follow_up', qualificata: true, motivo: 'Deve parlarne con la moglie' } as const

describe('esito Follow-up: la call di follow-up nello schema condiviso', () => {
  it('senza giorno e ora è un follow-up in chat', () => {
    const v = esitoCallSchema.parse(base)
    expect(followUpEsito(v)).toBeNull()
  })

  it('con giorno e ora fissa la call di follow-up, e la call di partenza si aggiorna come sempre', () => {
    const v = esitoCallSchema.parse({ ...base, follow_up_data: domani, follow_up_ora: '18:00' })
    expect(followUpEsito(v)).toEqual({ data: domani, ora: '18:00' })
    // the follow-up's day is not a column of the first call
    expect(aggiornamentoDaEsito(v)).toEqual({
      stato: 'svolta',
      esito: 'follow_up',
      qualificata: true,
      obiezione_principale: 'Deve parlarne con la moglie',
    })
  })

  it('il giorno senza l’ora (o l’ora senza il giorno) si rifiuta, con le parole del database', () => {
    const senzaOra = esitoCallSchema.safeParse({ ...base, follow_up_data: domani })
    expect(senzaOra.success).toBe(false)
    expect(senzaOra.error?.issues[0]).toMatchObject({ path: ['follow_up_ora'], message: FOLLOW_UP.manca })
    const senzaGiorno = esitoCallSchema.safeParse({ ...base, follow_up_ora: '18:00' })
    expect(senzaGiorno.success).toBe(false)
    expect(senzaGiorno.error?.issues[0]).toMatchObject({ path: ['follow_up_data'], message: FOLLOW_UP.manca })
  })

  it('giorno e ora ben scritti', () => {
    for (const data of ['', '07/10/2026', '2026-02-30']) {
      expect(esitoCallSchema.safeParse({ ...base, follow_up_data: data, follow_up_ora: '18:00' }).success, data).toBe(false)
    }
    for (const ora of ['', '25:00', '18']) {
      expect(esitoCallSchema.safeParse({ ...base, follow_up_data: domani, follow_up_ora: ora }).success, ora).toBe(false)
    }
  })

  it('il motivo di non chiusura resta obbligatorio anche con la call di follow-up', () => {
    const r = esitoCallSchema.safeParse({ ...base, motivo: '  ', follow_up_data: domani, follow_up_ora: '18:00' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['motivo'])
  })

  it('una call persa non ha una call di follow-up', () => {
    for (const extra of [
      { follow_up_data: domani, follow_up_ora: '18:00' },
      { follow_up_data: domani },
      { follow_up_ora: '18:00' },
    ]) {
      const r = esitoCallSchema.safeParse({ ...base, esito: 'persa', ...extra })
      expect(r.success, JSON.stringify(extra)).toBe(false)
      expect(r.error?.issues[0]?.message).toBe(FOLLOW_UP.conPersa)
    }
    expect(esitoCallSchema.safeParse({ ...base, esito: 'persa' }).success).toBe(true)
  })
})

describe('la finestra della call di follow-up, per ruolo (come fissa_follow_up)', () => {
  it('il closer: da oggi in avanti, anche un’ora di oggi già passata', () => {
    const schema = schemaFollowUp(false)
    expect(schema.safeParse({ call_id, data: oggi, ora: '00:05' }).success).toBe(true)
    expect(schema.safeParse({ call_id, data: domani, ora: '18:00' }).success).toBe(true)
    const ieri = schema.safeParse({ call_id, data: aggiungiGiorni(oggi, -1), ora: '18:00' })
    expect(ieri.success).toBe(false)
    expect(ieri.error?.issues[0]).toMatchObject({ path: ['data'], message: FOLLOW_UP.soloAvanti })
  })

  it('l’admin registra anche una call di follow-up già fatta, fino a un anno indietro', () => {
    const schema = schemaFollowUp(true)
    expect(schema.safeParse({ call_id, data: aggiungiGiorni(oggi, -1), ora: '18:00' }).success).toBe(true)
    expect(schema.safeParse({ call_id, data: aggiungiGiorni(oggi, -GIORNI_INDIETRO_CALL_ADMIN), ora: '18:00' }).success).toBe(true)
    expect(erroreFinestraFollowUp(aggiungiGiorni(oggi, -GIORNI_INDIETRO_CALL_ADMIN - 1), true, oggi)).toBe(
      'Al massimo un anno indietro',
    )
  })

  it('al massimo 6 mesi avanti, per tutti', () => {
    for (const admin of [false, true]) {
      expect(erroreFinestraFollowUp(aggiungiGiorni(oggi, GIORNI_AVANTI_CALL), admin, oggi)).toBeNull()
      expect(erroreFinestraFollowUp(aggiungiGiorni(oggi, GIORNI_AVANTI_CALL + 1), admin, oggi)).toBe('Al massimo 6 mesi da oggi')
    }
  })

  it('giorno e ora obbligatori', () => {
    const r = schemaFollowUp(false).safeParse({ call_id, data: domani })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe(FOLLOW_UP.manca)
  })

  it('viene dopo la call di partenza', () => {
    expect(erroreFollowUpPrimaDellaCall('2026-10-08', '18:00', '2026-10-08', '17:59')).toBeNull()
    expect(erroreFollowUpPrimaDellaCall('2026-10-09', '09:00', '2026-10-08', '18:00')).toBeNull()
    const prima = 'La call di follow-up viene dopo la call di partenza, del 08/10/2026 alle 18:00: scegli un giorno e un\'ora dopo'
    expect(erroreFollowUpPrimaDellaCall('2026-10-08', '18:00', '2026-10-08', '18:00')).toBe(prima)
    expect(erroreFollowUpPrimaDellaCall('2026-10-07', '20:00', '2026-10-08', '18:00')).toBe(prima)
  })

  it('il controllo intero: prima la finestra di chi la fissa, poi dopo la call', () => {
    const ieri = aggiungiGiorni(oggi, -1)
    // the closer: yesterday is out of his window, whatever the first call
    expect(erroreGiornoFollowUp({ call_id, data: ieri, ora: '20:00' }, { giorno: ieri, ora: '18:00' }, false)).toBe(
      FOLLOW_UP.soloAvanti,
    )
    // the admin: yesterday evening after yesterday's call is fine, before it is not
    expect(erroreGiornoFollowUp({ call_id, data: ieri, ora: '20:00' }, { giorno: ieri, ora: '18:00' }, true)).toBeNull()
    expect(erroreGiornoFollowUp({ call_id, data: ieri, ora: '17:00' }, { giorno: ieri, ora: '18:00' }, true)).toMatch(
      /^La call di follow-up viene dopo la call di partenza/,
    )
    // the first call can't be read: the database says it
    expect(erroreGiornoFollowUp({ call_id, data: domani, ora: '18:00' }, null, false)).toBeNull()
  })
})

describe('le parole della call di follow-up', () => {
  it('il giorno sempre col suo nome, mai «domani»', () => {
    expect(quandoFollowUpDa('2026-10-08', '18:00', '2026-10-07')).toBe('giovedì 08/10 alle 18:00')
    expect(quandoFollowUpDa('2027-01-04', '09:30', '2026-10-07')).toBe('lunedì 04/01/2027 alle 09:30')
    expect(quandoFollowUpDa(domani, '18:00')).toBe(`${nomeGiorno(domani)} ${domani.slice(8, 10)}/${domani.slice(5, 7)} alle 18:00`)
    // from a timestamptz, in Europe/Rome (summer time: +2)
    expect(quandoFollowUp('2026-10-08T16:00:00Z', '2026-10-07')).toBe('giovedì 08/10 alle 18:00')
    expect(FOLLOW_UP.sceltaCall('giovedì 08/10 alle 18:00')).toBe('Follow-up · call giovedì 08/10 alle 18:00')
    expect(FOLLOW_UP.giaFissata('giovedì 08/10 alle 18:00')).toBe('Call di follow-up già fissata: giovedì 08/10 alle 18:00')
    expect(FOLLOW_UP.diCall('giovedì 08/10 alle 18:00')).toBe('Call di follow-up: giovedì 08/10 alle 18:00')
  })

  it('la call di follow-up dice di quale call è', () => {
    expect(rigaFollowUpDi({ programmata_il: '2026-09-29T17:00:00Z' }, '2026-10-07')).toBe(
      'Follow-up della call del 29/09 alle 19:00',
    )
    expect(rigaFollowUpDi(null, '2026-10-07')).toBe(FOLLOW_UP.dellaSenzaData)
  })

  it('il setter della vendita: il nome, se c’è', () => {
    expect(FOLLOW_UP.stessoSetter('Loris Setter')).toBe('Stesso lead e stesso setter: se chiude, la vendita resta di Loris Setter')
  })

  it('le frasi che dice anche il database sono le stesse, apostrofi compresi', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261007090000_call_di_follow_up.sql', import.meta.url), 'utf8')
    const letterale = (frase: string) => `'${frase.replace(/'/g, "''")}'`
    for (const frase of [
      FOLLOW_UP.manca,
      FOLLOW_UP.soloAvanti,
      FOLLOW_UP.soloSuFollowUp,
      FOLLOW_UP.chiPuo,
      FOLLOW_UP.altroCloser,
      FOLLOW_UP.closerNonAttivo,
    ]) {
      expect(sql, frase).toContain(letterale(frase))
    }
    // every «already has one» starts the same way: the server action knows not to offer booking it again
    expect(FOLLOW_UP.altroCloser.startsWith(FOLLOW_UP.giaPresente)).toBe(true)
    expect(sql.match(/'Questa call ha già la sua call di follow-up[^']*'/g)?.length).toBe(3)
    expect(sql).toContain(letterale(FOLLOW_UP.dopoLaCall('%')))
    expect(sql).toContain("'Al massimo 6 mesi da oggi'")
    expect(sql).toContain("'Al massimo un anno indietro'")
  })
})

describe('call chiusa senza vendita', () => {
  it('chiede la vendita solo a una call chiusa nell’app, senza la sua vendita', () => {
    expect(chiedeVendita({ esito: 'chiusa', importata: false, ha_vendita: false })).toBe(true)
    // public.call_ha_vendita: also a sale of the call that carries another closer
    expect(chiedeVendita({ esito: 'chiusa', importata: false, ha_vendita: true })).toBe(false)
    expect(chiedeVendita({ esito: 'follow_up', importata: false, ha_vendita: false })).toBe(false)
    expect(chiedeVendita({ esito: null, importata: false, ha_vendita: false })).toBe(false)
    // the sale was not read (a query without it, or a call the caller may not ask about): never asked
    expect(chiedeVendita({ esito: 'chiusa', importata: false })).toBe(false)
    expect(chiedeVendita({ esito: 'chiusa', importata: false, ha_vendita: null })).toBe(false)
  })

  it('mai alle call importate dal foglio delle call: le loro vendite vengono dall’Excel', () => {
    expect(chiedeVendita({ esito: 'chiusa', importata: true, ha_vendita: false })).toBe(false)
    // the mark not read: never asked
    expect(chiedeVendita({ esito: 'chiusa', ha_vendita: false })).toBe(false)
  })

  it('il segno è esplicito, mai l’autore che manca: elimina_persona lo svuota', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261007120000_vendita_della_call.sql', import.meta.url), 'utf8')
    expect(sql).toContain('add column importata boolean not null default false')
    const importazione = readFileSync(new URL('../scripts/import-prospect.ts', import.meta.url), 'utf8')
    expect(importazione).toContain('importata: true')
  })

  it('il nome dei bottoni comincia con le parole che si vedono (WCAG 2.5.3)', () => {
    expect(VENDITA_DA_REGISTRARE.nomeCollega('Mario Rossi').startsWith(VENDITA_DA_REGISTRARE.collega)).toBe(true)
    const nome = VENDITA_DA_REGISTRARE.nomeBottoneCollega('Mario Rossi', dettaglioVendita('Nuovo cliente', '07/10/2026', '1.500,00 €'))
    expect(nome.startsWith(VENDITA_DA_REGISTRARE.bottoneCollega)).toBe(true)
    // two sales of the same client have two names
    expect(nome).not.toBe(VENDITA_DA_REGISTRARE.nomeBottoneCollega('Mario Rossi', dettaglioVendita('Upsell', '07/10/2026', '300,00 €')))
    expect(
      VENDITA_DA_REGISTRARE.nomeApriVendita('Mario Rossi', 'x').startsWith(VENDITA_DA_REGISTRARE.apriVendita),
    ).toBe(true)
  })

  it('collegare una vendita: le frasi del database sono le stesse', () => {
    const sql = readFileSync(new URL('../supabase/migrations/20261007120000_vendita_della_call.sql', import.meta.url), 'utf8')
    expect(sql).toContain(`'${VENDITA_DA_REGISTRARE.soloAdmin.replace(/'/g, "''")}'`)
  })
})
