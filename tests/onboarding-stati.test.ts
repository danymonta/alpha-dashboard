import { describe, expect, it } from 'vitest'

import { LINGUE } from '@/lib/i18n/lingua'
import { MOTIVI_AUTOMATICI, ONBOARDING, motivoInLingua, titoloPasso } from '@/lib/i18n/testi/onboarding'
import {
  GRUPPI_LISTA,
  STATI_ONBOARDING,
  TONO_STATO,
  azioniLink,
  daQuando,
  dettaglioStato,
  etichettaStato,
  eventoInParole,
  gruppoOnboarding,
  incarichiPredefiniti,
  nomeCliente,
  perGruppo,
  statoOnboarding,
  type StatoRiga,
} from '@/lib/onboarding/stati'
import { STATI_INVITO, STATI_PASSO, STATI_PERCORSO } from '@/lib/validation/onboarding'

/**
 * The onboarding in words (1.77.0): the state the admin reads, the group of the list,
 * what the card offers, the lines of the log. Rows as public.v_onboarding gives them.
 */

const INVITO = '0b0a0000-0000-4000-8000-000000000021'

function riga(campi: Partial<StatoRiga> = {}): StatoRiga {
  return {
    invito_id: INVITO,
    invito_stato: 'in_attesa_pagamento',
    percorso_stato: 'in_attesa',
    minorenne: false,
    consenso_genitore_il: null,
    passo_attore: 'cliente',
    passo_stato: 'bloccato',
    ...campi,
  }
}

describe('lo stato in parole', () => {
  it('in attesa di pagamento finché nessuno paga o conferma', () => {
    expect(statoOnboarding(riga(), false)).toBe('in_attesa_pagamento')
    expect(etichettaStato('in_attesa_pagamento')).toBe('In attesa di pagamento')
    expect(dettaglioStato('in_attesa_pagamento')).toBe('Il link si attiva appena registri il pagamento.')
  })

  it('un minorenne senza il consenso del genitore aspetta quello, pagato o no', () => {
    expect(statoOnboarding(riga({ minorenne: true }), false)).toBe('in_attesa_consenso')
    expect(statoOnboarding(riga({ minorenne: true }), true)).toBe('in_attesa_consenso')
    expect(etichettaStato('in_attesa_consenso')).toBe('In attesa del consenso del genitore')
    // with the consent he waits for the payment like everyone
    expect(statoOnboarding(riga({ minorenne: true, consenso_genitore_il: '2026-11-12T09:00:00+00:00' }), false)).toBe(
      'in_attesa_pagamento',
    )
  })

  it('un link attivo è «Pagamento confermato» finché l’area clienti è chiusa, poi aspetta la registrazione', () => {
    expect(statoOnboarding(riga({ invito_stato: 'attivo' }), false)).toBe('pronto')
    expect(etichettaStato('pronto')).toBe('Pagamento confermato')
    expect(dettaglioStato('pronto')).toBe('Onboarding pronto: il link si apre con l’area clienti.')
    expect(statoOnboarding(riga({ invito_stato: 'attivo' }), true)).toBe('in_attesa_registrazione')
    expect(etichettaStato('in_attesa_registrazione')).toBe('In attesa di registrazione')
  })

  it('scaduto e revocato vengono dalla view, così come sono', () => {
    expect(statoOnboarding(riga({ invito_stato: 'scaduto' }), true)).toBe('scaduto')
    expect(statoOnboarding(riga({ invito_stato: 'revocato', percorso_stato: 'sospeso' }), true)).toBe('revocato')
    expect(etichettaStato('revocato')).toBe('Link revocato')
  })

  it('con il link usato il cliente è in corso, o sospeso', () => {
    expect(statoOnboarding(riga({ invito_stato: 'usato', percorso_stato: 'in_corso' }), true)).toBe('in_corso')
    expect(statoOnboarding(riga({ invito_stato: 'usato', percorso_stato: 'sospeso' }), true)).toBe('sospeso')
  })

  it('un percorso completato vince su tutto', () => {
    for (const invito_stato of STATI_INVITO) {
      expect(statoOnboarding(riga({ invito_stato, percorso_stato: 'completato' }), true), invito_stato).toBe('completato')
    }
  })

  it('senza un link la riga lo dice, senza inventare uno stato', () => {
    expect(statoOnboarding(riga({ invito_id: null, invito_stato: null }), false)).toBe('senza_link')
    expect(statoOnboarding(riga({ invito_id: null, invito_stato: null, percorso_stato: 'sospeso' }), false)).toBe('sospeso')
  })

  it('ogni combinazione della view ha uno stato, con le sue parole nelle due lingue', () => {
    for (const invito_stato of [...STATI_INVITO, null]) {
      for (const percorso_stato of STATI_PERCORSO) {
        for (const aperto of [true, false]) {
          for (const minorenne of [true, false, null]) {
            const stato = statoOnboarding(riga({ invito_stato, percorso_stato, minorenne }), aperto)
            expect(STATI_ONBOARDING).toContain(stato)
          }
        }
      }
    }
    for (const lingua of LINGUE) {
      for (const stato of STATI_ONBOARDING) {
        expect(etichettaStato(stato, lingua).length, `${lingua} ${stato}`).toBeGreaterThan(3)
        expect(dettaglioStato(stato, lingua).length, `${lingua} ${stato}`).toBeGreaterThan(10)
        expect(TONO_STATO[stato]).toBeTruthy()
      }
    }
    expect(etichettaStato('in_attesa_pagamento', 'en')).toBe('Waiting for the payment')
  })

  it('lo stato del pagamento non compare mai come importo', () => {
    for (const lingua of LINGUE) {
      const parole = JSON.stringify([ONBOARDING[lingua].stati, ONBOARDING[lingua].statiDettaglio])
      expect(parole).not.toMatch(/[€$]|\d+[.,]\d{2}/)
    }
  })
})

describe('i gruppi della lista', () => {
  it('prima della registrazione aspetta: pagamento, consenso, link attivo', () => {
    expect(gruppoOnboarding(riga())).toBe('attesa')
    expect(gruppoOnboarding(riga({ minorenne: true }))).toBe('attesa')
    expect(gruppoOnboarding(riga({ invito_stato: 'attivo' }))).toBe('attesa')
  })

  it('un link revocato o scaduto, o un percorso sospeso, è fermo: non aspetta il pagamento', () => {
    expect(gruppoOnboarding(riga({ invito_stato: 'scaduto' }))).toBe('fermi')
    expect(gruppoOnboarding(riga({ invito_stato: 'revocato', percorso_stato: 'sospeso' }))).toBe('fermi')
    expect(gruppoOnboarding(riga({ invito_stato: 'usato', percorso_stato: 'sospeso' }))).toBe('fermi')
  })

  it('«Conferma pagamento» non si offre a un minorenne il cui pagamento c’è già', () => {
    expect(azioniLink({ ...riga({ minorenne: true }), pagamento_confermato: true }, false).confermaPagamento).toBe(false)
    expect(azioniLink({ ...riga({ minorenne: true }), pagamento_confermato: false }, false).confermaPagamento).toBe(true)
  })

  it('in corso: tocca al cliente quando il passo è suo, a noi quando è del team o aspetta una verifica', () => {
    const inCorso = (campi: Partial<StatoRiga>) => riga({ invito_stato: 'usato', percorso_stato: 'in_corso', ...campi })
    expect(gruppoOnboarding(inCorso({ passo_attore: 'cliente', passo_stato: 'disponibile' }))).toBe('cliente')
    expect(gruppoOnboarding(inCorso({ passo_attore: 'cliente', passo_stato: 'in_corso' }))).toBe('cliente')
    expect(gruppoOnboarding(inCorso({ passo_attore: 'team', passo_stato: 'disponibile' }))).toBe('noi')
    expect(gruppoOnboarding(inCorso({ passo_attore: 'cliente', passo_stato: 'inviato' }))).toBe('noi')
    expect(gruppoOnboarding(inCorso({ passo_attore: 'cliente', passo_stato: 'in_attesa_team' }))).toBe('noi')
    // every step done and the path not closed yet: ours to close
    expect(gruppoOnboarding(inCorso({ passo_attore: null, passo_stato: null }))).toBe('noi')
  })

  it('i completati stanno a parte', () => {
    expect(gruppoOnboarding(riga({ invito_stato: 'usato', percorso_stato: 'completato' }))).toBe('conclusi')
    expect([...GRUPPI_LISTA]).toEqual(['noi', 'cliente', 'attesa', 'fermi'])
  })

  it('le righe si dividono senza perdersi e senza cambiare ordine', () => {
    const righe = [
      { ...riga(), n: 1 },
      { ...riga({ invito_stato: 'usato', percorso_stato: 'in_corso', passo_attore: 'team' }), n: 2 },
      { ...riga({ invito_stato: 'attivo' }), n: 3 },
      { ...riga({ invito_stato: 'usato', percorso_stato: 'in_corso', passo_stato: 'disponibile' }), n: 4 },
      { ...riga({ percorso_stato: 'completato' }), n: 5 },
    ]
    const gruppi = perGruppo(righe)
    expect(gruppi.attesa.map((r) => r.n)).toEqual([1, 3])
    expect(gruppi.noi.map((r) => r.n)).toEqual([2])
    expect(gruppi.cliente.map((r) => r.n)).toEqual([4])
    expect(gruppi.conclusi.map((r) => r.n)).toEqual([5])
    expect(perGruppo([])).toEqual({ noi: [], cliente: [], attesa: [], fermi: [], conclusi: [] })
  })

  it('i titoli dei gruppi sono quelli del disegno', () => {
    expect(ONBOARDING.it.lista.gruppi).toMatchObject({
      noi: 'Tocca a noi',
      cliente: 'Tocca al cliente',
      attesa: 'In attesa di pagamento o di registrazione',
    })
    expect(ONBOARDING.it.lista.vuotoTitolo).toBe('Nessun onboarding in corso')
    expect(ONBOARDING.it.senzaOnboarding.titolo(3)).toBe('Vendite nuove senza onboarding (3)')
  })
})

describe('da quando', () => {
  const date = {
    created_at: '2026-11-01T10:00:00+00:00',
    attivato_il: '2026-11-03T10:00:00+00:00',
    scade_il: '2026-11-17T10:00:00+00:00',
    revocato_il: '2026-11-05T10:00:00+00:00',
    giorno_zero: '2026-11-04T10:00:00+00:00',
    completato_il: '2026-12-01T10:00:00+00:00',
    consenso_genitore_il: null,
  }

  it('ogni stato ha il suo momento', () => {
    expect(daQuando(date, 'in_attesa_pagamento')).toBe(date.created_at)
    expect(daQuando(date, 'in_attesa_consenso')).toBe(date.created_at)
    expect(daQuando(date, 'pronto')).toBe(date.attivato_il)
    expect(daQuando(date, 'in_attesa_registrazione')).toBe(date.attivato_il)
    expect(daQuando(date, 'scaduto')).toBe(date.scade_il)
    expect(daQuando(date, 'revocato')).toBe(date.revocato_il)
    expect(daQuando(date, 'in_corso')).toBe(date.giorno_zero)
    expect(daQuando(date, 'completato')).toBe(date.completato_il)
  })

  it('quando il momento manca resta l’avvio', () => {
    const solo = { ...date, attivato_il: null, scade_il: null, revocato_il: null, giorno_zero: null, completato_il: null }
    for (const stato of STATI_ONBOARDING) expect(daQuando(solo, stato), stato).toBe(date.created_at)
  })
})

describe('cosa offre il riquadro «Link»', () => {
  it('in attesa di pagamento: conferma, rigenera, revoca; mai copia', () => {
    expect(azioniLink(riga(), true)).toEqual({
      confermaPagamento: true,
      consensoGenitore: false,
      rigenera: true,
      revoca: true,
      riattiva: false,
      copia: false,
      prova: true,
    })
  })

  it('un minorenne senza consenso ha anche «Registra il consenso del genitore», finché manca', () => {
    expect(azioniLink(riga({ minorenne: true }), false).consensoGenitore).toBe(true)
    expect(azioniLink(riga({ minorenne: true, consenso_genitore_il: '2026-11-12T09:00:00+00:00' }), false).consensoGenitore).toBe(false)
    expect(azioniLink(riga({ minorenne: null }), false).consensoGenitore).toBe(false)
  })

  it('«Copia link» e il messaggio solo con l’area clienti aperta e il link attivo', () => {
    expect(azioniLink(riga({ invito_stato: 'attivo' }), false).copia).toBe(false)
    expect(azioniLink(riga({ invito_stato: 'attivo' }), true).copia).toBe(true)
    for (const invito_stato of ['in_attesa_pagamento', 'usato', 'scaduto', 'revocato'] as const) {
      expect(azioniLink(riga({ invito_stato }), true).copia, invito_stato).toBe(false)
    }
  })

  it('attivo: niente conferma; revocato: riattiva e rigenera, niente revoca; usato: niente rigenera', () => {
    const attivo = azioniLink(riga({ invito_stato: 'attivo' }), false)
    expect([attivo.confermaPagamento, attivo.rigenera, attivo.revoca, attivo.riattiva]).toEqual([false, true, true, false])
    const revocato = azioniLink(riga({ invito_stato: 'revocato' }), false)
    expect([revocato.confermaPagamento, revocato.rigenera, revocato.revoca, revocato.riattiva]).toEqual([false, true, false, true])
    const usato = azioniLink(riga({ invito_stato: 'usato' }), true)
    expect([usato.confermaPagamento, usato.rigenera, usato.revoca, usato.riattiva]).toEqual([false, false, true, false])
    const scaduto = azioniLink(riga({ invito_stato: 'scaduto' }), true)
    expect([scaduto.confermaPagamento, scaduto.rigenera, scaduto.revoca, scaduto.riattiva]).toEqual([false, true, true, false])
  })

  it('senza un link non c’è nessuna azione', () => {
    expect(Object.values(azioniLink(riga({ invito_id: null, invito_stato: null }), true))).toEqual([false, false, false, false, false, false, false])
  })
})

describe('il registro in parole', () => {
  const invito_id = INVITO

  it('ogni evento che il database scrive ha la sua frase', () => {
    expect(eventoInParole({ tipo: 'avviato', dettagli: { invito_id, minorenne: false } })).toBe('Onboarding avviato')
    expect(eventoInParole({ tipo: 'avviato', dettagli: { invito_id, minorenne: true } })).toBe(
      'Onboarding avviato per un cliente minorenne',
    )
    expect(eventoInParole({ tipo: 'link_attivo', dettagli: { invito_id, attivato_da: 'pagamento' } })).toBe(
      'Link attivo: pagamento registrato',
    )
    expect(eventoInParole({ tipo: 'link_attivo', dettagli: { invito_id, attivato_da: 'manuale' } })).toBe(
      'Link attivo: pagamento confermato a mano',
    )
    expect(eventoInParole({ tipo: 'in_attesa_consenso', dettagli: { invito_id, modo: 'pagamento' } })).toBe(
      'Pagamento registrato: il link aspetta il consenso del genitore',
    )
    expect(eventoInParole({ tipo: 'in_attesa_consenso', dettagli: { invito_id, modo: 'manuale' } })).toBe(
      'Pagamento confermato a mano: il link aspetta il consenso del genitore',
    )
    expect(eventoInParole({ tipo: 'link_rigenerato', dettagli: { invito_id } })).toBe(
      'Link rigenerato: quello di prima non vale più',
    )
    expect(eventoInParole({ tipo: 'consenso_genitore', dettagli: { invito_id } })).toBe('Consenso del genitore registrato')
    expect(eventoInParole({ tipo: 'incarichi_modificati', dettagli: {} })).toBe('Team modificato')
  })

  it('la revoca dice se è automatica e perché', () => {
    expect(eventoInParole({ tipo: 'link_revocato', dettagli: { invito_id, automatica: false, motivo: 'Ha cambiato idea' } })).toBe(
      'Link revocato: Ha cambiato idea',
    )
    expect(eventoInParole({ tipo: 'link_revocato', dettagli: { invito_id, automatica: true, motivo: 'Rimborso totale' } })).toBe(
      'Link revocato in automatico: Rimborso totale',
    )
    expect(eventoInParole({ tipo: 'link_revocato', dettagli: { invito_id, automatica: false } })).toBe('Link revocato')
    expect(eventoInParole({ tipo: 'link_revocato', dettagli: { invito_id, automatica: true, motivo: '  ' } })).toBe(
      'Link revocato in automatico',
    )
  })

  it('la riattivazione dice dove torna il link', () => {
    expect(eventoInParole({ tipo: 'link_riattivato', dettagli: { invito_id, stato: 'attivo' } })).toBe('Link riattivato')
    expect(eventoInParole({ tipo: 'link_riattivato', dettagli: { invito_id, stato: 'in_attesa_pagamento' } })).toBe(
      'Link riattivato: in attesa di pagamento',
    )
    expect(eventoInParole({ tipo: 'link_riattivato', dettagli: { invito_id, stato: 'usato' } })).toBe('Accesso del cliente riattivato')
  })

  it('un evento che la pagina non conosce, o con dettagli strani, non rompe niente', () => {
    expect(eventoInParole({ tipo: 'questionario_inviato', dettagli: {} })).toBe('Evento registrato')
    expect(eventoInParole({ tipo: 'link_attivo', dettagli: null })).toBe('Link attivo: pagamento registrato')
    expect(eventoInParole({ tipo: 'link_revocato', dettagli: ['x'] })).toBe('Link revocato')
    expect(eventoInParole({ tipo: 'avviato', dettagli: 'x' })).toBe('Onboarding avviato')
  })

  it('in inglese: le frasi e i tre motivi automatici si traducono, quello scritto dall’admin resta com’è', () => {
    expect(eventoInParole({ tipo: 'link_attivo', dettagli: { attivato_da: 'manuale' } }, 'en')).toBe(
      'Link active: payment confirmed by hand',
    )
    expect(eventoInParole({ tipo: 'link_revocato', dettagli: { automatica: true, motivo: 'Rimborso totale' } }, 'en')).toBe(
      'Link revoked automatically: Full refund',
    )
    expect(eventoInParole({ tipo: 'link_revocato', dettagli: { automatica: false, motivo: 'Ha cambiato idea' } }, 'en')).toBe(
      'Link revoked: Ha cambiato idea',
    )
    expect(motivoInLingua(MOTIVI_AUTOMATICI.venditaEliminata, 'en')).toBe('Sale deleted')
    expect(motivoInLingua(MOTIVI_AUTOMATICI.venditaSpostata, 'en')).toBe('Sale moved to another client')
    // in Italian they are the words the database saved
    for (const [chiave, motivo] of Object.entries(MOTIVI_AUTOMATICI)) {
      expect(motivoInLingua(motivo, 'it')).toBe(motivo)
      expect(ONBOARDING.it.registro.motivi[chiave as keyof typeof MOTIVI_AUTOMATICI]).toBe(motivo)
    }
  })

  it('il registro non nomina mai una persona del team né un importo: solo cosa è successo al link', () => {
    for (const lingua of LINGUE) {
      const frasi = Object.values(ONBOARDING[lingua].registro.eventi).filter((v): v is string => typeof v === 'string')
      for (const frase of frasi) {
        expect(frase).not.toMatch(/[€$]|Dany|Ivan|Lorenzo|Loris/)
      }
    }
  })
})

describe('i passi del flusso', () => {
  it('ogni stato di un passo ha le sue parole nelle due lingue', () => {
    for (const lingua of LINGUE) {
      for (const stato of STATI_PASSO) expect(ONBOARDING[lingua].passi.stati[stato], `${lingua} ${stato}`).toBeTruthy()
    }
  })

  it('i nove passi della versione 1 hanno il titolo del disegno, e in inglese il loro', () => {
    const chiavi = ['benvenuto', 'regole', 'questionario', 'prenotazione', 'community', 'call', 'obiettivo', 'test', 'programma']
    expect(Object.keys(ONBOARDING.it.passi.titoli)).toEqual(chiavi)
    expect(Object.keys(ONBOARDING.en.passi.titoli)).toEqual(chiavi)
    expect(titoloPasso('questionario', 'Questionario iniziale', 'it')).toBe('Questionario iniziale')
    expect(titoloPasso('questionario', 'Questionario iniziale', 'en')).toBe('Initial questionnaire')
    // a step of a later flow: the database's own title
    expect(titoloPasso('wins', 'La bacheca delle wins', 'en')).toBe('La bacheca delle wins')
    expect(titoloPasso('wins', null, 'it')).toBe('wins')
    expect(titoloPasso(null, null, 'it')).toBe('')
  })
})

describe('il nome del cliente e il team proposto', () => {
  it('nome e cognome, o le parole per chi non ha un nome', () => {
    expect(nomeCliente({ nome: ' Tommaso ', cognome: 'Galli' })).toBe('Tommaso Galli')
    expect(nomeCliente({ nome: 'Tommaso', cognome: null })).toBe('Tommaso')
    expect(nomeCliente({ nome: '', cognome: null })).toBe('Cliente senza nome')
    expect(nomeCliente({ nome: null, cognome: undefined }, 'en')).toBe('Client without a name')
  })

  const persone = [
    { id: 'dany', nome: 'Dany Montagnolo' },
    { id: 'ivan', nome: 'Ivan Coach' },
    { id: 'lorenzo', nome: 'Lorenzo Revisore' },
  ]

  it('i predefiniti delle impostazioni, finché sono persone attive', () => {
    expect(
      incarichiPredefiniti(
        { coach_predefinito_id: 'ivan', revisore_predefinito_id: 'lorenzo', responsabile_predefinito_id: 'dany' },
        persone,
        'dany',
      ),
    ).toEqual({ coach: 'ivan', revisore: 'lorenzo', responsabile: 'dany' })
  })

  it('senza un responsabile predefinito è chi sta usando il wizard', () => {
    expect(
      incarichiPredefiniti(
        { coach_predefinito_id: null, revisore_predefinito_id: null, responsabile_predefinito_id: null },
        persone,
        'dany',
      ),
    ).toEqual({ coach: null, revisore: null, responsabile: 'dany' })
    expect(incarichiPredefiniti(null, persone, 'dany')).toEqual({ coach: null, revisore: null, responsabile: 'dany' })
  })

  it('una persona non più attiva non viene proposta', () => {
    expect(
      incarichiPredefiniti(
        { coach_predefinito_id: 'andato', revisore_predefinito_id: 'lorenzo', responsabile_predefinito_id: 'andato' },
        persone,
        'dany',
      ),
    ).toEqual({ coach: null, revisore: 'lorenzo', responsabile: 'dany' })
    // nobody to propose at all: the wizard asks
    expect(incarichiPredefiniti(null, [], 'dany')).toEqual({ coach: null, revisore: null, responsabile: null })
  })
})
