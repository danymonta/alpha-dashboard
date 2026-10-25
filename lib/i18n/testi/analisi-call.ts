import { ANALISI, FRASI_CALL } from '@/lib/call/analisi/parole'
import {
  CATEGORIE_OBIEZIONI,
  CRITERI,
  DESIDERI,
  GIA_PROVATO,
  GIUDIZI_CRITERIO,
  MOMENTI,
  PAIN,
  SAPEVA,
} from '@/lib/call/analisi/icp-call'
import { bilingue } from '@/lib/i18n/lingua'

/**
 * The frame of Claude's call analysis on the card (1.53.0, the second pass): the buttons, the
 * proposed performance, «Dalla call» and the labels of the categories Claude picks from. What
 * Claude writes (summary, signals, quotes, reasons) stays Italian. The Italian side is
 * lib/call/analisi, so a word is still changed there.
 */
export const ANALISI_TESTI = bilingue(ANALISI, {
  titolo: 'Claude’s analysis',
  inCoda: 'Queued: the analysis arrives in a few minutes.',
  inCorso: 'Claude is analysing the call…',
  nessuna: 'No analysis for this call.',
  analizza: 'Analyse',
  analizzaDiNuovo: 'Analyse again',
  analizzata: (quando: string) => `Analysed by Claude ${quando}`,
  motivoProposto: 'Proposed reason for not closing',
  usaMotivo: 'Use as reason for not closing',
  motivoAggiornato: 'Reason for not closing updated',
  motivoCambiato: 'The reason for not closing changed elsewhere: reload the page and check.',
  esitoDiverso: (letto: string) => `From the recording it looks like a ${letto} call: check the outcome.`,
  letta: 'From the call’s recording, read by Claude.',
  il: 'The lead',
  inTarget: 'On target',
  nonInTarget: 'Not on target',
  daVerificare: 'To check',
  obiezioni: 'Objections',
  domande: 'What they asked',
  convintoDa: 'What convinced them',
  dalSetting: 'From the setting',
  sapeva: 'Knew on arrival',
  sorprese: 'What surprised them',
  prossimiPassi: 'Next steps',
  daRiascoltare: 'To listen again',
  gestita: { si: 'handled', in_parte: 'partly handled', no: 'not handled' },
  performance: {
    titolo: 'Proposed performance',
    conferma: (livello: string) => `Confirm «${livello}»`,
    cambia: 'Change',
    scritta: (scritta: string, proposta: string) => `You wrote ${scritta}, Claude proposes ${proposta}.`,
    quota: (percento: number) => `You spoke ${percento}% of the time.`,
    funzionato: 'What worked',
    daProvare: 'To try',
    fatto: (livello: string) => `Performance: ${livello}`,
  },
  dallaCall: {
    titolo: 'From the call',
    inTarget: 'The lead was on target',
    nonInTarget: 'The lead was not on target',
    daVerificare: 'It is not clear whether the lead was on target',
    sapeva: 'Knew on arrival',
    sorprese: 'What surprised them',
    sifermato: 'Stopped on',
    spunti: 'Pointers for your DMs',
    soloTuoi: 'Only you see them.',
  },
})

/** The fixed sentences of a failed analysis (FRASI_CALL), as the card shows them. */
export const FRASI_CALL_TESTI = bilingue(FRASI_CALL, {
  senzaChiave: 'Analyses off: Claude’s key is missing on Vercel.',
  fornitore: 'Claude refused the request (key, credit or spending limit): check the Anthropic console and the key on Vercel.',
  nonRisponde: 'Claude is not answering right now: try again in a few minutes.',
  rifiuto: 'Claude did not analyse this call.',
  incompleta: 'Claude’s answer arrived incomplete: tap Analyse again.',
  illeggibile: 'Claude’s answer cannot be read: tap Analyse again.',
  erroreApp: 'The analysis did not start because of an app error: tell Dany.',
  minorenne: 'The lead is a minor: no analysis.',
  senzaRegistrazione: 'I cannot find the recording on Fathom: check the link and tap Analyse again.',
  trascrizioneAssente: 'The transcript did not arrive from Fathom: tap Analyse again.',
  fathomNonCollegato: 'Fathom is not connected: the admin pastes the key in Settings › Fathom.',
  fathomChiave: 'Fathom’s key no longer works: the admin changes it in Settings › Fathom.',
  linkNonFathom: 'The link is not a Fathom one: transcript and analysis do not arrive.',
  interrotta: 'Interrupted: the server did not finish the work. Tap Analyse again.',
})

/** The labels of the categories Claude picks from (lib/call/analisi/icp-call.ts). */
export const CATEGORIE_CALL = bilingue(
  { PAIN, DESIDERI, GIA_PROVATO, SAPEVA, MOMENTI, CATEGORIE_OBIEZIONI, CRITERI, GIUDIZI_CRITERIO },
  {
    PAIN: {
      maglia: 'Taking the shirt off in front of others',
      giudizio: 'Strangers’ judgement',
      pesare_sui_cari: 'Being a weight on loved ones',
      sembrare_debole: 'Looking weak at work',
      eta: 'Getting older',
      ricominciare_fallire: 'Starting again and failing again',
      sprecare_tempo: 'Wasting time',
      altro: 'Other',
    },
    DESIDERI: {
      fit_non_grosso: 'Fit, not bulky',
      petto_spalle_braccia: 'Chest, shoulders and arms',
      ricomposizione: 'Recomposition',
      autostima: 'Self-esteem',
      esempio_famiglia: 'Being an example for the family',
      tornare_come_prima: 'Getting back to how it was',
      altro: 'Other',
    },
    GIA_PROVATO: {
      palestra: 'Gym',
      personal_trainer: 'Personal trainer',
      social: 'Exercises from social media',
      schede_online: 'Online plans',
      diete: 'Diets',
      nutrizionista: 'Nutritionist',
      da_solo: 'Alone',
      altro: 'Other',
    },
    SAPEVA: {
      percorso_a_casa: 'The programme is done at home',
      tempo_richiesto: 'The time it takes',
      durata_percorso: 'How long the programme lasts',
      prezzo_indicativo: 'A rough price',
      chi_e_dany: 'Who Dany is',
      cosa_succede_in_call: 'What happens on the call',
      contenuto_che_l_ha_portato: 'The content that brought them',
    },
    MOMENTI: {
      obiezione: 'Objection',
      prezzo: 'Price',
      motivazione: 'Motivation',
      decisione: 'Decision',
      prossimo_passo: 'Next step',
      domanda_sul_percorso: 'Question on the programme',
    },
    CATEGORIE_OBIEZIONI: {
      prezzo_cassa: 'Price and cash flow right now',
      valore: 'Value',
      tempo: 'Time',
      decisione_condivisa: 'Decision to share',
      eta: 'Age',
      tempi_risultati: 'Time to results',
      fiducia_metodo: 'Trust in the method',
      alimentazione: 'Nutrition',
      rimandare: 'Putting it off',
      condizioni_personali: 'Personal conditions',
      altro: 'Other',
    },
    CRITERI: {
      scoperta: 'Discovery',
      obiettivo: 'Goal',
      presentazione: 'Presentation',
      obiezioni: 'Objections',
      chiusura: 'Close',
    },
    GIUDIZI_CRITERIO: { si: 'yes', in_parte: 'partly', no: 'no', non_applicabile: 'not applicable' },
  },
)

/** The toasts of the analysis card (analisi-call.tsx). */
export const ANALISI_TOAST = bilingue(
  {
    nonPartita: 'Analisi non partita. Riprova.',
    partita: 'Claude analizza la call: arriva tra qualche minuto.',
    annulla: 'Annulla',
    funzionatoEDaProvare: (funzionato: string, daProvare: string) => `${funzionato} e ${daProvare.toLowerCase()}`,
    scegli: 'Scegli la performance',
  },
  {
    nonPartita: 'The analysis did not start. Try again.',
    partita: 'Claude is analysing the call: it arrives in a few minutes.',
    annulla: 'Undo',
    funzionatoEDaProvare: (funzionato: string, daProvare: string) => `${funzionato} and ${daProvare.toLowerCase()}`,
    scegli: 'Choose the performance',
  },
)
