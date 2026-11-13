import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { frasiAnteprima } from '@/lib/eliminazione'
import { LINGUE } from '@/lib/i18n/lingua'
import { NOTIFICHE } from '@/lib/i18n/testi/notifiche'
import { ERRORI_ONBOARDING_NOTI, ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import { SHELL } from '@/lib/i18n/testi/shell'
import { ERRORI_ONBOARDING } from '@/lib/validation/onboarding'

/**
 * The words of the onboarding in the two languages (1.77.0). The keys and the shapes are
 * held together by tests/i18n-chiavi.test.ts (every dictionary of lib/i18n/testi); here
 * the rules of this area: every fixed message has its English, the database's own ones
 * included, and no word breaks the rules of the interface (no long dash, no emoji).
 */

function migration(nome: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', nome), 'utf8')
}

/** Every message a function of the file raises with one of our codes, as Postgres says it (''' -> '). */
function messaggiSollevati(sql: string): string[] {
  const trovati = [...sql.matchAll(/raise exception '((?:[^']|'')+)'\s+using errcode = '(22023|42501)'/g)]
  return [...new Set(trovati.map((m) => m[1].replace(/''/g, "'")))]
}

/** Every text of a dictionary, with the functions called on plain arguments. */
function testi(valore: unknown, fuori: string[] = []): string[] {
  if (typeof valore === 'string') fuori.push(valore)
  else if (typeof valore === 'function') {
    const argomenti = Array.from({ length: valore.length }, (_, i) => (i === 0 ? 'Mario' : 'testo'))
    const numeri = Array.from({ length: valore.length }, () => 2)
    for (const prova of [argomenti, numeri]) {
      try {
        const esito = (valore as (...a: unknown[]) => unknown)(...prova)
        if (typeof esito === 'string') fuori.push(esito)
      } catch {
        // a function that wants other arguments: its template is checked by the other call
      }
    }
  } else if (Array.isArray(valore)) valore.forEach((v) => testi(v, fuori))
  else if (valore && typeof valore === 'object') Object.values(valore).forEach((v) => testi(v, fuori))
  return fuori
}

describe('gli errori fissi dell’onboarding in inglese', () => {
  it('ogni messaggio degli schemi e del nucleo ha la sua traduzione', () => {
    for (const [chiave, messaggio] of Object.entries(ERRORI_ONBOARDING)) {
      const tradotto = traduciErroreOnboarding(messaggio, 'en')
      expect(tradotto, chiave).not.toBe(messaggio)
      expect(tradotto.length, chiave).toBeGreaterThan(5)
    }
  })

  it('ogni messaggio che le funzioni dell’avvio e del gate sollevano ha la sua traduzione', () => {
    const sollevati = messaggiSollevati(migration('20261108090200_onboarding_avvio_gate.sql'))
    // the functions of the file: start, wizard, confirm, consent, revoke, reactivate, regenerate, people in charge
    expect(sollevati.length).toBeGreaterThanOrEqual(25)
    const mancano = sollevati.filter((m) => !ERRORI_ONBOARDING_NOTI.includes(m))
    expect(mancano).toEqual([])
    for (const m of sollevati) expect(traduciErroreOnboarding(m, 'en'), m).not.toBe(m)
  })

  it('anche quello del token, della migration dei dati', () => {
    const sollevati = messaggiSollevati(migration('20261108090000_onboarding_dati.sql'))
    expect(sollevati).toContain("Il token non corrisponde all'invito")
    for (const m of sollevati) expect(traduciErroreOnboarding(m, 'en'), m).not.toBe(m)
  })

  it('in italiano il messaggio resta com’è, e uno sconosciuto resta com’è in tutte e due le lingue', () => {
    expect(traduciErroreOnboarding(ERRORI_ONBOARDING.giaAvviato, 'it')).toBe(ERRORI_ONBOARDING.giaAvviato)
    expect(traduciErroreOnboarding('Una frase mai vista', 'en')).toBe('Una frase mai vista')
    // nothing to say stays nothing, as the other areas do (traduciErrore)
    expect(traduciErroreOnboarding('', 'en')).toBe('')
    expect(traduciErroreOnboarding(null, 'en')).toBeUndefined()
    expect(traduciErroreOnboarding(undefined, 'it')).toBeUndefined()
  })

  it('la schermata «Vendita» risponde con le frasi delle vendite: si traducono come lì', () => {
    expect(traduciErroreOnboarding('Controlla i campi evidenziati.', 'en')).toBe('Check the highlighted fields.')
    expect(traduciErroreOnboarding('Sessione scaduta. Rientra e riprova.', 'en')).toBe('Session expired. Sign in again and retry.')
    expect(traduciErroreOnboarding('Questa call ha già una vendita registrata.', 'en')).toBe(
      'This call already has a recorded sale.',
    )
    expect(traduciErroreOnboarding('Al massimo 80 caratteri', 'en')).toBe('80 characters at most')
  })

  it('le frasi con l’apostrofo del database e quelle dell’app sono due chiavi diverse, tutte e due tradotte', () => {
    expect(traduciErroreOnboarding("L'onboarding parte solo da una vendita a un nuovo cliente.", 'en')).toBe(
      'The onboarding starts only from a sale to a new client.',
    )
    expect(traduciErroreOnboarding(ERRORI_ONBOARDING.soloNuovo, 'en')).toBe('The onboarding starts only from a sale to a new client.')
    expect(traduciErroreOnboarding("Scegli il responsabile dell'onboarding.", 'en')).toBe(
      'Choose the person responsible for the onboarding.',
    )
  })
})

describe('le parole dell’interfaccia', () => {
  it('nessun trattino lungo e nessuna emoji, in nessuna delle due lingue', () => {
    for (const lingua of LINGUE) {
      for (const testo of testi(ONBOARDING[lingua])) {
        expect(testo, `${lingua}: ${testo}`).not.toMatch(/[—–]/)
        expect(testo, `${lingua}: ${testo}`).not.toMatch(/\p{Extended_Pictographic}/u)
      }
    }
    for (const messaggio of Object.values(ERRORI_ONBOARDING)) expect(messaggio).not.toMatch(/[—–]/)
  })

  it('in italiano l’apostrofo è quello tipografico, mai quello dritto', () => {
    for (const testo of testi(ONBOARDING.it)) expect(testo, testo).not.toMatch(/[a-zà-ù]'[a-zà-ù]/i)
    for (const messaggio of Object.values(ERRORI_ONBOARDING)) expect(messaggio, messaggio).not.toMatch(/[a-zà-ù]'[a-zà-ù]/i)
  })

  it('le frasi del disegno, parola per parola', () => {
    const t = ONBOARDING.it
    expect(t.titolo).toBe('Onboarding')
    expect(t.nuovoCliente).toBe('Nuovo cliente')
    expect(t.avviaOnboarding).toBe('Avvia onboarding')
    expect(t.wizard.passi).toMatchObject({ cliente: 'Cliente', vendita: 'Vendita', team: 'Team' })
    expect(t.wizard.fine.titolo('Tommaso')).toBe('Onboarding avviato per Tommaso')
    expect(t.wizard.fine.inAttesa).toBe('Il link si attiva appena registri il pagamento')
    expect(t.wizard.fine.attivo).toBe('Pagamento confermato')
    expect(t.wizard.fine.nonAperto).toBe(
      'L’area clienti è chiusa: il link funziona solo se segni il cliente come cliente di prova.',
    )
    expect(t.link.nonAperto).toBe(t.wizard.fine.nonAperto)
    expect(t.link.confermaPagamento.bottone).toBe('Conferma pagamento')
    expect(t.link.consenso.bottone).toBe('Registra il consenso del genitore')
    expect(t.link.rigenera.bottone).toBe('Rigenera link')
    expect(t.link.revoca.bottone).toBe('Revoca')
    expect(t.link.riattiva.bottone).toBe('Riattiva')
    expect(t.link.copiaLink).toBe('Copia link')
    expect(t.link.copiaMessaggio).toBe('Copia il messaggio')
    expect(t.apriScheda).toBe('Apri la scheda')
    expect(t.apriProgetto).toBe('Apri il progetto')
    expect(t.agganci.nuovoCliente).toBe('Nuovo cliente')
    expect(t.agganci.soloVendita).toBe('Registra solo la vendita')
    expect(t.impostazioni.titolo).toBe('Onboarding')
  })

  it('«Conferma pagamento» dice che non registra nessun incasso', () => {
    expect(ONBOARDING.it.link.confermaPagamento.testo).toContain('senza registrare nessun incasso')
    expect(ONBOARDING.en.link.confermaPagamento.testo).toContain('without recording any payment')
  })

  it('i tre incarichi hanno un nome nelle due lingue', () => {
    expect(ONBOARDING.it.incarichi).toMatchObject({ coach: 'Coach', revisore: 'Revisore video', responsabile: 'Responsabile' })
    expect(ONBOARDING.en.incarichi).toMatchObject({ coach: 'Coach', revisore: 'Video reviewer', responsabile: 'Responsible' })
  })
})

describe('la notifica, il menu e l’eliminazione', () => {
  it('la notifica del pagamento confermato: tipo «Onboarding», bottone «Apri l’onboarding»', () => {
    expect(NOTIFICHE.it.tipi.onboarding_pagamento).toBe('Onboarding')
    expect(NOTIFICHE.en.tipi.onboarding_pagamento).toBe('Onboarding')
    expect(NOTIFICHE.it.link.onboarding).toBe('Apri l’onboarding')
    expect(NOTIFICHE.en.link.onboarding).toBe('Open the onboarding')
  })

  it('la voce del menu ha la sua etichetta nelle due lingue', () => {
    expect(SHELL.it.voci.Onboarding).toBe('Onboarding')
    expect(SHELL.en.voci.Onboarding).toBe('Onboarding')
  })

  it('eliminare un cliente con un onboarding lo dice, e solo allora', () => {
    const con = frasiAnteprima('cliente', { vendite: 1, rate: 3, incassato: '0,00 €', progetti: 1, cartella_drive: 0, onboarding: true })
    expect(con).toContain('Si elimina anche il suo onboarding: link, passi e registro.')
    const senza = frasiAnteprima('cliente', { vendite: 1, rate: 3, incassato: '0,00 €', progetti: 1, cartella_drive: 0, onboarding: false })
    expect(senza.join(' ')).not.toContain('onboarding')
    // a preview from before the migration has no key at all
    expect(frasiAnteprima('cliente', { vendite: 1, rate: 3 }).join(' ')).not.toContain('onboarding')
    expect(frasiAnteprima('cliente', { vendite: 0, rate: 0, onboarding: true }, 'en')).toContain(
      'Their onboarding goes too: link, steps and log.',
    )
  })

  it('la chiave arriva dall’anteprima del database, per il cliente', () => {
    const sql = migration('20261108090100_onboarding_progetto.sql')
    const cliente = sql.slice(sql.indexOf("when 'cliente' then"), sql.indexOf("when 'vendita' then"))
    expect(cliente).toContain("'onboarding', (")
  })
})
