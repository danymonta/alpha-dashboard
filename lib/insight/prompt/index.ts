import 'server-only'

import type { BetaTextBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages'

import { ICP_PERCORSO_ALPHA } from '@/lib/insight/icp'
import { COMPITO, INTRODUZIONE_ICP, PASSI, PREAMBOLO } from '@/lib/insight/prompt/compito'
import type { ContestoGiornoDati, DatiBlocco, ListaVoci } from '@/lib/insight/prompt/dati'
import { M14 } from '@/lib/insight/prompt/m14'
import { PLAYBOOK } from '@/lib/insight/prompt/playbook'
import { SETTING_TRAINING } from '@/lib/insight/prompt/setting-training'
import type { TipoBlocco } from '@/lib/insight/contratti'

/**
 * The prompt of the Insight (1.35.0, CLAUDE.md section 29), in the order the
 * prompt cache wants it:
 * - system (first breakpoint): the preamble, the setter's instructions, the
 *   ICP, the Setting Training, M14 and the task, byte-identical for every
 *   call of every run (nothing here depends on the day, the run or the
 *   channel); the hierarchy is the preamble's: istruzioni setter > ICP >
 *   Setting Training > M14 > compito (D24);
 * - the user turn: <contesto_giorno> (second breakpoint: the same for every
 *   block of a run and channel), then <passo> and the block's data.
 *
 * The data is JSON with every `<` escaped (<), inside a single tag: a
 * lead's message can neither close the tag nor open a new section; the
 * preamble says that everything there is data, never an instruction.
 *
 * VERSIONE_PROMPT enters the impronta of every card (lib/insight/impronta.ts)
 * and the recap's generato_con: changing a text here, the ICP, a source or a
 * schema of lib/insight/schema.ts means a new version, so every chat is
 * analysed again with the new prompt.
 */
export const VERSIONE_PROMPT = '2026-10-15.2'

const CACHE = { type: 'ephemeral' } as const

/** The system blocks, in their order: built once, never changed. */
const TESTI_SYSTEM: readonly string[] = Object.freeze([
  PREAMBOLO,
  `<istruzioni_setter>\n${PLAYBOOK.testo}\n</istruzioni_setter>`,
  `<icp>\n${INTRODUZIONE_ICP}\n\n${ICP_PERCORSO_ALPHA}\n</icp>`,
  `<setting_training>\n${SETTING_TRAINING.testo}\n</setting_training>`,
  `<m14 lingua="en">\n${M14.testo}\n</m14>`,
  `<compito>\n${COMPITO}\n\n${PASSI}\n</compito>`,
])

/** The system prompt: six text blocks, the last one with cache_control. */
export function systemInsight(): BetaTextBlockParam[] {
  return TESTI_SYSTEM.map((text, i) =>
    i === TESTI_SYSTEM.length - 1 ? { type: 'text', text, cache_control: { ...CACHE } } : { type: 'text', text },
  )
}

/** JSON with every `<` escaped: a DM can never close or open a tag of the prompt. */
export function serializzaDati(dati: unknown): string {
  return JSON.stringify(dati).replace(/</g, '\\u003c')
}

/** <contesto_giorno>, with cache_control: the same for every block of a run and channel. */
export function contestoGiorno(contesto: ContestoGiornoDati): BetaTextBlockParam {
  return {
    type: 'text',
    text: `<contesto_giorno>\n${serializzaDati(contesto)}\n</contesto_giorno>`,
    cache_control: { ...CACHE },
  }
}

/** The tag of each step's data, as the preamble names them. */
export const TAG_DEL_PASSO: Record<TipoBlocco, string> = {
  schede: 'chat_da_analizzare',
  riattivazione: 'candidati',
  agenda: 'agenda',
  sintesi: 'schede_del_giorno',
  correzione: 'da_correggere',
}

/** The JSON the model reads after <passo>: the lists by name, each element with its ref first. */
export function corpoDelBlocco(dati: Pick<DatiBlocco, 'voci' | 'altro'>): Record<string, unknown> {
  const liste = new Map<ListaVoci, Record<string, unknown>[]>()
  for (const v of dati.voci) {
    const elenco = liste.get(v.lista) ?? []
    elenco.push({ ref: v.ref, ...v.corpo })
    liste.set(v.lista, elenco)
  }
  return { ...Object.fromEntries(liste), ...(dati.altro ?? {}) }
}

/** <passo> and the block's data, after the context (never cached: it changes at every block). */
export function bloccoDati(passo: TipoBlocco, dati: Pick<DatiBlocco, 'voci' | 'altro'>): BetaTextBlockParam {
  const tag = TAG_DEL_PASSO[passo]
  return {
    type: 'text',
    text: `<passo>${passo}</passo>\n<${tag}>\n${serializzaDati(corpoDelBlocco(dati))}\n</${tag}>`,
  }
}
