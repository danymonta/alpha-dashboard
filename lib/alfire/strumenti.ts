import 'server-only'

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

import { breve } from '@/lib/alfire/cambi'
import { argomentiGuida, testoGuida, type ArgomentoGuida } from '@/lib/alfire/guida'
import { isScrittura, strumentiConsentiti, type NomeStrumento } from '@/lib/alfire/permessi'
import type { Anteprima } from '@/lib/alfire/riassunto'
import { DESCRIZIONE_PROPOSTE, schemaProposte } from '@/lib/alfire/risposte'
import { errore, etichettaRegola, isErrore, risolutori, type Errore, type Supabase } from '@/lib/alfire/risolvi'
import { dataISO, datiDi, definizione, erroreData, SOLO_DI_CHI_CHATTA, type Contesto, type Definizione } from '@/lib/alfire/scritture/comune'
import { scrittureEconomics } from '@/lib/alfire/scritture/economics'
import { strumentiProgetti } from '@/lib/alfire/scritture/progetti'
import { scrittureSetting } from '@/lib/alfire/scritture/setting'
import type { LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'
import { tracciaSpostamento } from '@/lib/call/spostamento'
import { aggiungiGiorni, aggiungiMesi, isDataISO, oggiRoma, primoDelMeseISO } from '@/lib/date'
import {
  MOTIVO_NON_CHIUSURA,
  NOTE_CLOSER,
  NOTE_SETTER,
  SCALE_COMMENTO,
  TESTI_COMMENTO,
  etichettaLivello,
  type CampoScala,
} from '@/lib/setting/commento'
import { ETICHETTA_ESITO } from '@/lib/validation/esito'

const periodo = z.object({
  da: dataISO('Inizio, incluso. Default: primo giorno del mese corrente').optional(),
  a: dataISO('Fine, inclusa. Default: oggi').optional(),
})

/** The notes of a call in call_periodo: their first characters, on one line. */
const LUNGHEZZA_NOTE_CALL = 300

/** Rows read by call_periodo and vendite_periodo: a list cut short says so. */
const CALL_PERIODO = 60
const VENDITE_PERIODO = 40
/** Projects and my open tasks: the same, said in the result (03/10/2026). */
const PROGETTI_ALFIRE = 40
const MIEI_TASK = 40

/**
 * Which calls RLS gives the setter and the closer: only their own. Said in the
 * description and first in the result, so the model never takes them for all
 * the calls of someone else (the bug of 30/09/2026, with the time). The admin
 * reads every call, each with its setter and closer.
 */
const PERIMETRO_CALL: Partial<Record<Profilo['ruolo'], { descrizione: string; risultato: (nome: string) => string }>> = {
  setter: {
    descrizione: 'Solo le call fissate da chi chatta: di un’altra persona mai tutte le sue call.',
    risultato: (nome) =>
      `Solo le call fissate da ${nome}, cioè da chi sta chattando: non tutte le call del team. Di un’altra persona qui ci sono solo le call fissate da ${nome}, mai tutte le sue.`,
  },
  closer: {
    descrizione: 'Solo le call assegnate a chi chatta: di un’altra persona mai tutte le sue call.',
    risultato: (nome) =>
      `Solo le call assegnate a ${nome}, cioè a chi sta chattando: non tutte le call del team. Di un’altra persona qui ci sono solo le call assegnate a ${nome}, mai tutte le sue.`,
  },
}

/**
 * The period asked for, by default the month so far. A date in another format
 * ("28/09/2026", "lunedì") is an error, never the default: the model would
 * answer about a period nobody asked for (03/10/2026).
 */
function leggiPeriodo({ da, a }: { da?: string; a?: string }): { da: string; a: string } | Errore {
  if ((da?.trim() && !isDataISO(da)) || (a?.trim() && !isDataISO(a))) return erroreData()
  const oggi = oggiRoma()
  const inizio = da?.trim() ? da : primoDelMeseISO(oggi)
  const fine = a?.trim() ? a : oggi
  return inizio <= fine ? { da: inizio, a: fine } : { da: fine, a: inizio }
}

/** What Alfire reads: the same views and RPCs as the pages, with the user's session. */
function letture({ supabase, profilo, livelloPm, r }: Contesto) {
  /** Names of the team by id (the directory every role reads), for the rows that point to a person. */
  async function nomiPersone(ids: readonly (string | null)[]): Promise<Map<string, string> | ReturnType<typeof errore>> {
    const unici = [...new Set(ids.filter((id): id is string => Boolean(id)))]
    if (unici.length === 0) return new Map()
    const { data, error } = await supabase.from('profiles').select('id, nome').in('id', unici)
    // a read that fails is never "no setter"
    if (error) return errore('Persone non disponibili.')
    return new Map(data.map((p) => [p.id, p.nome]))
  }

  return {
    // each role reads its own topics (03/10/2026): a coach never the overview, costs or settings
    guida: definizione({
      description: 'Come funziona una parte della dashboard (pagine, regole, permessi).',
      inputSchema: z.object({ argomento: z.enum(argomentiGuida(profilo.ruolo) as [ArgomentoGuida, ...ArgomentoGuida[]]) }),
      execute: async ({ argomento }) => ({ testo: testoGuida(argomento, profilo.ruolo) }),
    }),

    numeri_periodo: definizione({
      description:
        'KPI del periodo con confronto col precedente (cash, revenue, nuovi clienti, rinnovi, margine operativo), ' +
        'cash in 4 parti, provvigioni e costi, indicatori sui soli nuovi clienti e funnel DM → chiuse. Tassi in decimali.',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const [kpi, metriche, funnel] = await Promise.all([
          supabase.rpc('kpi_periodo', { p_da: p.da, p_a: p.a }),
          supabase.rpc('metriche_periodo', { p_da: p.da, p_a: p.a }).single(),
          supabase.rpc('funnel_periodo', { p_da: p.da, p_a: p.a }),
        ])
        if (kpi.error || metriche.error || funnel.error) return errore('Numeri non disponibili.')
        const m = metriche.data
        // picked and named for the model, never added up here: the SQL did it
        return {
          periodo: p,
          kpi: kpi.data,
          // the four parts always add up to cash_incassato
          cash_in_4_parti: {
            nuovi_clienti_del_periodo: m.cash_nuovi_clienti,
            rate_di_clienti_gia_entrati: m.cash_rate_precedenti,
            rinnovi: m.cash_rinnovo,
            upsell: m.cash_upsell,
          },
          provvigioni_maturate: m.provvigioni_maturate,
          costi: m.costi,
          // acquisition: the new clients of the period only; null = no denominator
          solo_nuovi_clienti: {
            revenue: m.revenue_nuovi,
            valore_medio: m.valore_medio_nuovo,
            cash_per_dm: m.cash_per_dm,
            revenue_per_dm: m.revenue_per_dm,
            cash_per_call_svolta: m.cash_per_call_svolta,
          },
          show_rate: m.show_rate,
          close_rate: m.close_rate,
          tasso_rinnovo: m.tasso_rinnovo,
          funnel: funnel.data,
        }
      },
    }),

    cash_per_mese: definizione({
      description:
        'Cash incassato per mese in 4 parti: nuovi_clienti (vendite nuove firmate quel mese), rate_precedenti ' +
        '(rate di clienti entrati nei mesi prima), rinnovo, upsell; più il totale.',
      inputSchema: z.object({ mesi: z.number().int().min(1).max(24).default(6) }),
      execute: async ({ mesi }) => {
        const { data, error } = await supabase.rpc('cash_mensile', { p_mesi: mesi })
        return error ? errore('Cash non disponibile.') : { mesi: data }
      },
    }),

    da_incassare: definizione({
      description:
        'Rate ancora da incassare: totali per fascia (in ritardo, prossimi 30 giorni, oltre) ed elenco delle rate in ritardo con cliente e payment_id.',
      inputSchema: z.object({}),
      execute: async () => {
        const [fasce, ritardi] = await Promise.all([
          supabase.rpc('da_incassare'),
          supabase
            .from('v_rate')
            .select('payment_id, cliente, numero_rata, scadenza, importo_previsto, giorni_ritardo')
            .eq('in_ritardo', true)
            .order('scadenza')
            .limit(25),
        ])
        if (fasce.error || ritardi.error) return errore('Rate non disponibili.')
        return { fasce: fasce.data, in_ritardo: ritardi.data }
      },
    }),

    cerca_clienti: definizione({
      description:
        'Cerca clienti per nome o cognome, o per stato. Dà stato, fonte, setter (chi l’ha portato) e closer, valore firmato, incassato, da incassare e rate in ritardo.',
      inputSchema: z.object({
        testo: z.string().max(60).optional(),
        stato: z.enum(['attivo', 'in_scadenza', 'scaduto', 'ex_cliente', 'mai_attivato']).optional(),
      }),
      execute: async ({ testo, stato }) => {
        let q = supabase
          .from('v_clienti')
          .select('client_id, nome, cognome, stato, fonte, setter_id, closer_id, valore_firmato, incassato, da_incassare, in_ritardo, data_fine_ultima')
          .order('nome')
          .limit(20)
        if (stato) q = q.eq('stato', stato)
        if (testo?.trim()) {
          const t = testo.trim().replace(/[%,()]/g, ' ')
          q = q.or(`nome.ilike.%${t}%,cognome.ilike.%${t}%`)
        }
        const { data, error } = await q
        if (error) return errore('Clienti non disponibili.')
        // who brought each client, by name: never the admin's clients counted as a setter's
        const nomi = await nomiPersone(data.flatMap((c) => [c.setter_id, c.closer_id]))
        if (isErrore(nomi)) return nomi
        return {
          clienti: data.map(({ setter_id, closer_id, ...c }) => ({
            ...c,
            setter: setter_id ? (nomi.get(setter_id) ?? null) : null,
            closer: closer_id ? (nomi.get(closer_id) ?? null) : null,
          })),
        }
      },
    }),

    rate_cliente: definizione({
      description: 'Le vendite e le rate di un cliente (con payment_id), incassate e da incassare.',
      inputSchema: z.object({ cliente: z.string().describe('Nome e cognome') }),
      execute: async ({ cliente }) => {
        const c = await r.trovaCliente(cliente)
        if (!c) return errore('Cliente non trovato.')
        if (isErrore(c)) return c
        const { data, error } = await supabase
          .from('v_rate')
          .select('payment_id, sale_id, tipo, numero_rata, scadenza, importo_previsto, stato, incassato_il, importo_incassato, metodo, in_ritardo')
          .eq('client_id', c.id)
          .order('scadenza')
          .limit(60)
        return error ? errore('Rate non disponibili.') : { cliente: c.nome, rate: data }
      },
    }),

    vendite_periodo: definizione({
      description:
        'Vendite firmate nel periodo, con tipo, setter (chi ha portato il cliente; vuoto: nessuno) e closer, valore, incassato, da incassare e rate in ritardo.',
      inputSchema: periodo.extend({ tipo: z.enum(['nuovo', 'rinnovo', 'upsell']).optional() }),
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        let q = supabase
          .from('sales')
          .select(
            'id, tipo, data_vendita, valore_contratto, numero_rate, prodotto_personalizzato, cliente:clients(nome, cognome), prodotto:products(nome), setter:profiles!sales_setter_id_fkey(nome), closer:profiles!sales_closer_id_fkey(nome)',
          )
          .gte('data_vendita', p.da)
          .lte('data_vendita', p.a)
          .order('data_vendita', { ascending: false })
          .limit(VENDITE_PERIODO)
        if (input.tipo) q = q.eq('tipo', input.tipo)
        const { data, error } = await q
        if (error) return errore('Vendite non disponibili.')
        // the money of each sale from v_vendite, merged by id: nothing is added up here
        const importi =
          data.length > 0
            ? await supabase
                .from('v_vendite')
                .select('sale_id, incassato, da_incassare, rate_in_ritardo')
                .in(
                  'sale_id',
                  data.map((v) => v.id),
                )
            : { data: [], error: null }
        if (importi.error) return errore('Incassi delle vendite non disponibili.')
        const perVendita = new Map((importi.data ?? []).map((i) => [i.sale_id, i]))
        return {
          periodo: p,
          vendite: data.map((v) => {
            const i = perVendita.get(v.id)
            return {
              sale_id: v.id,
              data: v.data_vendita,
              tipo: v.tipo,
              cliente: [v.cliente?.nome, v.cliente?.cognome].filter(Boolean).join(' '),
              // who brought the client and who closed: "Loris's clients" are only the sales with his name
              setter: v.setter?.nome ?? null,
              closer: v.closer?.nome ?? null,
              prodotto: v.prodotto?.nome ?? v.prodotto_personalizzato,
              valore: v.valore_contratto,
              rate: v.numero_rate,
              incassato: i?.incassato ?? null,
              da_incassare: i?.da_incassare ?? null,
              rate_in_ritardo: i?.rate_in_ritardo ?? null,
            }
          }),
          // a list cut short is never the whole period
          ...(data.length >= VENDITE_PERIODO
            ? { nota: `Solo le ${VENDITE_PERIODO} vendite più recenti del periodo: per contarle tutte, un periodo più corto o un tipo.` }
            : {}),
        }
      },
    }),

    metriche_setting: definizione({
      description: 'Metriche di setting e call del periodo per ogni setter (DM, conversazioni, call, show rate, close rate).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const { data, error } = await supabase.rpc('metriche_setting', { p_da: p.da, p_a: p.a })
        return error ? errore('Metriche non disponibili.') : { periodo: p, setter: data }
      },
    }),

    commenti_marketing: definizione({
      description:
        'Cosa dicono i lead, per il marketing, nel periodo. Dal setting (report giornaliero): giorni per livello di lead in target e ' +
        'qualità delle conversazioni, e i giorni con cosa frenava i lead dal fissare la call, domande e contenuti, altre note. ' +
        'Dalle call: il motivo di non chiusura e le note aggiuntive scritti dal closer sulle call svolte finite in follow-up o persa (qui stanno le obiezioni sul prezzo). ' +
        'Per riassumere cosa frena i lead o le obiezioni del mese. Con setter: i suoi report e le call che ha fissato.',
      inputSchema: periodo.extend({ setter: z.string().optional().describe('Nome; vuoto: tutti') }),
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        let setterId: string | undefined
        let setterNome: string | undefined
        if (input.setter?.trim()) {
          const chi = await r.persona(input.setter, ['admin', 'setter'])
          if (isErrore(chi)) return chi
          setterId = chi.id
          setterNome = chi.nome
        }
        // the most recent 60 days and 60 calls with something written: enough to summarize a month
        const limite = 60
        const filtro = { p_da: p.da, p_a: p.a, p_limite: limite, ...(setterId ? { p_setter: setterId } : {}) }
        const [commenti, motivi] = await Promise.all([
          supabase.rpc('commenti_setter_periodo', filtro),
          supabase.rpc('motivi_non_chiusura_periodo', filtro),
        ])
        // a read that fails is never "nothing written"
        if (commenti.error || motivi.error) return errore('Commenti per il marketing non disponibili.')
        // counted in SQL; here only the form's words for each level
        const scale = Object.fromEntries(
          SCALE_COMMENTO.map((scala) => {
            const righe = commenti.data.filter((x) => x.tipo === 'scala' && x.scala === scala.campo)
            return [
              scala.titolo,
              {
                giorni_con_risposta: righe[0]?.su_giorni ?? 0,
                livelli: righe.map((x) => ({
                  livello: etichettaLivello(scala.campo, x.livello),
                  giorni: x.giorni,
                  quota: x.quota,
                })),
              },
            ]
          }),
        )
        // only what was answered and written: a day never says which answer is missing (section 17)
        const giorni = commenti.data
          .filter((x) => x.tipo === 'giorno')
          .map((x) => ({
            data: x.data,
            setter: x.setter,
            ...Object.fromEntries(
              SCALE_COMMENTO.flatMap((scala) => {
                const livello = etichettaLivello(scala.campo as CampoScala, x[scala.campo])
                return livello ? [[scala.titolo, livello]] : []
              }),
            ),
            ...Object.fromEntries(TESTI_COMMENTO.flatMap((t) => (x[t.campo] ? [[t.titolo, x[t.campo]]] : []))),
          }))
        const call = motivi.data.map((c) => ({
          data: c.data,
          lead: c.lead,
          closer: c.closer,
          esito: ETICHETTA_ESITO[c.esito],
          ...(c.motivo ? { [MOTIVO_NON_CHIUSURA.titolo]: c.motivo } : {}),
          ...(c.note_closer ? { [NOTE_CLOSER.titolo]: c.note_closer } : {}),
        }))
        return {
          periodo: p,
          setter: setterNome ?? 'tutti',
          dal_setting: {
            scale,
            giorni_con_testo: giorni,
            ...(giorni.length >= limite ? { nota: `Solo i ${limite} giorni più recenti del periodo.` } : {}),
          },
          dalle_call: call,
          ...(call.length >= limite ? { nota_call: `Solo le ${limite} call più recenti del periodo.` } : {}),
        }
      },
    }),

    provvigioni: definizione({
      description:
        'Provvigioni per persona e mese (maturato, pagato, saldo), le regole di ognuno e i pagamenti registrati (con id).',
      inputSchema: z.object({ mesi: z.number().int().min(1).max(12).default(3) }),
      execute: async ({ mesi }) => {
        const dal = aggiungiMesi(primoDelMeseISO(oggiRoma()), 1 - mesi)
        const [riepilogo, regole, pagamenti] = await Promise.all([
          supabase.rpc('provvigioni_riepilogo', { p_mesi: mesi }),
          supabase
            .from('commission_rules')
            .select('percentuale, applica_a, valida_dal, valida_al, persona:profiles!commission_rules_profile_id_fkey(nome)')
            .order('valida_dal', { ascending: false })
            .limit(30),
          supabase
            .from('commission_payouts')
            .select('id, periodo, importo, pagato_il, metodo, persona:profiles!commission_payouts_profile_id_fkey(nome)')
            .gte('periodo', dal)
            .order('pagato_il', { ascending: false })
            .limit(30),
        ])
        if (riepilogo.error || regole.error || pagamenti.error) return errore('Provvigioni non disponibili.')
        return {
          provvigioni: riepilogo.data,
          regole: (regole.data ?? []).map(({ persona, ...x }) => ({ persona: persona?.nome, ...x, percentuale: etichettaRegola(x) })),
          pagamenti: (pagamenti.data ?? []).map(({ persona, ...x }) => ({ persona: persona?.nome, ...x })),
        }
      },
    }),

    costi_periodo: definizione({
      description: 'Costi del periodo: totali per categoria ed elenco delle voci (con id per costo).',
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const [totali, voci] = await Promise.all([
          supabase.rpc('riepilogo_costi_periodo', { p_da: p.da, p_a: p.a }),
          supabase
            .from('expenses')
            .select('id, data, categoria, descrizione, importo, ricorrente')
            .gte('data', p.da)
            .lte('data', p.a)
            .order('data', { ascending: false })
            .limit(40),
        ])
        if (totali.error || voci.error) return errore('Costi non disponibili.')
        return { periodo: p, per_categoria: totali.data, voci: voci.data }
      },
    }),

    miei_numeri: definizione({
      description: `I numeri del setter che chatta nel periodo, con provvigioni maturate e pagate (solo totali). ${SOLO_DI_CHI_CHATTA}`,
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const { data, error } = await supabase.rpc('miei_numeri_periodo', { p_da: p.da, p_a: p.a })
        return error ? errore('Numeri non disponibili.') : { ...datiDi(profilo), periodo: p, numeri: data?.[0] ?? null }
      },
    }),

    call_periodo: definizione({
      description:
        'Call programmate nel periodo, con lead (e il suo stato), setter (chi l’ha fissata), closer, tipo, stato, esito, da dove è stata spostata, motivo di non chiusura, note del setter e note aggiuntive del closer. ' +
        (PERIMETRO_CALL[profilo.ruolo]?.descrizione ?? 'Tutte le call del team.'),
      inputSchema: periodo,
      execute: async (input) => {
        const p = leggiPeriodo(input)
        if (isErrore(p)) return p
        const { data, error } = await supabase
          .from('calls')
          .select(
            'id, tipo, programmata_il, stato, esito, qualificata, obiezione_principale, note, note_closer, spostata_dal, volte_spostata, lead:leads(nome, stato), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome)',
          )
          // a day of margin on both sides, then the Rome calendar day decides
          .gte('programmata_il', `${aggiungiGiorni(p.da, -1)}T00:00:00Z`)
          .lt('programmata_il', `${aggiungiGiorni(p.a, 2)}T00:00:00Z`)
          .order('programmata_il')
          .limit(CALL_PERIODO)
        if (error) return errore('Call non disponibili.')
        const nelPeriodo = data.filter((c) => {
          const giorno = oggiRoma(new Date(c.programmata_il))
          return giorno >= p.da && giorno <= p.a
        })
        const perimetro = PERIMETRO_CALL[profilo.ruolo]
        return {
          // RLS gives the setter and the closer only their own calls: said first, never read as someone else's all
          ...(perimetro ? { persona: profilo.nome, di_chi: perimetro.risultato(profilo.nome) } : {}),
          periodo: p,
          call: nelPeriodo.map((c) => ({
            call_id: c.id,
            lead: c.lead?.nome,
            stato_lead: c.lead?.stato,
            tipo: c.tipo,
            quando: c.programmata_il,
            stato: c.stato,
            esito: c.esito,
            setter: c.setter?.nome ?? null,
            closer: c.closer?.nome ?? null,
            // a moved call, as its card says: "Spostata dal 30/09 alle 19:00"
            ...(tracciaSpostamento(c) ? { spostata: tracciaSpostamento(c) } : {}),
            // what was written, each text with its author; the notes (up to 2000 characters) shortened:
            // up to 60 calls must fit in a free-plan answer
            ...(c.obiezione_principale?.trim() ? { [MOTIVO_NON_CHIUSURA.titolo]: c.obiezione_principale.trim() } : {}),
            ...(c.note?.trim() ? { [NOTE_SETTER.titolo]: breve(c.note, LUNGHEZZA_NOTE_CALL) } : {}),
            ...(c.note_closer?.trim() ? { [NOTE_CLOSER.diChi]: breve(c.note_closer, LUNGHEZZA_NOTE_CALL) } : {}),
          })),
          // the read stops at 60 calls (the margin days included): the later ones are missing, and the model is told
          ...(data.length >= CALL_PERIODO
            ? { nota: `Elenco parziale: più di ${CALL_PERIODO} call, qui le prime per data. Per contarle tutte, un periodo più corto.` }
            : {}),
        }
      },
    }),

    progetti: definizione({
      description: 'Progetti visibili a chi chatta, con stato, avanzamento, task in ritardo e date. Quello di un cliente porta il suo nome.',
      inputSchema: z.object({ testo: z.string().max(60).optional() }),
      execute: async ({ testo }) => {
        let q = supabase
          .from('v_pm_progetti')
          .select('id, nome, stato, avanzamento, task_totali, task_completati, task_in_ritardo, data_inizio, data_fine')
          .order('nome')
          // one more than shown: a list cut short says so (a project per paying client, 02/10/2026)
          .limit(PROGETTI_ALFIRE + 1)
        if (testo?.trim()) q = q.ilike('nome', `%${testo.trim()}%`)
        const { data: righe, error } = await q
        if (error) return errore('Progetti non disponibili.')
        const data = righe.slice(0, PROGETTI_ALFIRE)
        return {
          // below the projects' admin, RLS gives only the caller's projects: never "the projects Lorenzo works on"
          ...(livelloPm === 'admin'
            ? {}
            : {
                persona: profilo.nome,
                di_chi: `Solo i progetti di cui ${profilo.nome}, cioè chi sta chattando, è membro: non tutti quelli del team, né quelli di un’altra persona.`,
              }),
          progetti: data,
          ...(righe.length > PROGETTI_ALFIRE
            ? { nota: `Elenco parziale: qui i primi ${PROGETTI_ALFIRE} per nome. Per uno in particolare, cercalo per nome (testo); tutti in [Progetti](/progetti).` }
            : {}),
        }
      },
    }),

    miei_task: definizione({
      description: `I task aperti assegnati a chi chatta (anche quelli condivisi con altri), con progetto, scadenza e ritardo. ${SOLO_DI_CHI_CHATTA}`,
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('v_pm_task')
          .select('id, titolo, stato, scadenza, in_ritardo, priorita, progetto_id')
          // a task can have several people: mine when I am one of them
          .contains('assegnatari', [profilo.id])
          .neq('stato', 'completato')
          .order('scadenza', { nullsFirst: false })
          // one more than shown: a coach with a dozen clients has a hundred undated tasks, and the list says it is cut
          .limit(MIEI_TASK + 1)
        if (error) return errore('Task non disponibili.')
        const parziale = data.length > MIEI_TASK
        data.splice(MIEI_TASK)
        // the project by name, as on I miei task: the model never shows an id
        const ids = [...new Set(data.map((t) => t.progetto_id).filter((id): id is string => Boolean(id)))]
        const progetti = ids.length ? await supabase.from('v_pm_progetti').select('id, nome').in('id', ids) : { data: [], error: null }
        if (progetti.error) return errore('Task non disponibili.')
        const nomi = new Map((progetti.data ?? []).map((x) => [x.id, x.nome]))
        return {
          ...datiDi(profilo),
          task: data.map(({ progetto_id, ...t }) => ({ ...t, progetto: (progetto_id && nomi.get(progetto_id)) || null })),
          ...(parziale
            ? {
                nota: `Elenco parziale: qui i primi ${MIEI_TASK}, per scadenza (quelli senza scadenza per ultimi), non tutti. Per un progetto: progetto_dettaglio; tutti in [I miei task](/task).`,
              }
            : {}),
        }
      },
    }),
  }
}

/**
 * Buttons under Alfire's message, for every role. No execute: the call ends
 * the answer and the chat shows the options; a tap is the user's next message.
 */
const proposte: Definizione = {
  strumento: tool({ description: DESCRIZIONE_PROPOSTE, inputSchema: schemaProposte }),
  schema: schemaProposte,
}

/**
 * Every tool, as definitions: reads, answers at a tap, and writes with their
 * preview. The writes live by area in lib/alfire/scritture.
 */
function definizioniAlfire(supabase: Supabase, profilo: Profilo, livelloPm: LivelloPm): Record<NomeStrumento, Definizione> {
  const ctx: Contesto = { supabase, profilo, livelloPm, r: risolutori(supabase, profilo) }
  return {
    ...letture(ctx),
    proponi_risposte: proposte,
    ...scrittureEconomics(ctx),
    ...scrittureSetting(ctx),
    ...strumentiProgetti(ctx),
  } satisfies Record<NomeStrumento, Definizione>
}

export function strumentiAlfire(supabase: Supabase, profilo: Profilo, livelloPm: LivelloPm): ToolSet {
  const tutti = definizioniAlfire(supabase, profilo, livelloPm)
  return Object.fromEntries(
    strumentiConsentiti(profilo.ruolo, livelloPm).map((nome) => [nome, tutti[nome].strumento]),
  ) as ToolSet
}

/**
 * What the confirmation card shows before the tap, read with the user's
 * session: the real row the tool will write (its name from the database, not
 * the model's), before → after for an edit, what a deletion takes with it.
 * An { errore } means the target is not found or not unique: the card hands
 * it to the model, which asks the user.
 */
export async function anteprimaScrittura(
  supabase: Supabase,
  profilo: Profilo,
  livelloPm: LivelloPm,
  nome: string,
  input: unknown,
): Promise<Anteprima> {
  if (!isScrittura(nome) || !strumentiConsentiti(profilo.ruolo, livelloPm).includes(nome)) {
    return errore('Operazione non disponibile per il tuo ruolo.')
  }
  const d = definizioniAlfire(supabase, profilo, livelloPm)[nome]
  const parsed = d.schema.safeParse(input)
  if (!parsed.success) return errore('Dati non validi per questa operazione.')
  if (!d.anteprima) return { righe: [] }
  return d.anteprima(parsed.data)
}
