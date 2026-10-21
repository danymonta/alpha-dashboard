import { Clock, Images, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { AggiornaDaInstagram } from '@/components/marketing/instagram/aggiorna-da-instagram'
import { DaCollegare } from '@/components/marketing/instagram/da-collegare'
import { PostCollegati } from '@/components/marketing/instagram/post-collegati'
import { PostEsclusi } from '@/components/marketing/instagram/post-esclusi'
import type { ContenutoScelta, PostCollegato, PostDaCollegare, PropostaPost } from '@/components/marketing/instagram/tipi'
import { OpzioniProvider } from '@/components/marketing/opzioni-contesto'
import { PannelloContenuti, type DettaglioIniziale } from '@/components/marketing/pannello-contenuto'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { tipoDelPost } from '@/lib/marketing/abbinamento'
import { leggiDettaglioContenuto } from '@/lib/marketing/dettaglio'
import { COLONNE_ELENCO } from '@/lib/marketing/elenco'
import { leggiConteggiOpzioni, leggiOpzioni } from '@/lib/marketing/letture'
import { PARAMETRO_CONTENUTO } from '@/lib/marketing/pannello'
import { eliminaContenuti } from '@/lib/marketing/permessi'
import type { PostInstagram } from '@/lib/marketing/post-del-contenuto'
import { leggiPunteggi } from '@/lib/marketing/punteggio/leggi'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** The posts the page reads, the most recent first (the calendar's posts are a few dozen a month). */
const POST_MAX = 300
/** The contents «Scegli un contenuto» offers, and the panel's rows. */
const CONTENUTI_MAX = 500

/** Who starts "Aggiorna da Instagram" (Dany, 09/10/2026); the video editor reads the posts every morning. */
const RUOLI_AGGIORNA = ['admin', 'marketing']

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/** Dynamic Server Component: rendered once per request, so reading the clock is stable. */
function adessoMs() {
  return Date.now()
}

type RigaVista = {
  media_id: string | null
  shortcode: string | null
  permalink: string | null
  media_type: string | null
  reel: boolean | null
  pubblicato_il: string | null
  giorno: string | null
  didascalia: string | null
  copertina_url: string | null
  eliminato_il: string | null
}

function versoPost(r: RigaVista): PostInstagram | null {
  if (!r.media_id || !r.shortcode || !r.permalink || !r.pubblicato_il || !r.giorno || !r.media_type) return null
  return {
    media_id: r.media_id,
    shortcode: r.shortcode,
    permalink: r.permalink,
    tipo: tipoDelPost({ media_type: r.media_type, reel: r.reel ?? false }),
    pubblicato_il: r.pubblicato_il,
    giorno: r.giorno,
    didascalia: r.didascalia,
    copertina_url: r.copertina_url,
    eliminato: r.eliminato_il !== null,
  }
}

/**
 * «Aggiornati stanotte», «Aggiornati oggi alle 10:12», «ieri alle 05:31», «il
 * 05/10/2026 alle 05:31»; for a run that failed «Ultimo tentativo …»: it read
 * nothing, and the posts on the page may be older.
 */
function quandoAggiornati(istante: string, motivo: string | null, oggi: string, fallito: boolean): string {
  const prima = fallito ? 'Ultimo tentativo' : 'Aggiornati'
  const giorno = oggiRoma(new Date(istante))
  if (giorno === oggi && motivo === 'notte') return `${prima} stanotte`
  const ora = formatOra(istante)
  if (giorno === oggi) return `${prima} oggi alle ${ora}`
  if (giorno === aggiungiGiorni(oggi, -1)) return `${prima} ieri alle ${ora}`
  return `${prima} il ${formatData(giorno)} alle ${ora}`
}

/**
 * «Post di Instagram» (Dany, 09/10/2026: «per quanto riguarda i link devi
 * semplicemente prenderli dal mio profilo instagram e matcharli con i
 * contenuti ad oggi online»): the posts and reels of the connected account,
 * read every morning and with "Aggiorna da Instagram", and their links to the
 * calendar. «Da collegare» the uncertain ones and those without a content,
 * «Collegati» the others, «Fuori dal calendario» those left out. A content's
 * Name opens the content's panel here (?contenuto=<id>). The admin, the
 * video editor and marketing; everything read with the session (RLS).
 */
export default async function PostInstagramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profilo = await requireRuolo(RUOLI_MARKETING)
  const puoAggiornare = RUOLI_AGGIORNA.includes(profilo.ruolo)
  const sp = await searchParams
  const richiesto = primo(sp[PARAMETRO_CONTENUTO])
  const contenutoId = isUuid(richiesto) ? richiesto : null
  const supabase = await createClient()

  const dettaglioPromessa: Promise<DettaglioIniziale> = contenutoId
    ? leggiDettaglioContenuto(supabase, contenutoId).then(
        (dettaglio) => ({ id: contenutoId, dettaglio }),
        () => ({ id: contenutoId, errore: true as const }),
      )
    : Promise.resolve(null)

  const [stato, post, senzaPost, conPost, dettaglio] = await Promise.all([
    supabase
      .from('instagram_contenuti_stato')
      .select('account_username, ultimo_giro_il, ultimo_giro_esito, ultimo_giro_motivo, ultimo_giro_letti, campi, ultimo_errore')
      .maybeSingle(),
    supabase
      .from('v_instagram_post')
      .select(
        'media_id, shortcode, permalink, media_type, reel, pubblicato_il, giorno, didascalia, copertina_url, eliminato_il, contenuto_id, contenuto_nome, collegato_da_solo, stato_collegamento',
      )
      .neq('stato_collegamento', 'prima_del_calendario')
      .order('pubblicato_il', { ascending: false })
      .limit(POST_MAX),
    // the contents «Scegli un contenuto» offers (and the panel's rows)
    supabase
      .from('marketing_contenuti')
      .select(COLONNE_ELENCO)
      .is('url', null)
      .neq('stato', 'canceled')
      .order('post_date', { ascending: false, nullsFirst: false })
      .order('id')
      .limit(CONTENUTI_MAX),
    // the linked ones: the panel opens at once with their properties
    supabase
      .from('marketing_contenuti')
      .select(COLONNE_ELENCO)
      .not('instagram_shortcode', 'is', null)
      .order('post_date', { ascending: false, nullsFirst: false })
      .order('id')
      .limit(CONTENUTI_MAX),
    dettaglioPromessa,
  ])
  if (stato.error || post.error || senzaPost.error || conPost.error) {
    throw new Error('Impossibile caricare i post di Instagram')
  }

  const daProporre = (post.data ?? [])
    .filter((p) => p.stato_collegamento === 'proposto' && p.shortcode)
    .map((p) => p.shortcode as string)
  const proposte = daProporre.length
    ? await supabase
        .from('v_marketing_proposte')
        .select('shortcode, contenuto_id, nome, tipo, stato, post_date, motivi, punteggio')
        .in('shortcode', daProporre)
        .order('punteggio', { ascending: false })
        .order('contenuto_id')
    : { data: [], error: null }
  if (proposte.error) throw new Error('Impossibile caricare le proposte')

  const perPost = new Map<string, PropostaPost[]>()
  for (const p of proposte.data ?? []) {
    if (!p.shortcode || !p.contenuto_id || !p.nome || !p.tipo || !p.stato) continue
    const elenco = perPost.get(p.shortcode) ?? []
    if (elenco.length >= 3) continue
    elenco.push({ contenuto_id: p.contenuto_id, nome: p.nome, tipo: p.tipo, stato: p.stato, post_date: p.post_date, motivi: p.motivi ?? [] })
    perPost.set(p.shortcode, elenco)
  }

  // the scores of the linked reels (1.39.0): two small columns, read only, no Claude
  const punteggi = await leggiPunteggi(
    supabase,
    (post.data ?? []).filter((p) => p.stato_collegamento === 'collegato' && p.media_id && (p.reel || p.media_type === 'VIDEO')).map((p) => p.media_id as string),
  )
  const daCollegare: PostDaCollegare[] = []
  const collegati: PostCollegato[] = []
  const esclusi: PostInstagram[] = []
  for (const riga of post.data ?? []) {
    const p = versoPost(riga)
    if (!p) continue
    if (riga.stato_collegamento === 'collegato' && riga.contenuto_id) {
      collegati.push({
        ...p,
        contenuto_id: riga.contenuto_id,
        contenuto_nome: riga.contenuto_nome ?? 'Contenuto',
        daSolo: riga.collegato_da_solo === true,
        punteggio: punteggi.get(p.media_id) ?? null,
      })
    } else if (riga.stato_collegamento === 'escluso') {
      esclusi.push(p)
    } else if (riga.stato_collegamento === 'proposto' || riga.stato_collegamento === 'senza_contenuto') {
      daCollegare.push({ ...p, proposte: perPost.get(p.shortcode) ?? [] })
    }
  }

  const contenuti: ContenutoScelta[] = (senzaPost.data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    stato: c.stato,
    post_date: c.post_date,
  }))
  const righe = [...(senzaPost.data ?? []), ...(conPost.data ?? [])]

  const s = stato.data
  const oggi = oggiRoma(new Date(adessoMs()))
  const account = s?.account_username ? `@${s.account_username}` : 'dell’account collegato'
  const senzaDidascalie = s?.campi === 'senza_didascalia' || s?.campi === 'minimi'
  const fallito = s?.ultimo_giro_esito === 'fallito'
  // no post on the page and nothing read by the last run (none yet, or it failed): never «ogni post ha il suo contenuto»
  const nessunPost = (post.data ?? []).length === 0 && (!s?.ultimo_giro_il || fallito)

  // the labels of Reel Type and Format, for the content panel that opens over this list
  const [opzioni, conteggi] = await Promise.all([leggiOpzioni(supabase), leggiConteggiOpzioni(supabase)])

  return (
    <OpzioniProvider opzioni={opzioni} conteggi={conteggi} puoEliminare={eliminaContenuti(profilo.ruolo)}>
      <PannelloContenuti righe={righe} iniziale={dettaglio} puoEliminare={eliminaContenuti(profilo.ruolo)}>
        <div className="space-y-6">
          <IntestazionePagina
            titolo="Post di Instagram"
            descrizione={`I post e i reel ${s?.account_username ? `di ${account}` : account}. Quando data e didascalia corrispondono a un contenuto del calendario si collegano da soli; gli altri li colleghi qui con un tocco.`}
            azione={puoAggiornare ? <AggiornaDaInstagram /> : undefined}
          />

          <div className="space-y-1.5" data-testid="stato-post-instagram">
            {s?.ultimo_giro_il ? (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="num">
                  {quandoAggiornati(s.ultimo_giro_il, s.ultimo_giro_motivo, oggi, fallito)}
                  {s.ultimo_giro_letti !== null && !fallito
                    ? ` · ${s.ultimo_giro_letti === 1 ? '1 post letto' : `${s.ultimo_giro_letti} post letti`}`
                    : ''}
                  {fallito ? ': non riuscito' : ''}
                  {s.ultimo_giro_esito === 'parziale' ? ' · in parte' : ''}
                  {puoAggiornare ? '' : '. Si aggiornano ogni notte.'}
                </span>
              </p>
            ) : null}
            {s?.ultimo_errore ? (
              <p className="flex items-start gap-1.5 text-sm text-rosso-testo" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {s.ultimo_errore}
                  {profilo.ruolo === 'admin' ? (
                    <>
                      {' '}
                      <Link href="/settings/chiavi#instagram" className="underline underline-offset-4 hover:text-foreground">
                        Impostazioni › Chiavi e collegamenti
                      </Link>
                    </>
                  ) : null}
                </span>
              </p>
            ) : null}
            {senzaDidascalie ? (
              <p className="flex items-start gap-1.5 text-sm text-status-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Instagram non dà le didascalie: i post si collegano solo con una proposta da confermare.
              </p>
            ) : null}
          </div>

          {nessunPost ? (
            <StatoVuoto
              Icona={Images}
              titolo={fallito ? 'Nessun post da mostrare' : 'Nessun post letto finora'}
              descrizione={
                fallito
                  ? puoAggiornare
                    ? 'L’ultimo aggiornamento non è riuscito: quando il problema qui sopra è risolto, aggiorna da Instagram.'
                    : 'L’ultimo aggiornamento non è riuscito: i post arrivano col prossimo, ogni notte.'
                  : puoAggiornare
                    ? 'Leggi adesso i post e i reel dell’account: quelli che corrispondono al calendario si collegano da soli.'
                    : 'I post e i reel dell’account si leggono ogni notte: domattina li trovi qui.'
              }
              azione={puoAggiornare ? <AggiornaDaInstagram variante="default" /> : undefined}
            />
          ) : (
            <>
              <DaCollegare post={daCollegare} contenuti={contenuti} />
              <PostCollegati post={collegati} />
              <PostEsclusi post={esclusi} />
            </>
          )}
        </div>
      </PannelloContenuti>
    </OpzioniProvider>
  )
}
