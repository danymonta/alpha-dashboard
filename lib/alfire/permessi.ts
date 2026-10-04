import type { AppRole, LivelloPm } from '@/lib/auth/roles'

/**
 * Which tools Alfire receives for whom. The first filter only: every tool runs
 * with the user's own session, so RLS and the action guards still decide.
 * A collaborator never gets a tool that reads a client's payments, costs,
 * margin or someone else's pay (CLAUDE.md section 6). The exceptions are the
 * ones section 6 grants, each on his own money only and as the app shows it
 * to him (03/10/2026): the setter the clients he brought, what they paid and
 * his commission on each cash-in (miei_clienti); the closer his own sales,
 * their instalments and cash-ins (mie_vendite, rata); both their own day
 * (mie_giornate), which the admin has too, as the closer he is (section 6):
 * his own day only, the others' through his admin tools. The "mine" reads
 * (miei_numeri, miei_clienti, mie_vendite, mie_giornate, miei_task,
 * mio_tempo) always return the caller's data and say whose it is: another
 * person's data comes only from a tool made for it (tempo_team), never from
 * them.
 */
type Chi = { ruoli?: readonly AppRole[]; livelliPm?: readonly LivelloPm[] }

const TUTTI_I_LIVELLI = ['admin', 'manager', 'employee'] as const
const CHI_GESTISCE = ['admin', 'manager'] as const

export const STRUMENTI = {
  // everyone
  guida: {},
  // answers at a tap: buttons in the chat, never a write (lib/alfire/risposte.ts)
  proponi_risposte: {},
  // admin: the money
  numeri_periodo: { ruoli: ['admin'] },
  cash_per_mese: { ruoli: ['admin'] },
  da_incassare: { ruoli: ['admin'] },
  cerca_clienti: { ruoli: ['admin'] },
  rate_cliente: { ruoli: ['admin'] },
  vendite_periodo: { ruoli: ['admin'] },
  metriche_setting: { ruoli: ['admin'] },
  // what the leads say, for marketing (30/09/2026): the setters' reports and
  // the closers' reasons for not closing
  commenti_marketing: { ruoli: ['admin'] },
  provvigioni: { ruoli: ['admin'] },
  costi_periodo: { ruoli: ['admin'] },
  // setter: own numbers only
  miei_numeri: { ruoli: ['setter'] },
  // each one's own money, as the app already shows it to him (03/10/2026): the setter
  // the clients he brought (I miei numeri › I tuoi clienti), the closer the sales he
  // closed (Le mie vendite), both their day by day; the admin his own day as the
  // closer he is (Setting › Closer with himself chosen), never anyone else's
  miei_clienti: { ruoli: ['setter'] },
  mie_vendite: { ruoli: ['closer'] },
  mie_giornate: { ruoli: ['admin', 'setter', 'closer'] },
  // who has calls
  call_periodo: { ruoli: ['admin', 'setter', 'closer'] },
  // projects: every level sees what RLS lets them see; one's own time for everyone
  progetti: { livelliPm: TUTTI_I_LIVELLI },
  progetto_dettaglio: { livelliPm: TUTTI_I_LIVELLI },
  miei_task: { livelliPm: TUTTI_I_LIVELLI },
  mio_tempo: { livelliPm: TUTTI_I_LIVELLI },
  // the team's declared time, as Tempo › Team (30/09/2026): the app admin only,
  // like the RPC it reads (pm_tempo_per_persona refuses anybody else)
  tempo_team: { ruoli: ['admin'] },

  // writes: always behind the user's confirmation
  cliente: { ruoli: ['admin'] },
  vendita: { ruoli: ['admin'] },
  registra_vendita: { ruoli: ['admin', 'closer'] },
  rata: { ruoli: ['admin', 'closer'] },
  costo: { ruoli: ['admin'] },
  pagamento_provvigione: { ruoli: ['admin'] },
  regola_provvigione: { ruoli: ['admin'] },
  obiettivi_mese: { ruoli: ['admin'] },
  prodotto: { ruoli: ['admin'] },
  // the setter for himself; the admin for himself or a setter (Dany, 29/09/2026)
  fissa_call: { ruoli: ['admin', 'setter'] },
  call: { ruoli: ['admin', 'setter', 'closer'] },
  lead: { ruoli: ['admin', 'setter', 'closer'] },
  // the setter his own days; the admin any setter's (Setting › Aggiungi giornata)
  aggiorna_report: { ruoli: ['admin', 'setter'] },
  progetto: { livelliPm: CHI_GESTISCE },
  lista: { livelliPm: CHI_GESTISCE },
  task: { livelliPm: TUTTI_I_LIVELLI },
  nota_progetto: { livelliPm: TUTTI_I_LIVELLI },
  tempo: { livelliPm: TUTTI_I_LIVELLI },
} as const satisfies Record<string, Chi>

export type NomeStrumento = keyof typeof STRUMENTI

export const SCRITTURE = [
  'cliente',
  'vendita',
  'registra_vendita',
  'rata',
  'costo',
  'pagamento_provvigione',
  'regola_provvigione',
  'obiettivi_mese',
  'prodotto',
  'fissa_call',
  'call',
  'lead',
  'aggiorna_report',
  'progetto',
  'lista',
  'task',
  'nota_progetto',
  'tempo',
] as const satisfies readonly NomeStrumento[]

export type NomeScrittura = (typeof SCRITTURE)[number]

export function isScrittura(nome: string): nome is NomeScrittura {
  return (SCRITTURE as readonly string[]).includes(nome)
}

/**
 * What each write tool may do, per role (Economics) or per projects level
 * (Progetti): the same buttons the app shows that person. The tool's schema
 * offers only these, so the model never sees an action it may not do; the
 * server action checks again anyway.
 */
export const AZIONI = {
  // chiudi / riapri: "Non rinnova" and "Riapri" of the client sheet (04/10/2026)
  cliente: { admin: ['crea', 'modifica', 'chiudi', 'riapri', 'elimina'] },
  vendita: { admin: ['modifica', 'interrompi', 'elimina'] },
  rata: {
    admin: ['incassa', 'correggi_incasso', 'annulla_incasso', 'fallita', 'modifica', 'rimborso', 'aggiungi', 'elimina'],
    // his own sales only (RLS), as on his sale page: cash-ins, never the plan
    closer: ['incassa', 'correggi_incasso', 'annulla_incasso', 'fallita'],
  },
  costo: { admin: ['registra', 'modifica', 'elimina', 'copia_ricorrenti'] },
  pagamento_provvigione: { admin: ['registra', 'modifica', 'elimina'] },
  regola_provvigione: { admin: ['nuova', 'chiudi', 'modifica', 'elimina'] },
  prodotto: { admin: ['crea', 'modifica', 'fuori_vendita', 'in_vendita', 'elimina'] },
  // the outcome is the closer's (registraEsito refuses the setter); everyone with
  // calls moves them (sposta_call: the setter only those still to be held)
  call: { admin: ['esito', 'sposta', 'modifica', 'elimina'], closer: ['esito', 'sposta', 'modifica'], setter: ['sposta', 'modifica'] },
  lead: { admin: ['stato', 'modifica', 'elimina'], setter: ['stato', 'modifica'], closer: ['stato'] },
  // modalita of the daily report
  aggiorna_report: { admin: ['aggiungi', 'imposta', 'elimina'], setter: ['aggiungi', 'imposta'] },
  // per projects level from here on
  // scegli_coach: «Scegli il coach» of a client's project, for who manages it (02/10/2026)
  progetto: {
    admin: ['crea', 'modifica', 'aggiungi_membro', 'togli_membro', 'scegli_coach', 'elimina'],
    manager: ['crea', 'modifica', 'aggiungi_membro', 'togli_membro', 'scegli_coach'],
  },
  lista: { admin: ['crea', 'modifica', 'elimina'], manager: ['crea', 'modifica', 'elimina'] },
  task: {
    admin: ['aggiungi', 'modifica', 'completa', 'riapri', 'elimina'],
    manager: ['aggiungi', 'modifica', 'completa', 'riapri', 'elimina'],
    employee: ['aggiungi', 'modifica', 'completa', 'riapri', 'elimina'],
  },
  nota_progetto: {
    admin: ['aggiungi', 'modifica', 'elimina'],
    manager: ['aggiungi', 'modifica', 'elimina'],
    employee: ['aggiungi', 'modifica', 'elimina'],
  },
  tempo: {
    admin: ['avvia', 'ferma', 'registra', 'modifica', 'elimina'],
    manager: ['avvia', 'ferma', 'registra', 'modifica', 'elimina'],
    employee: ['avvia', 'ferma', 'registra', 'modifica', 'elimina'],
  },
} as const satisfies Partial<Record<NomeScrittura, Partial<Record<AppRole | LivelloPm, readonly string[]>>>>

type ConAzioni = keyof typeof AZIONI

/** The actions of a write tool for this person: by projects level for the Progetti tools, by role otherwise. */
export function azioniConsentite(nome: ConAzioni, ruolo: AppRole, livelloPm: LivelloPm | null): readonly string[] {
  const perChi = AZIONI[nome] as Partial<Record<string, readonly string[]>>
  const chiave = 'livelliPm' in STRUMENTI[nome] ? livelloPm : ruolo
  return (chiave && perChi[chiave]) || []
}

export function strumentiConsentiti(ruolo: AppRole, livelloPm: LivelloPm | null): NomeStrumento[] {
  return (Object.entries(STRUMENTI) as [NomeStrumento, Chi][])
    .filter(([nome, chi]) => {
      if (chi.ruoli && !chi.ruoli.includes(ruolo)) return false
      if (chi.livelliPm && (!livelloPm || !chi.livelliPm.includes(livelloPm))) return false
      // a write tool with no action for this person is not offered at all
      if (nome in AZIONI && azioniConsentite(nome as ConAzioni, ruolo, livelloPm).length === 0) return false
      return true
    })
    .map(([nome]) => nome)
}
