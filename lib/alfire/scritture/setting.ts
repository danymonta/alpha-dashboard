import 'server-only'

import { z } from 'zod'

import { eliminaCall, modificaCall, registraEsito } from '@/app/(app)/calls/actions'
import { fissaCall } from '@/app/(app)/calls/new/actions'
import { aggiornaStatoLead, eliminaLead, modificaLead } from '@/app/(app)/leads/actions'
import { aggiungiReport, correggiReport, eliminaReport } from '@/app/(app)/setting/actions'
import { salvaReportGiornaliero } from '@/app/(app)/today/actions'
import { breve, cambi, cambio } from '@/lib/alfire/cambi'
import { CONSEGUENZE } from '@/lib/alfire/conseguenze'
import type { Anteprima } from '@/lib/alfire/riassunto'
import { errore, isErrore, isIo, quandoCall, trova, type Call } from '@/lib/alfire/risolvi'
import {
  anteprima,
  anteprimaConConseguenze,
  data,
  definizione,
  enumAzioni,
  type Contesto,
  type Definizione,
} from '@/lib/alfire/scritture/comune'
import { formatOra, isDataISO, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import {
  LIVELLI_IN_TARGET,
  LIVELLI_QUALITA,
  MASSIMO_MOTIVO,
  MASSIMO_NOTE_CLOSER,
  MASSIMO_NOTE_SETTER,
  MASSIMO_TESTO_COMMENTO,
  MOTIVO_NON_CHIUSURA,
  NOTE_CLOSER,
  NOTE_SETTER,
  SCALA_IN_TARGET,
  SCALA_QUALITA,
  TESTI_COMMENTO,
  etichettaLivello,
  type Scala,
} from '@/lib/setting/commento'
import {
  ETICHETTA_FONTE,
  ETICHETTA_PERFORMANCE,
  ETICHETTA_TIPO_CALL,
  FONTI,
  PERFORMANCE,
  TIPI_CALL,
  normalizzaHandle,
  type Fonte,
  type Performance,
  type TipoCall,
} from '@/lib/validation/call'
import { ETICHETTA_ESITO, chiedeMotivo, esitoCallSchema, type SceltaEsito } from '@/lib/validation/esito'
import { ETICHETTA_STATO_LEAD, STATI_LEAD, type StatoLead } from '@/lib/validation/lead'
import { CAMPI_NUMERICI_REPORT as CAMPI_REPORT, GRUPPI_REPORT } from '@/lib/validation/report'

/**
 * Alfire's writes on setting: booking calls, their outcome and details, the
 * lead pipeline, the daily report. The same server actions as "Nuova call",
 * the call sheet, the pipeline and "Oggi" / "Aggiungi giornata".
 */

/**
 * The report counters the setter fills in, with the form's one-line hint.
 * No strategy_prenotate: he books discovery calls only (Dany, 29/09/2026);
 * the column stays for history and keeps its value.
 */
const CAMPI_SETTER = GRUPPI_REPORT.flatMap((g) => g.campi.map(([campo, etichetta, aiuto]) => ({ campo, etichetta, aiuto })))
const NOMI_CAMPI_SETTER = new Set<string>(CAMPI_SETTER.map((c) => c.campo))

const ESITI = ['chiusa', 'follow_up', 'persa', 'no_show', 'cancellata', 'riprogrammata', 'programmata'] as const

/**
 * The setter's comment on the day (lib/setting/commento.ts): the two scales
 * with their meaning, as the form shows them, and the three texts ("Altre
 * note" is the report's note).
 */
const scelteScala = (scala: Scala) => scala.opzioni.map((o) => `${o.valore} = ${o.definizione}`).join('; ')
const TESTI_REPORT = TESTI_COMMENTO
const campiCommento = {
  lead_in_target: z.enum(LIVELLI_IN_TARGET).optional().describe(`${SCALA_IN_TARGET.domanda} ${scelteScala(SCALA_IN_TARGET)}`),
  qualita_conversazioni: z.enum(LIVELLI_QUALITA).optional().describe(`${SCALA_QUALITA.domanda} ${scelteScala(SCALA_QUALITA)}`),
  cosa_frenava: z
    .string()
    .max(MASSIMO_TESTO_COMMENTO)
    .optional()
    .describe('Cosa frenava i lead dal fissare la call (non il prezzo: è del closer). aggiungi accoda, imposta sostituisce, "" toglie'),
  domande_contenuti: z
    .string()
    .max(MASSIMO_TESTO_COMMENTO)
    .optional()
    .describe('Cosa chiedevano i lead e quale contenuto li ha portati a scrivere. Come cosa_frenava'),
  note: z.string().max(2000).optional().describe('Altre note della giornata. Come cosa_frenava'),
}

// ---------------------------------------------------------------------------
// Booking a call (lead and call together)
// ---------------------------------------------------------------------------
function fissaCallStrumento(ctx: Contesto): Definizione {
  const { supabase, profilo } = ctx
  const admin = profilo.ruolo === 'admin'
  const campi = z.object({
    nome: z.string().min(2).max(120),
    instagram_handle: z.string().max(40).optional(),
    fonte: z.enum(FONTI),
    data,
    ora: z.string().describe('HH:MM'),
    closer: z.string().optional().describe('Nome del closer'),
    ...(admin ? { setter: z.string().optional().describe('Nome del setter che l’ha fissata; "io" o vuoto: chi chatta') } : {}),
  })
  type Input = z.infer<typeof campi> & { setter?: string }

  async function persone({ closer, setter }: Input) {
    const { data: elenco } = await supabase
      .from('profiles')
      .select('id, nome, ruolo')
      .in('ruolo', admin ? ['admin', 'closer', 'setter'] : ['admin', 'closer'])
      .eq('attivo', true)
    const tutti = elenco ?? []
    const chiude = tutti.filter((p) => p.ruolo === 'admin' || p.ruolo === 'closer')
    // default closer: the admin who chats runs his own calls; for the setter, the admin
    const predefinito = (admin ? chiude.find((p) => p.id === profilo.id) : null) ?? chiude.find((p) => p.ruolo === 'admin')
    const scelto = closer ? trova(chiude, closer) : (predefinito ?? null)
    if (!scelto || scelto === 'ambiguo') return errore(`Closer non trovato. Possibili: ${chiude.map((p) => p.nome).join(', ')}`)

    // who set it: the admin himself unless he names an active setter; the setter never chooses
    let setterId: string | null = null
    let setterNome: string | null = null
    if (admin) {
      if (!setter?.trim() || isIo(setter)) {
        setterId = profilo.id
      } else {
        const setters = tutti.filter((p) => p.ruolo === 'setter')
        const trovato = trova(setters, setter)
        if (!trovato || trovato === 'ambiguo') {
          return errore(`Setter non trovato. Possibili: io, ${setters.map((p) => p.nome).join(', ')}`)
        }
        setterId = trovato.id
        setterNome = trovato.nome
      }
    }
    return { closer: scelto, setterId, setterNome }
  }

  return definizione({
    description: admin
      ? 'Fissa una discovery call e crea il lead, anche per un setter o per una call già fatta (data passata, fino a un anno). Setter e closer di default: chi chatta.'
      : 'Fissa una discovery call e crea il lead. Closer di default: l’admin.',
    inputSchema: campi,
    execute: async (input) => {
      const v = input as Input
      const p = await persone(v)
      if (isErrore(p)) return p
      const esito = await fissaCall({
        nome: v.nome,
        instagram_handle: v.instagram_handle,
        fonte: v.fonte,
        data: v.data,
        ora: v.ora,
        tipo: 'discovery',
        closer_id: p.closer.id,
        setter_id: p.setterId,
      })
      return esito.ok
        ? { fatto: true, closer: p.closer.nome, ...(p.setterNome ? { setter: p.setterNome } : {}), link: '/calls' }
        : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// A call: outcome, edit, delete
//
// Two notes (Dany, 30/09/2026): "Note del setter" (calls.note), written by the
// setter and the admin, read by the closer; "Note aggiuntive" of the closer
// (calls.note_closer), written with the outcome or the call's details by the
// closer and the admin, read by the setter. The setter gets neither the
// outcome nor the closer's notes; the closer does not get the setter's note.
// ---------------------------------------------------------------------------
function call(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  const ruolo = profilo.ruolo
  const chiFaLaCall = ruolo === 'admin' || ruolo === 'closer'
  const schema = z.object({
    azione: enumAzioni(ctx, 'call'),
    call_id: z.string().uuid().optional().describe('Da call_periodo'),
    lead: z.string().describe('Nome del lead'),
    ...(chiFaLaCall
      ? {
          esito: z.enum(ESITI).optional().describe('programmata annulla l’esito'),
          qualificata: z.boolean().optional().describe('follow_up, persa'),
          motivo: z
            .string()
            .max(MASSIMO_MOTIVO)
            .optional()
            .describe('Motivo di non chiusura: obbligatorio con follow_up e persa, se manca chiedilo'),
        }
      : {}),
    data: data.optional(),
    ora: z.string().optional().describe('HH:MM'),
    // the setter books discovery calls only; admin and closer correct the type of old ones
    ...(chiFaLaCall ? { tipo: z.enum(TIPI_CALL).optional() } : {}),
    // the setter reassigns his calls, the admin any; the closer keeps his own
    ...(ruolo !== 'closer' ? { closer: z.string().optional() } : {}),
    ...(ruolo !== 'closer' ? { note: z.string().max(MASSIMO_NOTE_SETTER).optional().describe(NOTE_SETTER.titolo) } : {}),
    ...(chiFaLaCall
      ? {
          note_closer: z
            .string()
            .max(MASSIMO_NOTE_CLOSER)
            .optional()
            .describe(`${NOTE_CLOSER.diChi}: con esito follow_up o persa, o con modifica; "" le toglie`),
          link_registrazione: z.string().max(500).optional(),
          performance: z.enum(PERFORMANCE).optional(),
          prodotto_proposto: z.string().optional().describe('Nome del prodotto; "nessuno" lo toglie'),
          importo_proposto: z.number().nonnegative().optional(),
        }
      : {}),
  })
  type Input = {
    azione: string
    call_id?: string
    lead: string
    esito?: SceltaEsito
    qualificata?: boolean
    motivo?: string
    data?: string
    ora?: string
    tipo?: TipoCall
    closer?: string
    note?: string
    note_closer?: string
    link_registrazione?: string
    performance?: Performance
    prodotto_proposto?: string
    importo_proposto?: number
  }

  const dettagliChiesti = (v: Input) =>
    chiFaLaCall &&
    [v.link_registrazione, v.performance, v.prodotto_proposto, v.importo_proposto, v.note_closer].some((x) => x !== undefined)

  async function prodottoProposto(nome: string | undefined, attuale: string | null) {
    if (nome === undefined) return attuale
    if (['nessuno', 'nessuna', '-'].includes(nome.trim().toLowerCase())) return null
    const p = await r.trovaProdotto(nome)
    return isErrore(p) ? p : p.id
  }

  /** The call as it is, and the input modificaCall will get. */
  async function unisci(v: Input, c: Call) {
    const closer = ruolo === 'closer' ? c.closer_id : await r.idPersona(v.closer, c.closer_id, ['admin', 'closer'])
    if (isErrore(closer)) return closer
    if (!closer) return errore('La call ha bisogno di un closer.')
    let dettagli = null
    let pitchPrima: number | null = null
    if (dettagliChiesti(v)) {
      const { data: pitch } = await supabase.from('call_pitch').select('importo_proposto').eq('call_id', c.id).maybeSingle()
      pitchPrima = pitch ? Number(pitch.importo_proposto) : null
      const prodotto = await prodottoProposto(v.prodotto_proposto, c.prodotto_proposto_id)
      if (isErrore(prodotto)) return prodotto
      dettagli = {
        link_registrazione: v.link_registrazione ?? c.link_registrazione,
        performance: v.performance ?? c.performance,
        prodotto_proposto_id: prodotto,
        importo_proposto: v.importo_proposto ?? pitchPrima,
        note_closer: v.note_closer ?? c.note_closer,
      }
    }
    return {
      pitchPrima,
      dopo: {
        call_id: c.id,
        // the setter never changes the type: modificaCall keeps his call's own
        tipo: chiFaLaCall ? (v.tipo ?? c.tipo) : c.tipo,
        data: v.data ?? oggiRoma(new Date(c.programmata_il)),
        ora: v.ora ?? formatOra(c.programmata_il),
        closer_id: closer,
        // the closer never rewrites the setter's note (and modifica_call keeps it for him)
        note: ruolo === 'closer' ? c.note : (v.note ?? c.note),
        dettagli,
      },
    }
  }

  /** What registraEsito receives: the closer's notes only with follow_up and persa, as in the sheet. */
  function inputEsito(v: Input, callId: string) {
    return chiedeMotivo(v.esito)
      ? { call_id: callId, esito: v.esito, qualificata: v.qualificata, motivo: v.motivo, note_closer: v.note_closer }
      : { call_id: callId, esito: v.esito }
  }

  function controllaEsito(v: Input, callId: string) {
    if (!v.esito) return errore('Dimmi l’esito della call.')
    // "sposta la call a domani": a new date is an edit, the outcome would drop it
    if (v.data || v.ora) return errore('L’esito non cambia data e ora: per spostare la call usa azione modifica con data e ora.')
    if (chiedeMotivo(v.esito) && v.qualificata === undefined) {
      return errore('Dimmi se il lead era qualificato.')
    }
    // the outcome sheet's own schema: follow_up and persa need the reason for not closing
    const verifica = esitoCallSchema.safeParse(inputEsito(v, callId))
    if (!verifica.success) {
      const problema = verifica.error.issues[0]
      return problema?.path[0] === 'motivo'
        ? errore(`${problema.message}: chiedi perché non ha chiuso (${MOTIVO_NON_CHIUSURA.placeholder.replace(/^Es\. /, 'es. ')}).`)
        : errore(problema?.message ?? 'Esito non valido.')
    }
    return null
  }

  const descrizione =
    ruolo === 'setter'
      ? 'Sposta o corregge una tua call (call_id da call_periodo, o il nome del lead): data, ora, closer, note del setter. Esito, motivo e note aggiuntive li scrive il closer.'
      : `Una call (call_id da call_periodo, o il nome del lead). modifica: sposta a nuova data e ora (data, ora), tipo${
          ruolo === 'admin' ? ', closer, note del setter' : ''
        }, note aggiuntive del closer, link, performance, prodotto e importo proposti. esito = come è andata: chiusa, follow_up o persa (con qualificata e motivo di non chiusura, obbligatorio; note_closer facoltative), ` +
        'no_show, cancellata, riprogrammata (solo se questa call salta e se ne fisserà un’altra; per spostarla usa modifica), ' +
        'programmata (annulla l’esito); dopo chiusa registra la vendita con registra_vendita e il call_id. ' +
        `Lo stato del lead in pipeline non cambia da solo: lead stato.${ruolo === 'admin' ? ' elimina.' : ''}`

  return definizione({
    description: descrizione,
    inputSchema: schema,
    anteprima: async (input): Promise<Anteprima> => {
      const v = input as Input
      const c = await r.trovaCall({ call_id: v.call_id, lead: v.lead })
      if (isErrore(c)) return c
      const chi = `${c.lead?.nome ?? v.lead} del ${quandoCall(c)}`
      if (v.azione === 'esito') {
        const manca = controllaEsito(v, c.id)
        if (manca) return manca
        const esito = v.esito as SceltaEsito
        const nonChiusa = chiedeMotivo(esito)
        return anteprima(`Registro l’esito della call con ${chi}: ${ETICHETTA_ESITO[esito]}`, [
          `Ora: ${c.esito ? ETICHETTA_ESITO[c.esito as SceltaEsito] : (ETICHETTA_ESITO[c.stato as SceltaEsito] ?? c.stato)}`,
          nonChiusa ? `Qualificata: ${v.qualificata ? 'sì' : 'no'}` : null,
          // written in full, as the database will keep them; a saved one shows before → after
          nonChiusa
            ? (cambio(MOTIVO_NON_CHIUSURA.titolo, c.obiezione_principale, v.motivo?.trim(), 'lungo') ??
              `${MOTIVO_NON_CHIUSURA.titolo}: ${v.motivo?.trim()}`)
            : null,
          // any other outcome clears it (aggiornamentoDaEsito): the card says so
          !nonChiusa && c.obiezione_principale?.trim()
            ? `${MOTIVO_NON_CHIUSURA.titolo}: ${breve(c.obiezione_principale)} → ${MOTIVO_NON_CHIUSURA.tolto}`
            : null,
          nonChiusa && v.note_closer !== undefined ? cambio(NOTE_CLOSER.titolo, c.note_closer, v.note_closer, 'lungo') : null,
          esito === 'chiusa' ? 'Poi registriamo la vendita.' : null,
        ])
      }
      if (v.azione === 'elimina') return anteprima(`Elimino la call con ${chi}`, [...CONSEGUENZE.call])
      const u = await unisci(v, c)
      if (isErrore(u)) return u
      const nomi = await r.nomi([c.closer_id, u.dopo.closer_id])
      const nomiProdotti = new Map<string, string>()
      if (u.dopo.dettagli) {
        const ids = [c.prodotto_proposto_id, u.dopo.dettagli.prodotto_proposto_id].filter((x): x is string => Boolean(x))
        if (ids.length > 0) {
          const { data: prodotti } = await supabase.from('products').select('id, nome').in('id', ids)
          for (const p of prodotti ?? []) nomiProdotti.set(p.id, p.nome)
        }
      }
      const d = u.dopo.dettagli
      return anteprima(
        `Correggo la call con ${chi}`,
        cambi([
          ['Data', oggiRoma(new Date(c.programmata_il)), u.dopo.data, 'data'],
          ['Ora', formatOra(c.programmata_il), u.dopo.ora],
          ['Tipo', ETICHETTA_TIPO_CALL[c.tipo], ETICHETTA_TIPO_CALL[u.dopo.tipo]],
          ['Closer', nomi.get(c.closer_id), nomi.get(u.dopo.closer_id)],
          [NOTE_SETTER.titolo, c.note, u.dopo.note, 'lungo'],
          ...(d
            ? ([
                ['Registrazione', c.link_registrazione, d.link_registrazione],
                [
                  'Performance',
                  c.performance ? ETICHETTA_PERFORMANCE[c.performance as Performance] : null,
                  d.performance ? ETICHETTA_PERFORMANCE[d.performance as Performance] : null,
                ],
                [
                  'Prodotto proposto',
                  c.prodotto_proposto_id ? nomiProdotti.get(c.prodotto_proposto_id) : null,
                  d.prodotto_proposto_id ? nomiProdotti.get(d.prodotto_proposto_id) : null,
                ],
                ['Importo proposto', u.pitchPrima, d.importo_proposto, 'euro'],
                [NOTE_CLOSER.titolo, c.note_closer, d.note_closer, 'lungo'],
              ] as const)
            : []),
        ]),
      )
    },
    execute: async (input) => {
      const v = input as Input
      const c = await r.trovaCall({ call_id: v.call_id, lead: v.lead })
      if (isErrore(c)) return c
      if (v.azione === 'esito') {
        const manca = controllaEsito(v, c.id)
        if (manca) return manca
        const esito = await registraEsito(inputEsito(v, c.id))
        if (!esito.ok) return errore(esito.errore)
        return v.esito === 'chiusa'
          ? { fatto: true, call_id: c.id, poi: 'Registra la vendita con registra_vendita e questo call_id.', link: '/calls' }
          : { fatto: true, link: '/calls' }
      }
      if (v.azione === 'elimina') {
        const esito = await eliminaCall({ id: c.id })
        return esito.ok ? { fatto: true, link: '/calls' } : errore(esito.errore)
      }
      const u = await unisci(v, c)
      if (isErrore(u)) return u
      const esito = await modificaCall(u.dopo)
      return esito.ok ? { fatto: true, link: '/calls' } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// A lead of the pipeline
// ---------------------------------------------------------------------------
function lead(ctx: Contesto): Definizione {
  const { r, profilo } = ctx
  const modifica = profilo.ruolo === 'admin' || profilo.ruolo === 'setter'
  const schema = z.object({
    azione: enumAzioni(ctx, 'lead'),
    lead: z.string().describe('Nome o @handle'),
    stato: z.enum(STATI_LEAD).optional().describe('call_fissata = Call da fare'),
    ...(modifica
      ? {
          nome: z.string().min(2).max(120).optional(),
          instagram_handle: z.string().max(40).optional(),
          fonte: z.enum(FONTI).optional(),
          note: z.string().max(1000).optional(),
        }
      : {}),
  })
  type Input = { azione: string; lead: string; stato?: StatoLead; nome?: string; instagram_handle?: string; fonte?: Fonte; note?: string }

  const descrizione = [
    'Un lead della pipeline (nome o @handle).',
    'stato in pipeline: Call da fare → Follow-up → Cliente / Perso (come è andata una call è call esito).',
    modifica ? 'modifica: nome, handle, fonte, note.' : null,
    profilo.ruolo === 'admin' ? 'elimina: con le sue call.' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return definizione({
    description: descrizione,
    inputSchema: schema,
    anteprima: async (input): Promise<Anteprima> => {
      const v = input as Input
      const l = await r.trovaLead(v.lead)
      if (isErrore(l)) return l
      if (v.azione === 'stato') {
        if (!v.stato) return errore('Dimmi in che stato spostarlo.')
        return anteprima(`Sposto ${l.nome} in «${ETICHETTA_STATO_LEAD[v.stato]}»`, [
          `Ora: ${ETICHETTA_STATO_LEAD[l.stato as StatoLead] ?? l.stato}`,
        ])
      }
      if (v.azione === 'elimina') return anteprimaConConseguenze(`Elimino il lead ${l.nome}`, 'lead', l.id)
      return anteprima(
        `Correggo il lead ${l.nome}`,
        cambi([
          ['Nome', l.nome, v.nome ?? l.nome],
          ['Instagram', l.instagram_handle, v.instagram_handle === undefined ? l.instagram_handle : normalizzaHandle(v.instagram_handle)],
          ['Fonte', ETICHETTA_FONTE[l.fonte as Fonte], ETICHETTA_FONTE[(v.fonte ?? l.fonte) as Fonte]],
          ['Note', l.note, v.note ?? l.note, 'lungo'],
        ]),
      )
    },
    execute: async (input) => {
      const v = input as Input
      const l = await r.trovaLead(v.lead)
      if (isErrore(l)) return l
      let esito: { ok: true } | { ok: false; errore: string }
      if (v.azione === 'stato') {
        if (!v.stato) return errore('Dimmi in che stato spostarlo.')
        esito = await aggiornaStatoLead({ lead_id: l.id, stato: v.stato })
      } else if (v.azione === 'elimina') {
        esito = await eliminaLead({ id: l.id })
      } else {
        esito = await modificaLead({
          id: l.id,
          nome: v.nome ?? l.nome,
          instagram_handle: v.instagram_handle ?? l.instagram_handle,
          fonte: v.fonte ?? l.fonte,
          note: v.note ?? l.note,
        })
      }
      return esito.ok ? { fatto: true, link: '/leads' } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// The daily report: the setter his own days, the admin anyone's
// ---------------------------------------------------------------------------
function aggiornaReport(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  const admin = profilo.ruolo === 'admin'
  const schema = z.object({
    ...(admin ? { setter: z.string().optional().describe('Nome del setter; "io" o vuoto: chi chatta') } : {}),
    data: data.optional(),
    modalita: enumAzioni(ctx, 'aggiorna_report').describe(
      admin ? 'aggiungi somma, imposta sostituisce, elimina toglie il giorno' : 'aggiungi somma ai numeri già salvati, imposta li sostituisce',
    ),
    ...Object.fromEntries(
      CAMPI_SETTER.map(({ campo, aiuto }) => [campo, z.number().int().min(0).max(5000).optional().describe(aiuto)]),
    ),
    contenuto_pubblicato: z.boolean().optional(),
    ...campiCommento,
  })
  type Riga = Record<string, unknown> & {
    id: string
    note: string | null
    contenuto_pubblicato: boolean
    lead_in_target: string | null
    qualita_conversazioni: string | null
    cosa_frenava: string | null
    domande_contenuti: string | null
  }

  async function giornata(v: Record<string, unknown>) {
    const giorno = typeof v.data === 'string' && isDataISO(v.data) ? v.data : oggiRoma()
    const chi = admin ? await r.persona(typeof v.setter === 'string' && v.setter.trim() ? v.setter : 'io', ['admin', 'setter']) : { id: profilo.id, nome: profilo.nome }
    if (isErrore(chi)) return chi
    const { data: attuale } = await supabase
      .from('setter_daily_reports')
      .select('*')
      .eq('setter_id', chi.id)
      .eq('data', giorno)
      .maybeSingle()
    const valori: Record<string, unknown> = { data: giorno, note: attuale?.note ?? null }
    for (const campo of CAMPI_REPORT) {
      const prima = Number(attuale?.[campo] ?? 0)
      // a field the setter does not fill any more keeps what is saved
      const nuovo = NOMI_CAMPI_SETTER.has(campo) ? v[campo] : undefined
      valori[campo] = typeof nuovo === 'number' ? (v.modalita === 'aggiungi' ? prima + nuovo : nuovo) : prima
    }
    valori.contenuto_pubblicato =
      typeof v.contenuto_pubblicato === 'boolean' ? v.contenuto_pubblicato : (attuale?.contenuto_pubblicato ?? false)
    // the comment: a scale said is set, one not said keeps what is saved
    for (const campo of ['lead_in_target', 'qualita_conversazioni'] as const) {
      valori[campo] = typeof v[campo] === 'string' ? v[campo] : (attuale?.[campo] ?? null)
    }
    // a text: aggiungi puts it under the saved one, imposta replaces it, "" clears it
    for (const { campo } of TESTI_REPORT) {
      const prima = (attuale?.[campo] as string | null | undefined) ?? null
      const nuovo = v[campo]
      if (typeof nuovo !== 'string') valori[campo] = prima
      else if (nuovo.trim() === '') valori[campo] = null
      else valori[campo] = v.modalita === 'aggiungi' && prima ? `${prima}\n${nuovo.trim()}` : nuovo.trim()
    }
    return { giorno, chi, attuale: (attuale ?? null) as Riga | null, valori }
  }

  /** The comment's lines for a new day: every answer that will be written, texts in full. */
  const righeCommento = (valori: Record<string, unknown>) => [
    ...[SCALA_IN_TARGET, SCALA_QUALITA].map((s) => {
      const livello = etichettaLivello(s.campo, valori[s.campo] as string | null)
      return livello ? `${s.titolo}: ${livello}` : null
    }),
    ...TESTI_REPORT.map((t) => (valori[t.campo] ? `${t.titolo}: ${valori[t.campo]}` : null)),
  ]

  const di = (chi: { id: string; nome: string }) => (chi.id === profilo.id ? 'il tuo report' : `il report di ${chi.nome}`)

  return definizione({
    description: admin
      ? 'Il report giornaliero di un setter (o tuo), numeri e com’è andata (lead in target, qualità delle conversazioni, cosa frenava i lead, domande e contenuti, altre note): aggiungi somma ai numeri già salvati, imposta li sostituisce, elimina toglie il giorno. Data di default: oggi.'
      : 'Aggiorna il report giornaliero del setter, numeri e com’è andata (lead in target, qualità delle conversazioni, cosa frenava i lead, domande e contenuti, altre note). modalita "aggiungi" somma ai numeri già salvati, "imposta" li sostituisce. Data di default: oggi.',
    inputSchema: schema,
    anteprima: async (input): Promise<Anteprima> => {
      const v = input as Record<string, unknown>
      const g = await giornata(v)
      if (isErrore(g)) return g
      const titolo = (verbo: string) => `${verbo} ${di(g.chi)} del ${formatData(g.giorno)}`
      if (v.modalita === 'elimina') {
        if (!g.attuale) return errore(`Nessun report di ${g.chi.nome} il ${formatData(g.giorno)}.`)
        const riga = g.attuale
        return anteprima(titolo('Elimino'), [
          CAMPI_SETTER.map(({ campo, etichetta }) => `${riga[campo] ?? 0} ${etichetta}`).join(', '),
          ...CONSEGUENZE.report,
        ])
      }
      if (!g.attuale) {
        return anteprima(titolo('Compilo'), [
          'Giornata nuova.',
          ...CAMPI_SETTER.filter(({ campo }) => Number(g.valori[campo]) > 0).map(({ campo, etichetta }) => `${etichetta}: ${g.valori[campo]}`),
          ...righeCommento(g.valori),
        ])
      }
      const riga = g.attuale
      return anteprima(titolo('Correggo'), [
        'C’è già: lo correggo.',
        ...cambi([
          ...CAMPI_SETTER.map(({ campo, etichetta }) => [etichetta, riga[campo] ?? 0, g.valori[campo]] as const),
          ['Contenuto pubblicato', riga.contenuto_pubblicato, g.valori.contenuto_pubblicato, 'si_no'] as const,
          ...[SCALA_IN_TARGET, SCALA_QUALITA].map(
            (s) =>
              [
                s.titolo,
                etichettaLivello(s.campo, riga[s.campo]),
                etichettaLivello(s.campo, g.valori[s.campo] as string | null),
              ] as const,
          ),
          ...TESTI_REPORT.map((t) => [t.titolo, riga[t.campo], g.valori[t.campo], 'lungo'] as const),
        ]),
      ])
    },
    execute: async (input) => {
      const v = input as Record<string, unknown>
      const g = await giornata(v)
      if (isErrore(g)) return g
      if (v.modalita === 'elimina') {
        if (!g.attuale) return errore(`Nessun report di ${g.chi.nome} il ${formatData(g.giorno)}.`)
        const esito = await eliminaReport({ id: g.attuale.id })
        return esito.ok ? { fatto: true, link: '/setting' } : errore(esito.errore)
      }
      if (!admin) {
        const esito = await salvaReportGiornaliero(g.valori)
        return esito.ok ? { fatto: true, report: g.valori, link: '/today' } : errore(esito.errore)
      }
      // the admin: a new day is added, a day already there is corrected (never overwritten by an insert)
      const campi = { ...g.valori }
      delete campi.data
      const esito = g.attuale
        ? await correggiReport({ id: g.attuale.id, ...campi })
        : await aggiungiReport({ ...g.valori, setter_id: g.chi.id })
      return esito.ok ? { fatto: true, report: g.valori, link: '/setting' } : errore(esito.errore)
    },
  })
}

export function scrittureSetting(ctx: Contesto) {
  return {
    fissa_call: fissaCallStrumento(ctx),
    call: call(ctx),
    lead: lead(ctx),
    aggiorna_report: aggiornaReport(ctx),
  }
}
