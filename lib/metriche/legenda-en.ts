/*
 * What every tracked number means, in English (1.53.0): the same keys as lib/metriche/legenda.ts,
 * so a page reads legende(lingua) and finds every entry it knows. The Italian words there stay
 * the app's own; change a definition in both places together.
 */
import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import {
  LEGENDA_CLOSER,
  LEGENDA_ECONOMICS,
  LEGENDA_SETTER,
  LEGENDA_SETTING,
  type VoceLegenda,
} from '@/lib/metriche/legenda'

export const LEGENDA_SETTING_EN: Record<keyof typeof LEGENDA_SETTING, VoceLegenda> = {
  dm_outbound: {
    etichetta: 'Outbound DMs',
    spiegazione:
      'New people the setter wrote to first. Counted once, on the day of the first message: if they answer in the following days it is a conversation.',
  },
  dm_inbound: {
    etichetta: 'Inbound DMs',
    spiegazione: 'New people who wrote to ask about the programme and got an answer. Counted once, on the first day.',
  },
  conversazioni: {
    etichetta: 'Conversations',
    spiegazione:
      'Active conversations: the person answered and the setter answered again. An answer the next day is a conversation of that day. Not part of the total DMs.',
  },
  follow_up: {
    etichetta: 'Follow-ups',
    spiegazione: 'Nudges to people who have not answered yet (for example a «?»). Not split into inbound and outbound.',
  },
  dm_totali: {
    etichetta: 'Total DMs',
    spiegazione: 'Inbound DMs + outbound DMs + follow-ups: the people written to. Conversations do not count.',
  },
  call_proposte: {
    etichetta: 'Calls proposed',
    spiegazione: 'People who were offered a call.',
  },
  discovery_prenotate: {
    etichetta: 'Discovery calls booked',
    spiegazione:
      'Discovery calls booked on the day (or in the chosen period): the calls the setter books (no strategy calls are made with leads).',
  },
  strategy_storico: {
    etichetta: 'Strategy (history)',
    spiegazione:
      'Strategy calls written in the reports of past days, already included in «Calls booked». Today the setter books discovery calls only: they show only in the periods that have them.',
  },
  call_prenotate: {
    etichetta: 'Calls booked',
    spiegazione:
      'The discovery calls booked in the period, from the report. In past days they include the strategy calls of the history too, shown apart when there are some: today the setter books discovery calls only.',
  },
  prenotate_inbound: {
    etichetta: 'Booked from inbound DMs',
    spiegazione:
      'Calls booked on the day (or in the chosen period) with leads from «Inbound DM». Read from the calls in the diary: referral, ads and organic do not count.',
  },
  prenotate_outbound: {
    etichetta: 'Booked from outbound DMs',
    spiegazione:
      'Calls booked on the day (or in the chosen period) with leads from «Outbound DM». Read from the calls in the diary: referral, ads and organic do not count.',
  },
  contenuto_pubblicato: {
    etichetta: 'Content published',
    spiegazione: 'Whether a piece of content went out on the profile that day.',
  },
  lead_in_target: {
    etichetta: 'Leads on target',
    spiegazione:
      'How many of the day’s leads were on target? On target: a man aged 25 or over who wants to change his body and can train at home, with bodyweight. Everyone written to during the day counts, not only who booked the call. Almost all: 3 in 4 or more. About half: roughly 1 in 2. Few: 1 in 4 or less.',
  },
  qualita_conversazioni: {
    etichetta: 'Quality of the conversations',
    spiegazione:
      'How were the day’s conversations? Good: they answer with real sentences, tell their situation, ask questions: it gets to proposing the call. Average: they answer, but in single words or stop after 2 or 3 messages: they need pulling along. Poor: cold answers or curious people with no intention: they disappear soon.',
  },
  tasso_conversazione: {
    etichetta: 'Conversation rate',
    spiegazione: 'Conversations ÷ total DMs.',
  },
  tasso_prenotazione: {
    etichetta: 'Booking rate',
    spiegazione: 'Calls booked ÷ calls proposed.',
  },
  dm_per_call: {
    etichetta: 'DMs per call booked',
    spiegazione: 'Total DMs (inbound + outbound + follow-ups) ÷ calls booked: how many messages it takes to book a call.',
  },
  cash_per_dm: {
    etichetta: 'Cash per DM (new clients)',
    spiegazione:
      'Cash of the period’s new clients ÷ total DMs (inbound + outbound + follow-ups). Instalments of earlier clients, renewals and upsells do not count: they do not come from DMs.',
  },
  revenue_per_dm: {
    etichetta: 'Revenue per DM (new clients)',
    spiegazione:
      'Contract value of the period’s new clients ÷ total DMs (inbound + outbound + follow-ups). Renewals and upsells excluded.',
  },
}

export const LEGENDA_CLOSER_EN: Record<keyof typeof LEGENDA_CLOSER, VoceLegenda> = {
  call: {
    etichetta: 'Calls held',
    spiegazione: 'Calls that took place, with the outcome recorded by the closer. Counted on the day of the call.',
  },
  qualificate: {
    etichetta: 'Qualified',
    spiegazione: 'Calls held with a person on target. A closed call is always qualified.',
  },
  no_show: {
    etichetta: 'No show',
    spiegazione: 'Booked calls the person did not turn up to.',
  },
  follow_up: {
    etichetta: 'Follow-up (call outcome)',
    spiegazione:
      'Calls held with the outcome «Follow-up»: the decision is postponed, the lead is contacted again. Not the setter’s DM follow-ups.',
  },
  cancellate: {
    etichetta: 'Cancelled',
    spiegazione: 'Calls cancelled before taking place.',
  },
  chiuse: {
    etichetta: 'Closed',
    spiegazione:
      'Calls with the outcome «Closed»: usually a new client came in. A renewal or upsell born from a call counts here, but not in cash and revenue, which are new clients only.',
  },
  cash: {
    etichetta: 'Cash',
    spiegazione:
      'New clients only: the first instalment collected of the new sales, on the day they were closed. Later instalments, renewals and upsells stay in Payments and in the Overview.',
  },
  revenue: {
    etichetta: 'Revenue',
    spiegazione: 'New clients only: contract value of the new sales closed that day. Renewals and upsells excluded.',
  },
  show_rate: {
    etichetta: 'Show rate',
    spiegazione: 'Calls held ÷ (held + no show). Cancelled calls and calls awaiting confirmation do not count.',
  },
  close_rate: {
    etichetta: 'Close rate',
    spiegazione: 'Closed ÷ calls held.',
  },
  close_rate_qualificate: {
    etichetta: 'Close rate on qualified',
    spiegazione: 'Closed ÷ qualified calls held.',
  },
}

export const LEGENDA_SETTER_EN: Record<keyof typeof LEGENDA_SETTER, VoceLegenda> = {
  call_fissate: {
    etichetta: 'In the diary in the period',
    spiegazione:
      'Calls with the setter’s name dated in the period, whatever the outcome: the ones he booked and their follow-up calls, booked by the closer on his leads.',
  },
  closer_qualificate: {
    etichetta: 'Qualified (closer)',
    spiegazione: 'Calls held with a person on target, according to the closer. A closed call is always qualified.',
  },
  closer_follow_up: {
    etichetta: 'Follow-up (closer)',
    spiegazione:
      'Calls held with the outcome «Follow-up»: the decision is postponed, the closer gets back in touch. Not the DM follow-ups.',
  },
  cash_miei_clienti: {
    etichetta: 'Cash',
    spiegazione: 'Only the new clients the setter brought: the first instalment they paid to come in, on the day of the sale.',
  },
  revenue_miei_clienti: {
    etichetta: 'Revenue',
    spiegazione:
      'Only the new clients the setter brought: contract value signed on the day (or in the chosen period). Renewals excluded.',
  },
}

export const LEGENDA_ECONOMICS_EN: Record<keyof typeof LEGENDA_ECONOMICS, VoceLegenda> = {
  cash_incassato: {
    etichetta: 'Cash collected',
    spiegazione:
      'All the money that came in during the period, by collection date, net of refunds: new clients, instalments of earlier clients, renewals and upsells.',
  },
  cash_nuovi_clienti: {
    etichetta: 'New clients of the period',
    spiegazione:
      'Part of the cash collected: what the clients who came in during the period paid in the period (sales of type «new» signed in the period, or signed later if they paid a deposit in the period), first instalment and later ones.',
  },
  cash_rate_precedenti: {
    etichetta: 'Instalments of earlier clients',
    spiegazione:
      'Part of the cash collected: instalments paid in the period by clients who came in earlier (sales of type «new» signed before the period). They are not new clients.',
  },
  cash_rinnovi: {
    etichetta: 'Renewals',
    spiegazione:
      'Part of the cash collected: money that came in during the period from sales of type «renewal», instalments included.',
  },
  cash_upsell: {
    etichetta: 'Upsells',
    spiegazione:
      'Part of the cash collected: money that came in during the period from sales of type «upsell», instalments included.',
  },
  revenue_firmata: {
    etichetta: 'Revenue signed',
    spiegazione:
      'Value of the contracts signed in the period, by sale date, of every type: new clients, renewals and upsells.',
  },
  nuovi_clienti: {
    etichetta: 'New clients',
    spiegazione: 'Sales of type «new» signed in the period: the clients who came in during the period.',
  },
  rinnovi: {
    etichetta: 'Renewals',
    spiegazione: 'Sales of type «renewal» signed in the period.',
  },
  margine_operativo: {
    etichetta: 'Operating margin',
    spiegazione: 'Cash collected − commissions accrued − expenses of the period. Taxes are not included.',
  },
  valore_medio_nuovo: {
    etichetta: 'Average new client value',
    spiegazione:
      'Contract value of the period’s new clients ÷ number of new clients (sales of type «new»). Renewals and upsells excluded.',
  },
  cash_per_call_svolta: {
    etichetta: 'Cash per call held (new clients)',
    spiegazione:
      'Cash of the period’s new clients ÷ calls held. Instalments of earlier clients, renewals and upsells excluded.',
  },
  tasso_rinnovo: {
    etichetta: 'Renewal rate',
    spiegazione: 'Clients whose programme ends in the period and who renewed within 30 days ÷ clients ending.',
  },
  call_da_fare: {
    etichetta: 'Calls to do',
    spiegazione: 'Calls in today’s diary whose outcome is not recorded yet.',
  },
  incassato_oggi: {
    etichetta: 'Collected today',
    spiegazione:
      'All the money collected today, net of refunds: instalments of earlier clients and renewals too, not only the sales closed today. Below, the part paid by the new clients who came in today.',
  },
  tasso_qualificazione: {
    etichetta: 'Qualification rate',
    spiegazione: 'Calls held that the closer marked as qualified ÷ calls held.',
  },
  provvigioni_maturate: {
    etichetta: 'Commissions accrued',
    spiegazione:
      'What the setters are owed on the period’s collections from the sales covered by their commission rule (usually new clients only), on the instalments of the months after signing too.',
  },
  costi: {
    etichetta: 'Expenses',
    spiegazione: 'Expenses recorded in «Expenses» dated in the period.',
  },
  in_ritardo: {
    etichetta: 'Late',
    spiegazione: 'Instalments still to collect whose due date has passed.',
  },
  prossimi_30: {
    etichetta: 'Within 30 days',
    spiegazione: 'Instalments to collect due from today to the next 30 days.',
  },
  oltre_30: {
    etichetta: 'Later',
    spiegazione: 'Instalments to collect due in more than 30 days.',
  },
}

type Legende = {
  setting: Record<keyof typeof LEGENDA_SETTING, VoceLegenda>
  closer: Record<keyof typeof LEGENDA_CLOSER, VoceLegenda>
  setter: Record<keyof typeof LEGENDA_SETTER, VoceLegenda>
  economics: Record<keyof typeof LEGENDA_ECONOMICS, VoceLegenda>
  /** «Cosa significa ogni numero»: the title of the closed legend of a page. */
  titolo: string
  /** The «i» of a label. */
  cosaConta: (etichetta: string) => string
}

/** Every legend of a language: the page picks the one it reads. */
export const LEGENDE = bilingue<Legende>(
  {
    setting: LEGENDA_SETTING,
    closer: LEGENDA_CLOSER,
    setter: LEGENDA_SETTER,
    economics: LEGENDA_ECONOMICS,
    titolo: 'Cosa significa ogni numero',
    cosaConta: (etichetta: string) => `Cosa conta «${etichetta}»`,
  },
  {
    setting: LEGENDA_SETTING_EN,
    closer: LEGENDA_CLOSER_EN,
    setter: LEGENDA_SETTER_EN,
    economics: LEGENDA_ECONOMICS_EN,
    titolo: 'What each number means',
    cosaConta: (etichetta: string) => `What «${etichetta}» counts`,
  },
)

export function legende(lingua: Lingua): Legende {
  return LEGENDE[lingua]
}
