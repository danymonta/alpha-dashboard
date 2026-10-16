/**
 * The vocabulary of the call analysis (1.37.0, CLAUDE.md section 31): the values Claude
 * chooses among and their Italian labels, in one place and pure. They come from the
 * anonymous ICP (lib/marketing/icp.ts): the pains, the wishes, what the lead already
 * tried. The database keeps the values (snake_case); the pages print the labels.
 *
 * In the texts about a person the labels never say a body condition by its name
 * (lib/call/analisi/salute.ts): «il petto», never «petto incavato» or «pectus».
 */
export const PAIN = {
  maglia: 'Togliersi la maglia davanti agli altri',
  giudizio: 'Il giudizio degli sconosciuti',
  pesare_sui_cari: 'Pesare sulle persone care',
  sembrare_debole: 'Sembrare debole nel lavoro',
  eta: 'L’età che avanza',
  ricominciare_fallire: 'Ricominciare e fallire di nuovo',
  sprecare_tempo: 'Sprecare tempo',
  altro: 'Altro',
} as const
export const DESIDERI = {
  fit_non_grosso: 'Fit, non grosso',
  petto_spalle_braccia: 'Petto, spalle e braccia',
  ricomposizione: 'Ricomposizione',
  autostima: 'Autostima',
  esempio_famiglia: 'Essere un esempio per la famiglia',
  tornare_come_prima: 'Tornare come prima',
  altro: 'Altro',
} as const
export const GIA_PROVATO = {
  palestra: 'Palestra',
  personal_trainer: 'Personal trainer',
  social: 'Esercizi dai social',
  schede_online: 'Schede online',
  diete: 'Diete',
  nutrizionista: 'Nutrizionista',
  da_solo: 'Da solo',
  altro: 'Altro',
} as const
export const SAPEVA = {
  percorso_a_casa: 'Il percorso si fa a casa',
  tempo_richiesto: 'Il tempo richiesto',
  durata_percorso: 'La durata del percorso',
  prezzo_indicativo: 'Un prezzo indicativo',
  chi_e_dany: 'Chi è Dany',
  cosa_succede_in_call: 'Cosa succede in call',
  contenuto_che_l_ha_portato: 'Il contenuto che l’ha portato',
} as const
export const MOMENTI = {
  obiezione: 'Obiezione',
  prezzo: 'Prezzo',
  motivazione: 'Motivazione',
  decisione: 'Decisione',
  prossimo_passo: 'Prossimo passo',
  domanda_sul_percorso: 'Domanda sul percorso',
} as const
export const CATEGORIE_OBIEZIONI = {
  prezzo_cassa: 'Prezzo e flusso di cassa del momento',
  valore: 'Valore',
  tempo: 'Tempo',
  decisione_condivisa: 'Decisione da condividere',
  eta: 'Età',
  tempi_risultati: 'Tempi dei risultati',
  fiducia_metodo: 'Fiducia nel metodo',
  alimentazione: 'Alimentazione',
  rimandare: 'Rimandare',
  condizioni_personali: 'Condizioni personali',
  altro: 'Altro',
} as const
export const CRITERI = {
  scoperta: 'Scoperta',
  obiettivo: 'Obiettivo',
  presentazione: 'Presentazione',
  obiezioni: 'Obiezioni',
  chiusura: 'Chiusura',
} as const
export const GIUDIZI_CRITERIO = { si: 'sì', in_parte: 'in parte', no: 'no', non_applicabile: 'non applicabile' } as const

export type ChiavePain = keyof typeof PAIN
export type ChiaveDesiderio = keyof typeof DESIDERI
export type ChiaveGiaProvato = keyof typeof GIA_PROVATO
export type ChiaveSapeva = keyof typeof SAPEVA
export type ChiaveMomento = keyof typeof MOMENTI
export type CategoriaObiezione = keyof typeof CATEGORIE_OBIEZIONI
export type CriterioPerformance = keyof typeof CRITERI
export type GiudizioCriterio = keyof typeof GIUDIZI_CRITERIO

export const CHIAVI_PAIN = Object.keys(PAIN) as [ChiavePain, ...ChiavePain[]]
export const CHIAVI_DESIDERI = Object.keys(DESIDERI) as [ChiaveDesiderio, ...ChiaveDesiderio[]]
export const CHIAVI_GIA_PROVATO = Object.keys(GIA_PROVATO) as [ChiaveGiaProvato, ...ChiaveGiaProvato[]]
export const CHIAVI_SAPEVA = Object.keys(SAPEVA) as [ChiaveSapeva, ...ChiaveSapeva[]]
export const CHIAVI_MOMENTI = Object.keys(MOMENTI) as [ChiaveMomento, ...ChiaveMomento[]]
export const CHIAVI_CATEGORIE = Object.keys(CATEGORIE_OBIEZIONI) as [CategoriaObiezione, ...CategoriaObiezione[]]
export const CHIAVI_CRITERI = Object.keys(CRITERI) as [CriterioPerformance, ...CriterioPerformance[]]

/** The label of a value, or the value itself when it is unknown (an old row). */
export function etichetta<T extends Record<string, string>>(mappa: T, chiave: string | null | undefined): string {
  if (!chiave) return ''
  return (mappa as Record<string, string>)[chiave] ?? chiave
}
