import { describe, expect, it } from 'vitest'

import { GUIDE_CHIAVI, NON_IN_CHAT, ORDINE_CHIAVI } from '@/lib/impostazioni/chiavi'
import { AVVISO_SCADENZA_GIORNI, fraseScadePresto, statoToken } from '@/lib/instagram/stato-token'

const GIORNO = 86_400_000
const ADESSO = Date.parse('2026-10-16T10:00:00Z')

function testo(id: (typeof ORDINE_CHIAVI)[number]): string {
  const g = GUIDE_CHIAVI[id]
  return [g.aCosaServe, ...g.passi, g.doveIncollarla, g.comeCapireCheFunziona, g.seScade].join(' ')
}

describe('le guide di Chiavi e collegamenti (1.38.0)', () => {
  it('sei chiavi, ognuna con la sua guida completa', () => {
    expect(ORDINE_CHIAVI).toEqual(['instagram', 'messenger', 'fathom', 'calendario', 'anthropic', 'groq'])
    for (const id of ORDINE_CHIAVI) {
      const g = GUIDE_CHIAVI[id]
      expect(g.id).toBe(id)
      expect(g.passi.length, id).toBeGreaterThanOrEqual(3)
      for (const campo of [g.titolo, g.aCosaServe, g.doveIncollarla, g.comeCapireCheFunziona, g.seScade]) {
        expect(campo.trim().length, id).toBeGreaterThan(5)
      }
    }
    expect(NON_IN_CHAT).toContain('Non incollare mai una chiave in chat')
  })

  it('Instagram: il percorso di Meta e i tre permessi, come li ha detti Dany', () => {
    const t = testo('instagram')
    expect(t).toContain('developers.facebook.com › Le mie app › Alpha DM Reader')
    expect(t).toContain('Configurazione API con Business Login')
    expect(t).toContain('«1. Genera token d’accesso»')
    expect(t).toContain('@_danymonta')
    for (const permesso of ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_insights']) {
      expect(t).toContain(permesso)
    }
    expect(t).toContain('Standard access')
    expect(t).toContain('Analisi dell’app › Autorizzazioni e funzionalità')
    // the expiry: 60 days, the warning 7 days before
    expect(GUIDE_CHIAVI.instagram.seScade).toContain('60 giorni')
    expect(GUIDE_CHIAVI.instagram.seScade).toContain('7 giorni')
    expect(AVVISO_SCADENZA_GIORNI).toBe(7)
  })

  it('Messenger, Fathom, Claude e Groq: dove andare e dove incollare', () => {
    expect(testo('messenger')).toContain('Messenger › Impostazioni dell’API')
    expect(testo('fathom')).toContain('My Settings › API Access')
    // the calendar (1.76.0): the secret address, never the public one
    expect(testo('calendario')).toContain('Indirizzo segreto in formato iCal')
    expect(testo('calendario')).toContain('Rendi disponibile pubblicamente')
    expect(testo('fathom')).toContain('Generate Api Key')
    expect(GUIDE_CHIAVI.fathom.passi.join(' ')).toContain('Non serve nessun webhook')
    expect(GUIDE_CHIAVI.fathom.comeCapireCheFunziona).toContain('Fathom risponde con questa chiave.')
    const claude = testo('anthropic')
    expect(claude).toContain('console.anthropic.com › API Keys')
    expect(claude).toContain('Vercel › il progetto › Settings › Environment Variables')
    expect(claude).toContain('ANTHROPIC_API_KEY')
    expect(claude).toContain('Redeploy')
    const groq = testo('groq')
    expect(groq).toContain('console.groq.com › API Keys')
    expect(groq).toContain('ALFIRE_API_KEY')
    expect(groq).toContain('Redeploy')
    // Claude and Groq keys are never pasted in the app: only on Vercel
    expect(GUIDE_CHIAVI.anthropic.doveIncollarla).toContain('Solo su Vercel')
    expect(GUIDE_CHIAVI.groq.doveIncollarla).toContain('Solo su Vercel')
  })

  it('nessuna guida contiene qualcosa che somigli a una chiave vera', () => {
    for (const id of ORDINE_CHIAVI) {
      expect(testo(id), id).not.toMatch(/(sk-ant-|gsk_|EAA[A-Za-z0-9]{6}|IGAA)[A-Za-z0-9_-]{6,}/)
    }
  })
})

describe('statoToken: come sta il token di Instagram', () => {
  it('senza token non c’è niente da dire', () => {
    expect(statoToken({ presente: false, scadeIl: null, rifiutatoDaMeta: false, adesso: ADESSO })).toEqual({
      presente: false,
      scaduto: false,
      scadutoPerData: false,
      giorniAllaScadenza: null,
      scadePresto: false,
    })
  })

  it('valido: nessun avviso fino a 8 giorni, l’avviso da 7 giorni prima', () => {
    const conGiorni = (g: number) =>
      statoToken({ presente: true, scadeIl: new Date(ADESSO + g * GIORNO - 3_600_000).toISOString(), rifiutatoDaMeta: false, adesso: ADESSO })
    expect(conGiorni(50)).toMatchObject({ scaduto: false, scadePresto: false, giorniAllaScadenza: 50 })
    expect(conGiorni(8).scadePresto).toBe(false)
    expect(conGiorni(7)).toMatchObject({ scadePresto: true, giorniAllaScadenza: 7 })
    expect(conGiorni(1)).toMatchObject({ scadePresto: true, giorniAllaScadenza: 1 })
  })

  it('scaduto per data, o rifiutato da Meta anche prima della data: nessun avviso di “scade presto”', () => {
    const passato = statoToken({ presente: true, scadeIl: new Date(ADESSO - 3_600_000).toISOString(), rifiutatoDaMeta: false, adesso: ADESSO })
    expect(passato).toMatchObject({ scaduto: true, scadutoPerData: true, scadePresto: false })
    const rifiutato = statoToken({ presente: true, scadeIl: new Date(ADESSO + 5 * GIORNO).toISOString(), rifiutatoDaMeta: true, adesso: ADESSO })
    expect(rifiutato).toMatchObject({ scaduto: true, scadutoPerData: false, scadePresto: false })
    // a token that is not there is never "refused"
    expect(statoToken({ presente: false, scadeIl: null, rifiutatoDaMeta: true, adesso: ADESSO }).scaduto).toBe(false)
  })

  it('le parole', () => {
    expect(fraseScadePresto(1)).toBe('Scade tra 1 giorno')
    expect(fraseScadePresto(5)).toBe('Scade tra 5 giorni')
  })
})
