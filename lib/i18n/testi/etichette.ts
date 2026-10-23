import { bilingue } from '@/lib/i18n/lingua'
import type { Database } from '@/lib/supabase/database.types'

type Enum<N extends keyof Database['public']['Enums']> = Database['public']['Enums'][N]

/**
 * The labels of the database's values (1.53.0): the same ones the forms, the badges and
 * the filters show, in the two languages. The Italian ones are those of lib/validation and
 * of the badges, word for word: a page that reads ETICHETTE[lingua] shows in Italian
 * exactly what it showed before.
 */
export const ETICHETTE = bilingue(
  {
    fonte: {
      dm_inbound: 'DM inbound',
      dm_outbound: 'DM outbound',
      referral: 'Referral',
      organico: 'Organico',
      ads: 'Ads',
      altro: 'Altro',
    } satisfies Record<Enum<'lead_source'>, string>,
    tipoVendita: { nuovo: 'Nuovo', rinnovo: 'Rinnovo', upsell: 'Upsell' } satisfies Record<Enum<'sale_type'>, string>,
    metodo: {
      bonifico: 'Bonifico',
      stripe: 'Stripe',
      paypal: 'PayPal',
      carta: 'Carta',
      contanti: 'Contanti',
      altro: 'Altro',
    } satisfies Record<Enum<'payment_method'>, string>,
    statoRata: {
      prevista: 'Prevista',
      incassata: 'Incassata',
      fallita: 'Fallita',
      rimborsata: 'Rimborsata',
      inRitardo: 'In ritardo',
    },
    statoCliente: {
      attivo: 'Attivo',
      in_scadenza: 'In scadenza',
      da_iniziare: 'Da iniziare',
      sospeso: 'Sospeso',
      scaduto: 'Scaduto',
      chiuso: 'Chiuso',
      ex_cliente: 'Ex cliente',
      mai_attivato: 'Mai attivato',
    } satisfies Record<Enum<'client_status'>, string>,
    statoLead: {
      call_fissata: 'Call da fare',
      follow_up: 'Follow-up',
      cliente: 'Cliente',
      perso: 'Perso',
    } satisfies Record<Enum<'lead_status'>, string>,
    statoLeadBreve: {
      call_fissata: 'Da fare',
      follow_up: 'Follow-up',
      cliente: 'Cliente',
      perso: 'Perso',
    } satisfies Record<Enum<'lead_status'>, string>,
    tipoCall: { discovery: 'Discovery', strategy: 'Strategy' } satisfies Record<Enum<'call_type'>, string>,
    performance: {
      ottima: 'Ottima',
      buona: 'Buona',
      discreta: 'Discreta',
      media: 'Media',
      scarsa: 'Scarsa',
    } satisfies Record<Enum<'call_performance'>, string>,
    esito: {
      chiusa: 'Chiusa',
      follow_up: 'Follow-up',
      persa: 'Persa',
      no_show: 'No show',
      cancellata: 'Cancellata',
      riprogrammata: 'In attesa di conferma',
      programmata: 'Da fare',
      svolta: 'Svolta',
    },
    categoriaCosto: {
      team: 'Team',
      software: 'Software',
      ads: 'Ads',
      formazione: 'Formazione',
      altro: 'Altro',
    } satisfies Record<Enum<'expense_category'>, string>,
  },
  {
    fonte: {
      dm_inbound: 'Inbound DM',
      dm_outbound: 'Outbound DM',
      referral: 'Referral',
      organico: 'Organic',
      ads: 'Ads',
      altro: 'Other',
    },
    tipoVendita: { nuovo: 'New', rinnovo: 'Renewal', upsell: 'Upsell' },
    metodo: {
      bonifico: 'Bank transfer',
      stripe: 'Stripe',
      paypal: 'PayPal',
      carta: 'Card',
      contanti: 'Cash',
      altro: 'Other',
    },
    statoRata: {
      prevista: 'Expected',
      incassata: 'Collected',
      fallita: 'Failed',
      rimborsata: 'Refunded',
      inRitardo: 'Late',
    },
    statoCliente: {
      attivo: 'Active',
      in_scadenza: 'Ending soon',
      da_iniziare: 'Not started',
      sospeso: 'On hold',
      scaduto: 'Expired',
      chiuso: 'Closed',
      ex_cliente: 'Former client',
      mai_attivato: 'Never activated',
    },
    statoLead: {
      call_fissata: 'Call to do',
      follow_up: 'Follow-up',
      cliente: 'Client',
      perso: 'Lost',
    },
    statoLeadBreve: {
      call_fissata: 'To do',
      follow_up: 'Follow-up',
      cliente: 'Client',
      perso: 'Lost',
    },
    tipoCall: { discovery: 'Discovery', strategy: 'Strategy' },
    performance: {
      ottima: 'Excellent',
      buona: 'Good',
      discreta: 'Fair',
      media: 'Average',
      scarsa: 'Poor',
    },
    esito: {
      chiusa: 'Closed',
      follow_up: 'Follow-up',
      persa: 'Lost',
      no_show: 'No show',
      cancellata: 'Cancelled',
      riprogrammata: 'Awaiting confirmation',
      programmata: 'To do',
      svolta: 'Held',
    },
    categoriaCosto: {
      team: 'Team',
      software: 'Software',
      ads: 'Ads',
      formazione: 'Training',
      altro: 'Other',
    },
  },
)
