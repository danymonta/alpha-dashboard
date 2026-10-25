import {
  DA_APPROVARE,
  PROPOSTA,
  VOCI_PROPOSTA,
  decisaDaUnAltro,
  giornoProposta,
  paroleScheda,
  primoNome,
  type ChiDecide,
  type ParoleScheda,
  type PropostaInstagram,
} from '@/app/(app)/today/proposta-instagram'
import { etichettaGiornoIn } from '@/lib/i18n/date'
import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { gruppiReport, giornoInFrase } from '@/lib/i18n/testi/oggi'
import { GIORNI_EN, parseDataISO } from '@/lib/format'
import { aggiungiGiorni } from '@/lib/date'

/** «yesterday», «Monday 05/10»: the day of a proposal inside a sentence. */
function giornoEn(data: string, oggi: string): string {
  return giornoInFrase(etichettaGiornoIn(data, oggi, 'en'), 'en')
}

/**
 * The cards of the report proposed from the Instagram DMs (1.53.0), the setter's in
 * «Oggi» and the admin's in «Setter › Tracciamento da approvare». The Italian side is
 * PROPOSTA and DA_APPROVARE of app/(app)/today/proposta-instagram.ts, word for word.
 */
export const PROPOSTE = bilingue(
  {
    ...PROPOSTA,
    /** the admin's sheet and rows: «Instagram 53» without his numbers */
    connessione: 'Connessione assente. Riprova.',
  },
  {
    regione: 'Proposals from Instagram',
    titolo: (data: string, oggi: string) => `From Instagram · ${giornoEn(data, oggi)}`,
    spiegazione: 'Counted from the account’s DMs: check and confirm. The questions of the day stay yours.',
    prenotate: 'Discovery calls booked: the calls you booked in the app that day.',
    chatLette: (n: number) => (n === 1 ? '1 chat read' : `${n} chats read`),
    chatIncerte: (n: number) =>
      n === 1 ? '1 long chat: something may slip there' : `${n} long chats: something may slip there`,
    tu: 'you',
    instagram: 'Instagram',
    conferma: 'Confirm',
    correggi: 'Correct',
    usaInstagram: 'Use Instagram’s',
    tieniMiei: 'Keep mine',
    confermaCorretti: 'Confirm these numbers',
    titoloFoglio: (data: string, oggi: string) => `Correct the numbers of ${giornoEn(data, oggi)}`,
    descrizioneFoglio: 'They start from Instagram’s: change the ones that do not add up. They go into your report of that day.',
    confrontoFoglio: (instagram: string, tuo: string) => `Instagram ${instagram} · you ${tuo}`,
    fatto: {
      conferma: (data: string, oggi: string) => `Report for ${giornoEn(data, oggi)} filled in with Instagram’s numbers`,
      correzione: (data: string, oggi: string) => `Report for ${giornoEn(data, oggi)} filled in with your numbers`,
      scarto: (data: string, oggi: string) => `Report for ${giornoEn(data, oggi)}: your numbers kept`,
    },
    dopo: 'The questions of the day stay yours.',
    sospeso: 'Updating the report with your choice…',
    salvaPrima: 'First save the report of that day: tap Try again below.',
    salvaPrimaFoglio: (bottone: string) =>
      `That day’s report did not save: check the connection and tap «${bottone}» again.`,
    cambiatoPrima: 'That day’s report changed somewhere else: check the numbers again and decide again.',
    apriGiorno: 'Open the day',
    altre: 'There are older proposals: they show up as you decide these.',
    errore: 'The proposals from Instagram did not load.',
    riprova: 'Try again',
    connessione: 'No connection. Try again.',
  },
)

export const DA_APPROVARE_IN = bilingue(
  { ...DA_APPROVARE, titoloConNumero: (n: string) => `${DA_APPROVARE.titolo} (${n})` },
  {
    ancora: DA_APPROVARE.ancora,
    titolo: 'Tracking to approve',
    descrizione:
      'The setters’ days counted every night from the Instagram DMs and not decided yet. The first choice wins, yours or the setter’s, and he sees on his day that you decided it.',
    finito: 'Nothing left to approve.',
    altre: 'There are older days: they show up as you decide these.',
    errore: 'The days to approve did not load.',
    titoloConNumero: (n: string) => `Tracking to approve (${n})`,
  },
)

/** «yesterday, Wednesday 07/10», «Monday 05/10»: the day of a proposal on the admin's card. */
export function giornoPropostaIn(data: string, oggi: string, lingua: Lingua): string {
  if (lingua === 'it') return giornoProposta(data, oggi)
  const d = parseDataISO(data)
  const giorno = `${GIORNI_EN[d.getDay()]} ${data.slice(8, 10)}/${data.slice(5, 7)}`
  return data === aggiungiGiorni(oggi, -1) ? `yesterday, ${giorno}` : giorno
}

/** paroleScheda (proposta-instagram.ts) in the page's language. */
export function paroleSchedaIn(
  proposta: Pick<PropostaInstagram, 'data' | 'setter_nome'>,
  oggi: string,
  per: ChiDecide,
  lingua: Lingua,
): ParoleScheda {
  if (lingua === 'it') return paroleScheda(proposta, oggi, per)
  const t = PROPOSTE.en
  const giorno = giornoEn(proposta.data, oggi)
  if (per === 'setter') {
    return {
      titolo: t.titolo(proposta.data, oggi),
      spiegazione: t.spiegazione,
      prenotate: t.prenotate,
      suoi: t.tu,
      tieni: t.tieniMiei,
      titoloFoglio: t.titoloFoglio(proposta.data, oggi),
      descrizioneFoglio: t.descrizioneFoglio,
      confrontoFoglio: t.confrontoFoglio,
      fatto: {
        conferma: t.fatto.conferma(proposta.data, oggi),
        correzione: t.fatto.correzione(proposta.data, oggi),
        scarto: t.fatto.scarto(proposta.data, oggi),
      },
      dopo: t.dopo,
      dopoLoScarto: false,
    }
  }
  const nome = proposta.setter_nome?.trim() || 'Setter'
  const primo = primoNome(nome)
  return {
    titolo: `${nome} · ${giornoPropostaIn(proposta.data, oggi, lingua)}`,
    spiegazione: `Counted from the account’s DMs for ${primo}’s report: check and confirm. The first choice wins, yours or theirs.`,
    prenotate: `Discovery calls booked: the calls ${primo} booked in the app that day.`,
    suoi: primo,
    tieni: `Keep ${primo}’s`,
    titoloFoglio: `Correct ${primo}’s numbers of ${giorno}`,
    descrizioneFoglio: `They start from Instagram’s: change the ones that do not add up. They go into ${primo}’s report of that day.`,
    confrontoFoglio: (instagram, suo) => `Instagram ${instagram} · ${primo} ${suo}`,
    fatto: {
      conferma: `${primo}’s report for ${giorno} filled in with Instagram’s numbers`,
      correzione: `${primo}’s report for ${giorno} filled in with the corrected numbers`,
      scarto: `${primo}’s report for ${giorno}: their numbers kept`,
    },
    dopo: `The questions of the day stay ${primo}’s, who sees on their day that you decided.`,
    dopoLoScarto: true,
  }
}

/** decisaDaUnAltro (proposta-instagram.ts) in the page's language: who decided, never the numbers. */
export function decisaDaUnAltroIn(
  decisa: Parameters<typeof decisaDaUnAltro>[0],
  setterId: string,
  lingua: Lingua,
): string | null {
  const frase = decisaDaUnAltro(decisa, setterId)
  if (lingua === 'it' || !frase) return frase
  const chi = decisa.decisore?.nome ?? ''
  if (decisa.stato === 'confermata') {
    return decisa.corretta
      ? `${chi} corrected Instagram’s numbers for this day.`
      : `${chi} confirmed Instagram’s numbers for this day.`
  }
  return `${chi} kept your numbers for this day.`
}

/** The six numbers of a proposal with the form's words, in the page's language. */
export function vociProposta(lingua: Lingua): typeof VOCI_PROPOSTA {
  if (lingua === 'it') return VOCI_PROPOSTA
  const campi = gruppiReport(lingua).flatMap((g) => g.campi)
  return VOCI_PROPOSTA.map((v) => {
    const voce = campi.find(([campo]) => campo === v.campo)
    return voce ? { campo: v.campo, etichetta: voce[1], aiuto: voce[2] } : v
  })
}
