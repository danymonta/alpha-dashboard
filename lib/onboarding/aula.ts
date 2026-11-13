import 'server-only'

import { revalidatePath } from 'next/cache'

import { negaPer } from '@/lib/auth/azioni'
import type { Contesto } from '@/lib/call/operazioni'
import {
  BYTE_COPERTINA_MAX,
  ERRORI_AULA,
  TIPI_COPERTINA,
  idSchema,
  lezioneSchema,
  moduloSchema,
} from '@/lib/validation/aula'

/**
 * The Aula of the client's home base (1.83.0): the admin writes modules and lessons with her own
 * session under RLS (aula_moduli, aula_lezioni, the bucket «aula-copertine»), never the service
 * role. The client receives them only from campo_base_cliente().
 */
export type Esito = { ok: true; id?: string; url?: string } | { ok: false; errore: string; campi?: Record<string, string> }

function aggiorna() {
  revalidatePath('/settings/onboarding', 'layout')
  revalidatePath('/percorso', 'layout')
}

function campiDi(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const campi: Record<string, string> = {}
  for (const i of issues) {
    const c = i.path[0]
    if (typeof c === 'string') campi[c] ??= i.message
  }
  return campi
}

export async function salvaModulo(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = moduloSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? ERRORI_AULA.nonValidi, campi: campiDi(parsed.error.issues) }
  }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_AULA.soloAdmin)
  if (negato) return { ok: false, errore: negato }
  const { id, ...valori } = parsed.data
  const { data, error } = await (id
    ? ctx.db.from('aula_moduli').update(valori).eq('id', id).select('id').maybeSingle()
    : ctx.db.from('aula_moduli').insert(valori).select('id').maybeSingle())
  if (error || !data) {
    if (error) console.error('[aula] modulo non salvato:', error.code)
    return { ok: false, errore: ERRORI_AULA.nonSalvato }
  }
  aggiorna()
  return { ok: true, id: data.id }
}

export async function eliminaModulo(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_AULA.nonValidi }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_AULA.soloAdmin)
  if (negato) return { ok: false, errore: negato }
  const { data, error } = await ctx.db.from('aula_moduli').delete().eq('id', parsed.data.id).select('id')
  if (error || !data || data.length === 0) {
    if (error) console.error('[aula] modulo non eliminato:', error.code)
    return { ok: false, errore: ERRORI_AULA.nonEliminato }
  }
  aggiorna()
  return { ok: true }
}

export async function salvaLezione(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = lezioneSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errore: parsed.error.issues[0]?.message ?? ERRORI_AULA.nonValidi, campi: campiDi(parsed.error.issues) }
  }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_AULA.soloAdmin)
  if (negato) return { ok: false, errore: negato }
  const { id, ...valori } = parsed.data
  const { data, error } = await (id
    ? ctx.db.from('aula_lezioni').update(valori).eq('id', id).select('id').maybeSingle()
    : ctx.db.from('aula_lezioni').insert(valori).select('id').maybeSingle())
  if (error || !data) {
    if (error) console.error('[aula] lezione non salvata:', error.code)
    return { ok: false, errore: ERRORI_AULA.nonSalvato }
  }
  aggiorna()
  return { ok: true, id: data.id }
}

export async function eliminaLezione(ctx: Contesto, input: unknown): Promise<Esito> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errore: ERRORI_AULA.nonValidi }
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_AULA.soloAdmin)
  if (negato) return { ok: false, errore: negato }
  const { data, error } = await ctx.db.from('aula_lezioni').delete().eq('id', parsed.data.id).select('id')
  if (error || !data || data.length === 0) {
    if (error) console.error('[aula] lezione non eliminata:', error.code)
    return { ok: false, errore: ERRORI_AULA.nonEliminato }
  }
  aggiorna()
  return { ok: true }
}

/** The cover of a module: uploaded with the admin's session in the public bucket, the public address back. */
export async function caricaCopertina(ctx: Contesto, file: unknown): Promise<Esito> {
  const negato = negaPer(await ctx.chi(), ['admin'], ERRORI_AULA.soloAdmin)
  if (negato) return { ok: false, errore: negato }
  if (!(file instanceof File) || file.size <= 0 || file.size > BYTE_COPERTINA_MAX || !(TIPI_COPERTINA as readonly string[]).includes(file.type)) {
    return { ok: false, errore: ERRORI_AULA.copertina }
  }
  const estensione = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const percorso = `${crypto.randomUUID()}.${estensione}`
  const { error } = await ctx.db.storage.from('aula-copertine').upload(percorso, file, { contentType: file.type, upsert: false })
  if (error) {
    console.error('[aula] copertina non caricata:', error.name)
    return { ok: false, errore: ERRORI_AULA.nonSalvato }
  }
  const { data } = ctx.db.storage.from('aula-copertine').getPublicUrl(percorso)
  return { ok: true, url: data.publicUrl }
}
