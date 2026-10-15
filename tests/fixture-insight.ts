import type { ChatSalvata, MessaggioChat, PostInsight, SchedaSalvata, StatoLeadApp, VoceAgendaApp } from '@/lib/insight/contratti'

// Invented chats, posts and app rows for the tests of the Insight's AI layer
// (1.35.0). Never a real DM, handle or name here.

let progressivo = 0

/** A message: author, ISO instant, text; codes and story optional. */
export function msg(da: 'lead' | 'alpha', il: string, testo: string, extra: Partial<MessaggioChat> = {}): MessaggioChat {
  return { da, il, testo, codici: [], storia: false, ...extra }
}

export function chatFinta(extra: Partial<ChatSalvata> = {}): ChatSalvata {
  progressivo++
  const messaggi = extra.messaggi ?? [msg('lead', '2026-10-14T08:00:00.000Z', 'Ciao, vorrei informazioni')]
  const ultimo = messaggi.at(-1)
  return {
    id: `00000000-0000-4000-8000-${String(progressivo).padStart(12, '0')}`,
    canale: 'instagram',
    conversazione_id: `conv-${progressivo}`,
    username: `lead_finto_${progressivo}`,
    utente_id: String(1000 + progressivo),
    nome: `Lead Finto ${progressivo}`,
    aggiornata_il: ultimo?.il ?? null,
    messaggi,
    messaggi_letti: messaggi.length,
    completa: true,
    ultimo_da: ultimo?.da ?? null,
    ultimo_il: ultimo?.il ?? null,
    calendly_inviato_il: null,
    codici_condivisi: [],
    non_lead: false,
    letta_il: '2026-10-14T16:00:00.000Z',
    origine_tipo: null,
    origine_shortcode: null,
    origine_il: null,
    origine_giorno: null,
    ultimo_target: null,
    minore_14: false,
    letta_da: null,
    ...extra,
  }
}

export function postFinto(shortcode: string, pubblicato_il: string, extra: Partial<PostInsight> = {}): PostInsight {
  return {
    shortcode,
    permalink: `https://www.instagram.com/reel/${shortcode}/`,
    pubblicato_il,
    media_type: 'VIDEO',
    reel: true,
    didascalia: 'Due ore a settimana bastano. Il resto è costanza.',
    views: 1000,
    saved: 10,
    shares: 5,
    ...extra,
  }
}

export function statoFinto(chiave: string, extra: Partial<StatoLeadApp> = {}): StatoLeadApp {
  return {
    chiave,
    per: 'username',
    stato_lead: 'call_fissata',
    fonte: 'dm_inbound',
    prossima_call_il: null,
    prossima_call_stato: null,
    ultimo_esito: null,
    no_show_precedenti: 0,
    cliente: false,
    ha_call: true,
    ...extra,
  }
}

export function voceAgendaFinta(extra: Partial<VoceAgendaApp> = {}): VoceAgendaApp {
  progressivo++
  return {
    giorno: 'oggi',
    call_id: `call-${progressivo}`,
    programmata_il: '2026-10-14T17:30:00.000Z',
    lead_id: `lead-${progressivo}`,
    nome: `Lead Agenda ${progressivo}`,
    username: `lead_agenda_${progressivo}`,
    fonte: 'dm_inbound',
    stato: 'programmata',
    esito: null,
    di_follow_up: false,
    volte_spostata: 0,
    no_show_precedenti: 0,
    ...extra,
  }
}

/** A lead card as the strict layer stores it. */
export function cartaLead(chiave: string, extra: Record<string, unknown> = {}, tipo: SchedaSalvata['tipo'] = 'lead'): SchedaSalvata {
  return {
    tipo,
    chiave,
    impronta: 'a'.repeat(64),
    dati: {
      tipo: 'lead',
      nome_dal_lead: '',
      age: '',
      fascia_eta: 'ignota',
      flow: 'inbound',
      priority: 'media',
      target: 'da verificare',
      stage: 'obiettivi',
      status: 'in conversazione',
      situation: 'Lavora tanto.',
      pain: 'Non si piace.',
      next_action: 'Rispondi oggi.',
      suggested_message: 'Grazie per avermi scritto.\nChe obiettivo hai?',
      suggested_message_alt: '',
      alt_condition: '',
      needs_dany: '',
      topics: ['poco tempo'],
      post_shortcode: null,
      no_contatto: false,
      objection: { text: '', suggested_reply: '' },
      ...extra,
    },
  }
}

export function cartaNonLead(chiave: string, reason = 'Account di un brand.'): SchedaSalvata {
  return { tipo: 'non_lead', chiave, impronta: 'b'.repeat(64), dati: { tipo: 'non_lead', reason } }
}
