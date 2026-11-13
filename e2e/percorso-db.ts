import { createHash, randomBytes, randomInt } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

import type { Database } from '../lib/supabase/database.types'
import { sessioneAdminDb } from './call-db'
import { ID_ADMIN, creaVenditaDiProva, dbLocale, pulisciVendite } from './db'
import { PASSWORD_SEED } from './utenti'

/*
 * The fixtures of the client's area (release B1a): an invented client with a «nuovo» sale and
 * an onboarding, a test link, a client registered through the very functions of /join, the
 * codes read from Mailpit. Local database only.
 */

export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

/** A client with an email and a «nuovo» sale, then its onboarding started as the admin does (avvia_onboarding). */
export async function creaOnboardingDiProva(
  nome: string,
  email: string,
  incarichi: { coach?: string; revisore?: string | null; responsabile?: string } = {},
) {
  const saleId = await creaVenditaDiProva(nome, ID_ADMIN, { giorniFa: 1 })
  const db = dbLocale()
  const { data: vendita } = await db.from('sales').select('client_id').eq('id', saleId).single()
  const clientId = vendita!.client_id
  await db.from('clients').update({ email }).eq('id', clientId)
  const admin = await sessioneAdminDb()
  const { error } = await admin.rpc('avvia_onboarding', {
    p_sale_id: saleId,
    p_coach: incarichi.coach ?? ID_ADMIN,
    p_revisore: (incarichi.revisore ?? null) as unknown as string,
    p_responsabile: incarichi.responsabile ?? ID_ADMIN,
    p_contatti: { nome, cognome: 'Incassi', email },
    p_telegram: '',
    p_minorenne: false,
  })
  if (error) throw error
  return { clientId, saleId }
}

export async function invitoDi(clientId: string) {
  const { data } = await dbLocale().from('onboarding_inviti').select('id, slug, stato, prova').eq('client_id', clientId).maybeSingle()
  return data
}

/** The link /join/<slug>-<token> of a client, read as the card reads it (the token in clear, until it is used). */
export async function linkDi(clientId: string): Promise<string | null> {
  const invito = await invitoDi(clientId)
  if (!invito?.slug) return null
  const { data } = await dbLocale().from('onboarding_inviti_token').select('token').eq('invito_id', invito.id).maybeSingle()
  return data?.token ? `/join/${invito.slug}-${data.token}` : null
}

/** «Cliente di prova» and «Conferma pagamento», with the admin's session. */
export async function attivaDiProva(clientId: string, prova = true) {
  const invito = await invitoDi(clientId)
  const admin = await sessioneAdminDb()
  if (prova) {
    const { error } = await admin.rpc('onboarding_segna_prova', { p_invito: invito!.id, p_prova: true })
    if (error) throw error
  }
  const { error } = await admin.rpc('onboarding_conferma_pagamento', { p_invito: invito!.id })
  if (error) throw error
}

/**
 * A client registered through the functions of /join, as the page does it (the key, the
 * code, the check), then the user with the reserved id. With a password for the
 * development login only: an insert, the trigger of the passwords watches updates.
 */
export async function registraCliente(clientId: string, email: string): Promise<string> {
  const link = await linkDi(clientId)
  const segmento = link!.slice('/join/'.length)
  const token = segmento.slice(segmento.lastIndexOf('-') + 1)
  const db = dbLocale()
  const chiave = randomBytes(32).toString('base64url')
  const codice = String(randomInt(0, 100_000_000)).padStart(8, '0')
  const apri = await db.rpc('onboarding_join_apri', { p_token_hash: sha256(token), p_chiave_hash: sha256(chiave) })
  if (apri.error) throw apri.error
  const inv = await db.rpc('onboarding_join_codice', { p_chiave_hash: sha256(chiave), p_email: email, p_codice_hash: sha256(codice) })
  if (inv.error) throw inv.error
  const ver = await db.rpc('onboarding_join_verifica', { p_chiave_hash: sha256(chiave), p_codice: codice })
  if (ver.error) throw ver.error
  const r = ver.data as { esito: string; utente_id: string }
  if (r.esito !== 'ok') throw new Error(`registrazione: ${r.esito}`)
  const { error } = await db.auth.admin.createUser({
    id: r.utente_id,
    email,
    email_confirm: true,
    password: PASSWORD_SEED,
    app_metadata: { tipo: 'cliente' },
  })
  if (error) throw error
  return r.utente_id
}

/**
 * The first three steps done as the client does them (welcome, rules with the consent, the
 * questionnaire sent), written directly: the steps of release B2 start from the booking.
 */
export async function primiPassiFatti(clientId: string) {
  const db = dbLocale()
  const { data: testo } = await db.from('clienti_consensi_testi').select('versione').eq('tipo', 'salute').eq('in_vigore', true).single()
  await db.from('clienti_consensi').insert({ client_id: clientId, tipo: 'salute', versione: testo!.versione })
  const adesso = new Date().toISOString()
  // the compulsory videos of those steps seen, as the player would have counted them
  const { data: video } = await db
    .from('contenuti_blocchi')
    .select('id')
    .eq('tipo', 'video')
    .eq('obbligatorio', true)
    .in('passo', ['benvenuto', 'regole', 'questionario'])
  for (const v of video ?? []) {
    const { error } = await db
      .from('onboarding_video_visti')
      .insert({ client_id: clientId, blocco_id: v.id, durata: 10, visti: '1111111111', visto_il: adesso })
    if (error) throw error
  }
  const { error: e1 } = await db
    .from('onboarding_passi')
    .update({ stato: 'fatto', iniziato_il: adesso, completato_il: adesso })
    .eq('client_id', clientId)
    .in('passo', ['benvenuto', 'regole', 'questionario'])
  if (e1) throw e1
  const { error } = await db.rpc('onboarding_sblocca', { p_client_id: clientId })
  if (error) throw error
}

/** A session of the client on the local database, from a code of Supabase (for what the browser cannot test). */
export async function sessioneClienteDb(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  const { data, error } = await dbLocale().auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  const db = createClient<Database>(url, chiave, { auth: { persistSession: false } })
  const { error: e2 } = await db.auth.verifyOtp({ email, token: data.properties.email_otp, type: 'email' })
  if (e2) throw e2
  return db
}

type MessaggioElenco = { ID: string; Subject: string }

export async function postaDi(email: string): Promise<MessaggioElenco[]> {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  const j = (await r.json()) as { messages?: MessaggioElenco[] }
  return j.messages ?? []
}

/** The first email to `email` not seen before: its subject and the 8 digits of the code. */
export async function aspettaCodice(email: string, giaViste: Set<string>, attesaMs = 20_000) {
  const fine = Date.now() + attesaMs
  while (Date.now() < fine) {
    const nuovo = (await postaDi(email)).find((m) => !giaViste.has(m.ID))
    if (nuovo) {
      const r = await fetch(`${MAILPIT}/api/v1/message/${nuovo.ID}`)
      const m = (await r.json()) as { Text?: string; HTML?: string; Subject?: string }
      const testo = `${m.Text ?? ''} ${m.HTML ?? ''}`
      const codice = testo.match(/\b(\d{4})\s?(\d{4})\b/)
      return {
        id: nuovo.ID,
        oggetto: m.Subject ?? nuovo.Subject,
        codice: codice ? `${codice[1]}${codice[2]}` : null,
        conLink: /href=/i.test(m.HTML ?? '') && /https?:\/\/[^"]*(conferma|token)/i.test(m.HTML ?? ''),
      }
    }
    await new Promise((res) => setTimeout(res, 400))
  }
  return null
}

export async function idPosta(email: string) {
  return new Set((await postaDi(email)).map((m) => m.ID))
}

/** Clients, sales, projects of a prefix and the users of their accounts (the account goes with the client, the user does not). */
export async function pulisciClientiPercorso(prefisso: string) {
  const db = dbLocale()
  const { data: clienti } = await db.from('clients').select('id').like('nome', `${prefisso}%`)
  const ids = (clienti ?? []).map((c) => c.id)
  if (ids.length > 0) {
    const { data: account } = await db.from('clienti_account').select('user_id').in('client_id', ids)
    for (const a of account ?? []) await db.auth.admin.deleteUser(a.user_id)
    for (const id of ids) {
      await db.from('notifiche').delete().like('chiave', `onboarding/${id}/%`)
      await db.from('notifiche_avvisi_emessi').delete().like('chiave', `onboarding/${id}/%`)
    }
  }
  await pulisciVendite(prefisso)
}

/** An address of this run: unique, never of anyone. */
export function emailDiProva(etichetta: string) {
  return `e2e.percorso.${etichetta}.${Date.now().toString(36)}@example.test`
}
