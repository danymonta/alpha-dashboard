import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { BloccoAnalisi } from '@/app/(app)/settings/instagram/blocco-analisi'
import { BloccoInsight } from '@/app/(app)/settings/instagram/blocco-insight'
import {
  NuovaEsclusione,
  RicalcolaIeri,
  RigaEsclusione,
  SceltaSetterInstagram,
} from '@/app/(app)/settings/instagram/instagram-client'
import {
  NuovaEsclusioneMessenger,
  RigaEsclusioneMessenger,
  type ChatMessenger,
} from '@/app/(app)/settings/instagram/messenger-client'
import { quando } from '@/app/(app)/settings/instagram/quando'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { CHIAVI } from '@/lib/i18n/testi/chiavi'
import { IMPOSTAZIONI, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { INSTAGRAM_IMPOSTAZIONI } from '@/lib/i18n/testi/instagram-impostazioni'
import { insightConfigurato } from '@/lib/insight/config'
import { statoToken } from '@/lib/instagram/stato-token'
import { leggiPermesso, leggiSituazione } from '@/lib/marketing/analisi/elenco'
import { trascrizioneAttiva } from '@/lib/marketing/trascrizione'
import { leggiStatoInsightAdmin } from '@/lib/insight/stato'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
// "Ricalcola ieri" reads the DMs in a server action of this page: it stops
// asking Instagram after 240 s (app/actions/report-instagram.ts), inside this
export const maxDuration = 300

/** Dynamic Server Component: rendered once per request, so reading the clock is stable. */
function adessoMs() {
  return Date.now()
}

async function caricaInstagram(t: (typeof INSTAGRAM_IMPOSTAZIONI)['it']['pagina']) {
  const supabase = await createClient()
  const [collegamento, token, esclusi, setter, post] = await Promise.all([
    supabase
      .from('instagram_collegamento')
      .select(
        'account_username, setter_id, token_scade_il, ultimo_calcolo_il, ultimo_calcolo_giorno, ultimo_calcolo_chat, ultimo_errore, ultimo_errore_il',
      )
      .maybeSingle(),
    // whether the token is there, never its value
    supabase.rpc('instagram_token_presente'),
    supabase.from('instagram_esclusi').select('username, motivo').order('username'),
    supabase.from('profiles').select('id, nome').eq('ruolo', 'setter').eq('attivo', true).order('nome'),
    // the posts of the content calendar read with the same token (1.33.0)
    supabase
      .from('instagram_contenuti_stato')
      .select('ultimo_giro_il, ultimo_giro_esito, ultimo_giro_letti, ultimo_errore, ultimo_errore_il')
      .maybeSingle(),
  ])
  if (collegamento.error || token.error || esclusi.error || setter.error || post.error) {
    throw new Error(t.errore)
  }

  // the setter chosen earlier, if no longer an active setter: shown as he is,
  // never silently replaced by the first of the list
  const scelto = collegamento.data?.setter_id ?? null
  let persone = setter.data.map((p) => ({ id: p.id, nome: p.nome, attivo: true }))
  if (scelto && !persone.some((p) => p.id === scelto)) {
    const { data } = await supabase.from('profiles').select('id, nome').eq('id', scelto).maybeSingle()
    persone = [...persone, { id: scelto, nome: data?.nome ?? t.personaEliminata, attivo: false }]
  }

  return {
    collegamento: collegamento.data,
    tokenPresente: token.data === true,
    esclusi: esclusi.data,
    persone,
    scelto,
    post: post.data,
  }
}

type CollegamentoMessenger = {
  pagina_nome: string | null
  token_aggiornato_il: string | null
  ultimo_errore: string | null
  ultimo_errore_il: string | null
}
type EsclusoMessenger = { utente_id: string; nome: string; motivo: string | null }

/**
 * Messenger and the Insight (1.35.0, CLAUDE.md section 29), with the admin's
 * session: the Page (whether its token is in Vault, never the token), the
 * excluded Messenger chats, the latest chats with a name to pick from
 * (insight_chat_messenger, C14: insight_chat itself is read by no session),
 * and insight_stato() as the admin sees it.
 */
async function caricaMessengerEInsight(t: (typeof INSTAGRAM_IMPOSTAZIONI)['it']['pagina']) {
  const supabase = await createClient()
  const [collegamento, token, esclusi, chat, stato] = await Promise.all([
    supabase
      .from('messenger_collegamento')
      .select('pagina_nome, token_aggiornato_il, ultimo_errore, ultimo_errore_il')
      .maybeSingle(),
    // whether the Page token is there, never its value; never pagina_nome alone (C40)
    supabase.rpc('messenger_token_presente'),
    supabase.from('messenger_esclusi').select('utente_id, nome, motivo').order('nome'),
    supabase.rpc('insight_chat_messenger'),
    supabase.rpc('insight_stato'),
  ])
  if (collegamento.error || token.error || esclusi.error || chat.error || stato.error) {
    throw new Error(t.erroreMessenger)
  }
  const righeChat: unknown[] = Array.isArray(chat.data) ? chat.data : []
  // the reel analysis (1.36.0): never stops the page, a read that fails is «non si legge adesso»
  const [situazione, permesso] = await Promise.all([leggiSituazione(supabase), leggiPermesso(supabase).catch(() => null)])
  return {
    situazione,
    permesso,
    messenger: (collegamento.data ?? null) as CollegamentoMessenger | null,
    tokenMessenger: token.data === true,
    esclusiMessenger: (esclusi.data ?? []) as EsclusoMessenger[],
    chatMessenger: righeChat.filter(
      (c): c is ChatMessenger =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as ChatMessenger).utente_id === 'string' &&
        typeof (c as ChatMessenger).nome === 'string',
    ),
    stato: leggiStatoInsightAdmin(stato.data),
  }
}

function Voce({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{etichetta}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  )
}

export default async function InstagramPage() {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].pagina
  const K = CHIAVI[lingua]
  const { formatData } = formato(lingua)
  const tr = (testo: string) => traduciImpostazioni(testo, lingua)
  const [{ collegamento, tokenPresente, esclusi, persone, scelto, post }, insight] = await Promise.all([
    caricaInstagram(t),
    caricaMessengerEInsight(t),
  ])
  const { messenger, tokenMessenger, esclusiMessenger, chatMessenger, stato, situazione, permesso } = insight
  const adesso = adessoMs()
  const oggi = oggiRoma(new Date(adesso))
  const ieri = aggiungiGiorni(oggi, -1)

  const scadeGiorno = collegamento?.token_scade_il ? oggiRoma(new Date(collegamento.token_scade_il)) : null
  // expired by date, or refused by Meta (code 190) on the last run, maybe well
  // before its date (a password changed): then the date is not said as past
  const { scaduto: tokenScaduto, scadutoPerData, giorniAllaScadenza, scadePresto } = statoToken({
    presente: tokenPresente,
    scadeIl: collegamento?.token_scade_il ?? null,
    rifiutatoDaMeta: collegamento?.ultimo_errore === FRASI_ERRORE.token,
    adesso,
  })

  const setterScelto = persone.find((p) => p.id === scelto) ?? null
  const chat = collegamento?.ultimo_calcolo_chat ?? 0

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: IMPOSTAZIONI[lingua].titolo }}
        titolo={t.titolo}
        descrizione={t.descrizione}
      />

      {tokenScaduto ? (
        <div
          role="alert"
          data-testid="instagram-token-scaduto"
          className="flex items-start gap-2 rounded-xl border border-status-critical/40 bg-status-critical/10 p-4 text-sm font-medium"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
          {K.avvisoScaduto}
        </div>
      ) : null}
      {tokenScaduto ? (
        <p className="-mt-3 text-sm">
          <Link href="/settings/chiavi#instagram" className="underline underline-offset-4 hover:text-foreground">
            {t.vaiAChiavi}
          </Link>
        </p>
      ) : null}

      <section aria-labelledby="titolo-collegamento" className="rounded-xl bg-card p-4" data-testid="instagram-stato">
        <h2 id="titolo-collegamento" className="text-sm font-medium">
          {t.collegamento}
        </h2>
        <dl className="mt-1 divide-y divide-border">
          <Voce etichetta={K.account}>
            {collegamento?.account_username ? (
              <span className="font-medium">@{collegamento.account_username}</span>
            ) : (
              <span className="text-muted-foreground">{K.primoCalcolo}</span>
            )}
          </Voce>
          <Voce etichetta={t.token}>
            {!tokenPresente ? (
              <span className="text-muted-foreground">{K.nonCollegato}</span>
            ) : tokenScaduto ? (
              <span className="inline-flex items-start gap-1.5 text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {scadutoPerData ? K.scaduto(scadeGiorno ? formatData(scadeGiorno) : null) : K.rifiutato}
              </span>
            ) : (
              <span className="inline-flex items-start gap-1.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
                <span>
                  {K.salvato(scadeGiorno ? formatData(scadeGiorno) : null)}
                  {scadePresto && giorniAllaScadenza !== null ? (
                    <span className="block text-status-warning">
                      {K.rinnovaPrima(giorniAllaScadenza)}
                    </span>
                  ) : null}
                </span>
              </span>
            )}
          </Voce>
          <Voce etichetta={t.ultimoCalcolo}>
            {collegamento?.ultimo_calcolo_giorno && collegamento.ultimo_calcolo_il ? (
              <span className="num">
                {formatData(collegamento.ultimo_calcolo_giorno)}, {t.chatLette(chat)},{' '}
                {quando(collegamento.ultimo_calcolo_il, oggi, lingua)}
              </span>
            ) : (
              <span className="text-muted-foreground">{t.ancoraNessuno}</span>
            )}
          </Voce>
          <Voce etichetta={t.postEReel}>
            {post?.ultimo_errore && post.ultimo_giro_esito !== 'ok' ? (
              <span className="flex items-start gap-1.5 text-status-critical" data-testid="instagram-post-errore">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {post.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(post.ultimo_errore_il, oggi, lingua)}:
                    </span>
                  ) : null}{' '}
                  {tr(post.ultimo_errore)}{' '}
                  <Link href="/marketing/pubblicati" className="text-foreground underline underline-offset-4">
                    {t.pubblicati}
                  </Link>
                </span>
              </span>
            ) : (
              <span>
                {t.lettiOgniNotte}
                {post?.ultimo_giro_il ? (
                  <span className="num">
                    {' '}
                    {t.ultimaLettura(quando(post.ultimo_giro_il, oggi, lingua), post.ultimo_giro_letti)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t.nessunaLettura}</span>
                )}
                .{' '}
                <Link href="/marketing/pubblicati" className="underline underline-offset-4 hover:text-foreground">
                  {t.pubblicati}
                </Link>
              </span>
            )}
          </Voce>
          <Voce etichetta={K.ultimoErrore}>
            {collegamento?.ultimo_errore ? (
              <span className="flex items-start gap-1.5 text-status-critical" data-testid="instagram-ultimo-errore">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {collegamento.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(collegamento.ultimo_errore_il, oggi, lingua)}:
                    </span>
                  ) : null}{' '}
                  {tr(collegamento.ultimo_errore)}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{K.nessuno}</span>
            )}
          </Voce>
        </dl>
      </section>

      <section aria-labelledby="titolo-token" className="space-y-1 rounded-xl bg-card p-4">
        <h2 id="titolo-token" className="text-sm font-medium">
          {t.token}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.tokenDescrizione}{' '}
          <Link href="/settings/chiavi#instagram" className="underline underline-offset-4 hover:text-foreground">
            {t.chiaviECollegamenti}
          </Link>
          {t.conGuida}
        </p>
      </section>

      <section aria-labelledby="titolo-setter" className="space-y-3 rounded-xl bg-card p-4">
        <div className="space-y-1">
          <h2 id="titolo-setter" className="text-sm font-medium">
            {t.chiLavora}
          </h2>
          <p className="text-sm text-muted-foreground">{t.chiLavoraDescrizione}</p>
        </div>
        {persone.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.nessunSetter}{' '}
            <Link href="/settings/team" className="underline underline-offset-4 hover:text-foreground">
              {t.team}
            </Link>
            {t.poiSceglilo}
          </p>
        ) : (
          <SceltaSetterInstagram setterId={scelto} persone={persone} />
        )}
      </section>

      {/* #chat-escluse: the Insight links here, «Gestisci le chat escluse» (C42) */}
      <section id="chat-escluse" aria-labelledby="titolo-esclusi" className="scroll-mt-4 space-y-3 rounded-xl bg-card p-4">
        <div className="space-y-1">
          <h2 id="titolo-esclusi" className="text-sm font-medium">
            {t.escluse}
          </h2>
          <p className="text-sm text-muted-foreground">{t.escluseDescrizione}</p>
        </div>
        {esclusi.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            {t.nessunaEsclusa}
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="instagram-esclusi">
            {esclusi.map((e) => (
              <RigaEsclusione key={e.username} username={e.username} motivo={e.motivo} />
            ))}
          </ul>
        )}
        <NuovaEsclusione />
      </section>

      <section aria-labelledby="titolo-ricalcola" className="space-y-3 rounded-xl bg-card p-4">
        <div className="space-y-1">
          <h2 id="titolo-ricalcola" className="text-sm font-medium">
            {t.ricalcola}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t.ricalcolaDescrizione}{' '}
            <Link href="/setting#da-approvare" className="underline underline-offset-4 hover:text-foreground">
              {t.daApprovare}
            </Link>{' '}
            {t.eInOggi(setterScelto?.attivo ? setterScelto.nome : t.ilSetterScelto)}
          </p>
        </div>
        <RicalcolaIeri
          ieri={ieri}
          setterNome={setterScelto?.attivo ? setterScelto.nome : null}
          nonPronto={
            !tokenPresente
              ? t.primaToken
              : !setterScelto
                ? t.primaSetter
                : !setterScelto.attivo
                  ? t.primaSetterAttivo
                  : null
          }
        />
      </section>

      <section id="messenger" aria-labelledby="titolo-messenger" className="scroll-mt-4 space-y-2 rounded-xl bg-card p-4">
        <h2 id="titolo-messenger" className="text-sm font-medium">
          {t.messenger}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.statoMessenger(tokenMessenger, messenger?.pagina_nome ?? null)}{' '}
          {t.messengerDescrizione}{' '}
          <Link href="/settings/chiavi#messenger" className="underline underline-offset-4 hover:text-foreground">
            {t.chiaviECollegamenti}
          </Link>
          .
        </p>
      </section>

      <section
        id="chat-messenger-escluse"
        aria-labelledby="titolo-esclusi-messenger"
        className="scroll-mt-4 space-y-3 rounded-xl bg-card p-4"
      >
        <div className="space-y-1">
          <h2 id="titolo-esclusi-messenger" className="text-sm font-medium">
            {t.escluseMessenger}
          </h2>
          <p className="text-sm text-muted-foreground">{t.escluseMessengerDescrizione}</p>
        </div>
        {esclusiMessenger.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            {t.nessunaEsclusaMessenger}
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="messenger-esclusi">
            {esclusiMessenger.map((e) => (
              <RigaEsclusioneMessenger key={e.utente_id} utenteId={e.utente_id} nome={e.nome} motivo={e.motivo} />
            ))}
          </ul>
        )}
        <NuovaEsclusioneMessenger chat={chatMessenger} />
      </section>

      <BloccoInsight stato={stato} configurato={insightConfigurato()} adesso={adesso} oggi={oggi} lingua={lingua} />

      <BloccoAnalisi
        situazione={situazione}
        claudeConfigurato={insightConfigurato()}
        voceConfigurata={trascrizioneAttiva()}
        statisticheAttive={permesso === null ? null : permesso}
        adesso={adesso}
        oggi={oggi}
        lingua={lingua}
      />
    </div>
  )
}
