import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { BloccoCampoProva, DatiCampoProva, LezioneProva, ModuloProva } from '@/lib/percorso/campo-prova'
import type { DatiProva, DefPasso, BloccoGrezzo, PersonaProva } from '@/lib/percorso/prova'
import type { Database } from '@/lib/supabase/database.types'

/**
 * What the «Prova del percorso» starts from (1.82.0), read with the admin's own session under RLS:
 * the steps of flow v1, the published blocks of the CMS (the steps and the page after the
 * launch), the version of the health consent in force, the two links and the days of the
 * settings, and as the team the people chosen as default in Impostazioni › Onboarding (first
 * name, photo, role). The client is invented. Never a write.
 */

type Db = SupabaseClient<Database>

const VERSIONE_FLUSSO = 1

/** The roles the client reads under the team, as percorso_cliente() names them. */
const RUOLI = { coach: 'Coach', revisore: 'Revisione video', responsabile: 'Personal Success Manager' } as const

export async function leggiDatiProva(db: Db): Promise<DatiProva> {
  const [passi, blocchi, consenso, impostazioni] = await Promise.all([
    db
      .from('onboarding_passi_def')
      .select('chiave, titolo, nodo, ordine, attore, sblocco, sblocca_dopo')
      .eq('versione', VERSIONE_FLUSSO)
      .order('ordine'),
    db
      .from('contenuti_blocchi')
      .select('id, pagina, passo, tipo, titolo, corpo, youtube_id, url, obbligatorio')
      .eq('versione_flusso', VERSIONE_FLUSSO)
      .in('pagina', ['passo', 'dopo_lancio'])
      .eq('pubblicato', true)
      .order('ordine')
      .order('created_at'),
    db.from('clienti_consensi_testi').select('versione').eq('tipo', 'salute').eq('in_vigore', true).maybeSingle(),
    db
      .from('onboarding_impostazioni')
      .select(
        'link_community, link_prenotazione, coach_predefinito_id, revisore_predefinito_id, responsabile_predefinito_id, giorni_call, giorni_test, giorni_programma',
      )
      .maybeSingle(),
  ])
  for (const r of [passi, blocchi, consenso, impostazioni]) {
    if (r.error) {
      console.error('[prova] lettura non riuscita:', r.error.code)
      throw new Error('La prova del percorso non si è caricata: riprova.')
    }
  }

  const x = impostazioni.data
  const incarichi = [
    ['coach', x?.coach_predefinito_id ?? null],
    ['revisore', x?.revisore_predefinito_id ?? null],
    ['responsabile', x?.responsabile_predefinito_id ?? null],
  ] as const
  const ids = [...new Set(incarichi.map(([, id]) => id).filter((id): id is string => id !== null))]
  const persone = ids.length
    ? await db.from('profiles').select('id, nome, foto_url').in('id', ids)
    : { data: [] as { id: string; nome: string | null; foto_url: string | null }[], error: null }
  if (persone.error) {
    console.error('[prova] persone non lette:', persone.error.code)
    throw new Error('La prova del percorso non si è caricata: riprova.')
  }
  const team: PersonaProva[] = incarichi.flatMap(([incarico, id]) => {
    const p = id ? persone.data?.find((y) => y.id === id) : null
    return p ? [{ incarico, ruolo: RUOLI[incarico], nome: p.nome ?? '', fotoUrl: p.foto_url }] : []
  })

  return {
    nomeCompleto: 'Mario Prova',
    email: 'mario.prova@example.test',
    passi: (passi.data ?? []).map(
      (d): DefPasso => ({
        chiave: d.chiave,
        titolo: d.titolo,
        nodo: d.nodo,
        ordine: d.ordine,
        attore: d.attore === 'team' ? 'team' : 'cliente',
        sblocco: d.sblocco === 'team' ? 'team' : 'automatico',
        sbloccaDopo: d.sblocca_dopo ?? [],
      }),
    ),
    blocchi: (blocchi.data ?? []).map(
      (b): BloccoGrezzo => ({
        id: b.id,
        pagina: b.pagina === 'dopo_lancio' ? 'dopo_lancio' : 'passo',
        passo: b.passo,
        tipo: b.tipo,
        titolo: b.titolo,
        corpo: b.corpo,
        youtube_id: b.youtube_id,
        url: b.url,
        obbligatorio: b.obbligatorio,
      }),
    ),
    team,
    versioneConsenso: consenso.data?.versione ?? '',
    linkCommunity: x?.link_community ?? null,
    linkPrenotazione: x?.link_prenotazione ?? null,
    giorni: { call: x?.giorni_call ?? 3, test: x?.giorni_test ?? 7, programma: x?.giorni_programma ?? 2 },
  }
}

/**
 * The home base of the test (1.83.0): the published blocks of the pages Home, Regole and Community,
 * the rules of the step «regole», the link of the community, the default coach and the Aula (never a
 * draft, never an unpublished lesson), with the admin's own session under RLS.
 */
export async function leggiCampoProva(db: Db, coach: PersonaProva | null): Promise<DatiCampoProva> {
  const [blocchi, moduli, impostazioni] = await Promise.all([
    db
      .from('contenuti_blocchi')
      .select('id, pagina, passo, tipo, titolo, corpo, youtube_id, url, obbligatorio')
      .eq('versione_flusso', VERSIONE_FLUSSO)
      .eq('pubblicato', true)
      .or('pagina.in.(home,regole,community),and(pagina.eq.passo,passo.eq.regole,tipo.eq.regola)')
      .order('ordine')
      .order('created_at'),
    db
      .from('aula_moduli')
      .select(
        'id, titolo, descrizione, copertina_url, icona, stato, durante_onboarding, ordine, lezioni:aula_lezioni(id, titolo, tipo, corpo, youtube_id, url, obbligatoria, pubblicata, ordine, created_at)',
      )
      .neq('stato', 'bozza')
      .order('ordine')
      .order('created_at'),
    db.from('onboarding_impostazioni').select('link_community').maybeSingle(),
  ])
  for (const r of [blocchi, moduli, impostazioni]) {
    if (r.error) {
      console.error('[prova] campo base non letto:', r.error.code)
      throw new Error('La prova del percorso non si è caricata: riprova.')
    }
  }
  const tutti = blocchi.data ?? []
  const comeBlocco = (b: (typeof tutti)[number]): BloccoCampoProva => ({
    id: b.id,
    tipo: b.tipo,
    titolo: b.titolo,
    corpo: b.corpo,
    youtube_id: b.youtube_id,
    url: b.url,
    obbligatorio: b.obbligatorio,
  })
  return {
    home: tutti.filter((b) => b.pagina === 'home').map(comeBlocco),
    regole: tutti.filter((b) => b.pagina === 'regole').map(comeBlocco),
    regolePercorso: tutti.filter((b) => b.pagina === 'passo').map(comeBlocco),
    community: tutti.filter((b) => b.pagina === 'community').map(comeBlocco),
    linkCommunity: impostazioni.data?.link_community ?? null,
    coach: coach ? { nome: coach.nome, foto_url: coach.fotoUrl } : null,
    aula: (moduli.data ?? []).map(
      (m): ModuloProva => ({
        id: m.id,
        titolo: m.titolo,
        descrizione: m.descrizione,
        copertina_url: m.copertina_url,
        icona: m.icona,
        stato: m.stato as ModuloProva['stato'],
        durante_onboarding: m.durante_onboarding,
        lezioni: (m.lezioni ?? [])
          .filter((l) => l.pubblicata)
          .sort((a, b) => a.ordine - b.ordine || a.created_at.localeCompare(b.created_at))
          .map(
            (l): LezioneProva => ({
              id: l.id,
              titolo: l.titolo,
              tipo: l.tipo as LezioneProva['tipo'],
              corpo: l.corpo,
              youtube_id: l.youtube_id,
              url: l.url,
              obbligatoria: l.obbligatoria,
            }),
          ),
      }),
    ),
  }
}
