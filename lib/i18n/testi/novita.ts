import type { Pubblico } from '@/lib/changelog/versioni'
import { bilingue } from '@/lib/i18n/lingua'

/**
 * The frame of «Novità» (1.53.0). The changelog itself is a text for Dany and stays in
 * Italian; in English the page says so above the versions.
 */
export const NOVITA = bilingue(
  {
    titolo: 'Novità',
    descrizioneAdmin: (app: string) =>
      `Il changelog di ${app}, dalla più recente: ogni voce dice per chi è, e il team legge solo le voci del suo lavoro. Le 0.x sono le tappe prima della produzione.`,
    descrizioneTeam: (app: string) =>
      `Cosa cambia nel tuo lavoro a ogni versione di ${app}, dalla più recente. Le 0.x sono le tappe prima della produzione.`,
    inItaliano: 'Il changelog è scritto da Dany in italiano.',
    inUso: 'Versione in uso',
    vuotoTitolo: 'Ancora nessuna novità per te',
    vuotoDescrizione: 'Le novità del tuo lavoro compaiono qui a ogni aggiornamento dell’app.',
    tornaAlLavoro: 'Torna al lavoro',
    versioni: 'Versioni, dalla più recente',
    novitaPerTe: 'Novità per te',
    correzioniPerTe: 'Correzioni per te',
    novita: 'Novità',
    correzioni: 'Correzioni',
    nNovita: (n: number) => `${n} novità`,
    nCorrezioni: (n: number) => `${n} ${n === 1 ? 'correzione' : 'correzioni'}`,
    per: 'Per:',
    pubblico: {
      admin: 'Solo admin',
      setter: 'Setter',
      closer: 'Closer',
      marketing: 'Area Marketing',
      progetti: 'Area Progetti',
      tutti: 'Tutto il team',
    } satisfies Record<Pubblico, string>,
  },
  {
    titolo: 'What’s new',
    descrizioneAdmin: (app: string) =>
      `The changelog of ${app}, newest first: each item says who it is for, and the team reads only the items of its own work. The 0.x versions are the steps before production.`,
    descrizioneTeam: (app: string) =>
      `What changes in your work with each version of ${app}, newest first. The 0.x versions are the steps before production.`,
    inItaliano: 'The changelog is written by Dany in Italian: the notes below are in Italian.',
    inUso: 'Version in use',
    vuotoTitolo: 'Nothing new for you yet',
    vuotoDescrizione: 'What changes in your work appears here with every update of the app.',
    tornaAlLavoro: 'Back to work',
    versioni: 'Versions, newest first',
    novitaPerTe: 'New for you',
    correzioniPerTe: 'Fixes for you',
    novita: 'New',
    correzioni: 'Fixes',
    nNovita: (n: number) => `${n} new`,
    nCorrezioni: (n: number) => `${n} ${n === 1 ? 'fix' : 'fixes'}`,
    per: 'For:',
    pubblico: {
      admin: 'Admin only',
      setter: 'Setter',
      closer: 'Closer',
      marketing: 'Marketing area',
      progetti: 'Projects area',
      tutti: 'The whole team',
    },
  },
)
