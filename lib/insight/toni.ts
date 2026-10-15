import type { PrioritaLead, TargetLead } from '@/lib/insight/recap'

/**
 * The tones of the Insight's pills, from the artifact "Recap DM Alpha" (its
 * classes hot, warm, ok and the plain one) mapped to the app's status tokens
 * (CLAUDE.md section 11): critico, attenzione, ok, neutro. Pure: the icons and
 * the words that go with every tone (never colour alone) are the components'.
 */
export type Tono = 'critico' | 'attenzione' | 'ok' | 'neutro'

export function tonoPriorita(priorita: PrioritaLead): Tono {
  return priorita === 'alta' ? 'critico' : priorita === 'media' ? 'attenzione' : 'neutro'
}

export function tonoTarget(target: TargetLead): Tono {
  return target === 'si' ? 'ok' : target === 'no' ? 'neutro' : 'attenzione'
}

export function etichettaTarget(target: TargetLead): string {
  return target === 'si' ? 'in target' : target === 'no' ? 'fuori target' : 'target da verificare'
}

/**
 * The status as the model wrote it: critical when it says «attende» and the
 * lead is the one waiting (D8: «attende» with our message last is kept as
 * written, never as an alert).
 */
export function tonoStato(status: string, attende: boolean): Tono {
  return attende && /attende/i.test(status) ? 'critico' : 'neutro'
}

/** An agenda call: «da inviare», «non confermata», «a rischio» critical; «confermata», «inviato» ok. */
export function tonoAgenda(status: string): Tono {
  if (/da inviare|non confermat|rischio/i.test(status)) return 'critico'
  if (/confermat|inviat/i.test(status)) return 'ok'
  return 'neutro'
}

/** Yesterday's call: a no-show critical, «presentato» or «fatta» ok, anything else to check. */
export function tonoEsito(outcome: string): Tono {
  if (/no.?show|assente/i.test(outcome)) return 'critico'
  if (/presentat|fatta/i.test(outcome)) return 'ok'
  return 'attenzione'
}

/** A post's verdict: «spingere», «potenziare» ok; «cambiare», «stop», «fermare» critical; else attention. */
export function tonoVerdetto(verdetto: string | null): Tono {
  const v = (verdetto ?? '').toLowerCase()
  if (/spinger|potenz/.test(v)) return 'ok'
  if (/cambi|stop|ferm/.test(v)) return 'critico'
  return 'attenzione'
}

export type Tendenza = 'su' | 'giu' | 'stabile'

/** A theme's trend as the model wrote it: «sale», «in crescita», «+3» up; «scende», «in calo», «-2» down. */
export function tendenza(trend: string): Tendenza {
  if (/sal|cresc|\+/i.test(trend)) return 'su'
  if (/scen|cal|-/i.test(trend)) return 'giu'
  return 'stabile'
}
