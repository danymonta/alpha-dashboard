import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { BloccoInsight } from '@/app/(app)/settings/instagram/blocco-insight'
import {
  NuovaEsclusione,
  RicalcolaIeri,
  RigaEsclusione,
  SceltaSetterInstagram,
  TokenInstagram,
} from '@/app/(app)/settings/instagram/instagram-client'
import {
  NuovaEsclusioneMessenger,
  RigaEsclusioneMessenger,
  TokenMessenger,
  type ChatMessenger,
} from '@/app/(app)/settings/instagram/messenger-client'
import { quando } from '@/app/(app)/settings/instagram/quando'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { insightConfigurato } from '@/lib/insight/config'
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

const GIORNO_MS = 86_400_000
/** The nightly run refreshes the token every week: this close to the end, it has not managed to. */
const AVVISO_SCADENZA_GIORNI = 7

async function caricaInstagram() {
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
    throw new Error('Impossibile caricare il collegamento di Instagram')
  }

  // the setter chosen earlier, if no longer an active setter: shown as he is,
  // never silently replaced by the first of the list
  const scelto = collegamento.data?.setter_id ?? null
  let persone = setter.data.map((p) => ({ id: p.id, nome: p.nome, attivo: true }))
  if (scelto && !persone.some((p) => p.id === scelto)) {
    const { data } = await supabase.from('profiles').select('id, nome').eq('id', scelto).maybeSingle()
    persone = [...persone, { id: scelto, nome: data?.nome ?? 'Persona eliminata', attivo: false }]
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
async function caricaMessengerEInsight() {
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
    throw new Error('Impossibile caricare Messenger e l’Insight')
  }
  const righeChat: unknown[] = Array.isArray(chat.data) ? chat.data : []
  return {
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
  const [{ collegamento, tokenPresente, esclusi, persone, scelto, post }, insight] = await Promise.all([
    caricaInstagram(),
    caricaMessengerEInsight(),
  ])
  const { messenger, tokenMessenger, esclusiMessenger, chatMessenger, stato } = insight
  const adesso = adessoMs()
  const oggi = oggiRoma(new Date(adesso))
  const ieri = aggiungiGiorni(oggi, -1)

  const scadeMs = collegamento?.token_scade_il ? Date.parse(collegamento.token_scade_il) : null
  const scadeGiorno = collegamento?.token_scade_il ? oggiRoma(new Date(collegamento.token_scade_il)) : null
  // expired by date, or refused by Meta (code 190) on the last run, maybe well
  // before its date (a password changed): then the date is not said as past
  const scadutoPerData = scadeMs !== null && scadeMs <= adesso
  const tokenScaduto = tokenPresente && (scadutoPerData || collegamento?.ultimo_errore === FRASI_ERRORE.token)
  const giorniAllaScadenza = scadeMs !== null ? Math.ceil((scadeMs - adesso) / GIORNO_MS) : null
  const scadePresto =
    tokenPresente && !tokenScaduto && giorniAllaScadenza !== null && giorniAllaScadenza <= AVVISO_SCADENZA_GIORNI

  const setterScelto = persone.find((p) => p.id === scelto) ?? null
  const chat = collegamento?.ultimo_calcolo_chat ?? 0

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
        titolo="Instagram e Messenger"
        descrizione="Ogni notte, dopo mezzanotte, i DM dell’account precompilano il report del giorno prima. Il setter lo conferma o lo corregge in Oggi, e puoi farlo anche tu nella pagina Setter: vale la prima scelta. I DM delle ultime 24 ore di Instagram e Messenger finiscono anche nell’Insight: Claude li analizza e il gestionale li tiene al massimo 30 giorni."
      />

      {tokenScaduto ? (
        <div
          role="alert"
          data-testid="instagram-token-scaduto"
          className="flex items-start gap-2 rounded-xl border border-status-critical/40 bg-status-critical/10 p-4 text-sm font-medium"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
          Token Instagram scaduto: generane uno nuovo dal pannello Meta e incollalo qui.
        </div>
      ) : null}

      <section aria-labelledby="titolo-collegamento" className="rounded-xl bg-card p-4" data-testid="instagram-stato">
        <h2 id="titolo-collegamento" className="text-sm font-medium">
          Collegamento
        </h2>
        <dl className="mt-1 divide-y divide-border">
          <Voce etichetta="Account">
            {collegamento?.account_username ? (
              <span className="font-medium">@{collegamento.account_username}</span>
            ) : (
              <span className="text-muted-foreground">Si legge dal token al primo calcolo</span>
            )}
          </Voce>
          <Voce etichetta="Token">
            {!tokenPresente ? (
              <span className="text-muted-foreground">Non collegato</span>
            ) : tokenScaduto ? (
              <span className="inline-flex items-start gap-1.5 text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {scadutoPerData
                  ? `Scaduto${scadeGiorno ? ` il ${formatData(scadeGiorno)}` : ''}`
                  : 'Non più valido: Instagram lo ha rifiutato'}
              </span>
            ) : (
              <span className="inline-flex items-start gap-1.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
                <span>
                  Salvato{scadeGiorno ? `, scade il ${formatData(scadeGiorno)}` : ''}
                  {scadePresto ? (
                    <span className="block text-status-warning">
                      Scade tra {giorniAllaScadenza === 1 ? '1 giorno' : `${giorniAllaScadenza} giorni`}: se non si rinnova da
                      solo, incolla un token nuovo prima di allora.
                    </span>
                  ) : null}
                </span>
              </span>
            )}
          </Voce>
          <Voce etichetta="Ultimo calcolo">
            {collegamento?.ultimo_calcolo_giorno && collegamento.ultimo_calcolo_il ? (
              <span className="num">
                {formatData(collegamento.ultimo_calcolo_giorno)}, {chat === 1 ? '1 chat letta' : `${chat} chat lette`},{' '}
                {quando(collegamento.ultimo_calcolo_il, oggi)}
              </span>
            ) : (
              <span className="text-muted-foreground">Ancora nessuno</span>
            )}
          </Voce>
          <Voce etichetta="Post e reel">
            {post?.ultimo_errore && post.ultimo_giro_esito !== 'ok' ? (
              <span className="flex items-start gap-1.5 text-status-critical" data-testid="instagram-post-errore">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {post.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(post.ultimo_errore_il, oggi)}:
                    </span>
                  ) : null}{' '}
                  {post.ultimo_errore}{' '}
                  <Link href="/marketing/instagram" className="text-foreground underline underline-offset-4">
                    Post di Instagram
                  </Link>
                </span>
              </span>
            ) : (
              <span>
                Letti ogni notte per il calendario dei contenuti
                {post?.ultimo_giro_il ? (
                  <span className="num">
                    {' '}
                    (ultimo: {quando(post.ultimo_giro_il, oggi)}
                    {post.ultimo_giro_letti !== null ? `, ${post.ultimo_giro_letti} post` : ''})
                  </span>
                ) : (
                  <span className="text-muted-foreground"> (ancora nessuna lettura)</span>
                )}
                .{' '}
                <Link href="/marketing/instagram" className="underline underline-offset-4 hover:text-foreground">
                  Post di Instagram
                </Link>
              </span>
            )}
          </Voce>
          <Voce etichetta="Ultimo errore">
            {collegamento?.ultimo_errore ? (
              <span className="flex items-start gap-1.5 text-status-critical" data-testid="instagram-ultimo-errore">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {collegamento.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(collegamento.ultimo_errore_il, oggi)}:
                    </span>
                  ) : null}{' '}
                  {collegamento.ultimo_errore}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Nessuno</span>
            )}
          </Voce>
        </dl>
      </section>

      <section aria-labelledby="titolo-token" className="space-y-3 rounded-xl bg-card p-4">
        <div className="space-y-1">
          <h2 id="titolo-token" className="text-sm font-medium">
            Token
          </h2>
          <p className="text-sm text-muted-foreground">
            Generalo dal pannello Meta dell’app (Instagram, token di accesso) e incollalo qui. Si salva cifrato, non si
            mostra più e si rinnova da solo ogni settimana finché resta valido.
          </p>
        </div>
        <TokenInstagram presente={tokenPresente} scaduto={tokenScaduto} scadeIl={scadeGiorno} />
      </section>

      <section aria-labelledby="titolo-setter" className="space-y-3 rounded-xl bg-card p-4">
        <div className="space-y-1">
          <h2 id="titolo-setter" className="text-sm font-medium">
            Chi lavora i DM
          </h2>
          <p className="text-sm text-muted-foreground">
            I numeri calcolati ogni notte vanno a questa persona da confermare.
          </p>
        </div>
        {persone.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nel team non c’è un setter attivo: invitalo da{' '}
            <Link href="/settings/team" className="underline underline-offset-4 hover:text-foreground">
              Team
            </Link>
            , poi sceglilo qui.
          </p>
        ) : (
          <SceltaSetterInstagram setterId={scelto} persone={persone} />
        )}
      </section>

      {/* #chat-escluse: the Insight links here, «Gestisci le chat escluse» (C42) */}
      <section id="chat-escluse" aria-labelledby="titolo-esclusi" className="scroll-mt-4 space-y-3 rounded-xl bg-card p-4">
        <div className="space-y-1">
          <h2 id="titolo-esclusi" className="text-sm font-medium">
            Chat escluse
          </h2>
          <p className="text-sm text-muted-foreground">
            Le chat Instagram con questi account (personale, team, clienti, amici) non contano mai nella proposta e non
            entrano mai nell’Insight.
          </p>
        </div>
        {esclusi.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            Nessuna chat esclusa: contano tutte le chat dell’account.
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
            Ricalcola ieri
          </h2>
          <p className="text-sm text-muted-foreground">
            Rilegge i DM di ieri e rifà la proposta, per esempio dopo un token nuovo. I numeri qui non compaiono: la
            proposta la trovi in{' '}
            <Link href="/setting#da-approvare" className="underline underline-offset-4 hover:text-foreground">
              Setter › Tracciamento da approvare
            </Link>{' '}
            e {setterScelto?.attivo ? setterScelto.nome : 'il setter scelto'} in Oggi: vale la prima scelta, tua o sua.
          </p>
        </div>
        <RicalcolaIeri
          ieri={ieri}
          setterNome={setterScelto?.attivo ? setterScelto.nome : null}
          nonPronto={
            !tokenPresente
              ? 'Prima salva il token.'
              : !setterScelto
                ? 'Prima scegli chi lavora i DM.'
                : !setterScelto.attivo
                  ? 'Prima scegli un setter attivo per i DM.'
                  : null
          }
        />
      </section>

      <section id="messenger" aria-labelledby="titolo-messenger" className="scroll-mt-4 space-y-3 rounded-xl bg-card p-4">
        <div className="space-y-1">
          <h2 id="titolo-messenger" className="text-sm font-medium">
            Messenger
          </h2>
          <p className="text-sm text-muted-foreground">
            Il token della Pagina Facebook di Percorso Alpha. Serve solo per leggere le chat Messenger nell’Insight. Non
            manda mai messaggi.
          </p>
          <p className="text-sm text-muted-foreground">
            Generalo da Meta › Messenger › Impostazioni dell’API (genera il token della Pagina) e incollalo qui: l’app lo
            prova prima di salvarlo.
          </p>
        </div>
        <dl className="divide-y divide-border" data-testid="messenger-stato">
          <Voce etichetta="Pagina">
            {tokenMessenger ? (
              <span className="inline-flex items-start gap-1.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
                <span>
                  {messenger?.pagina_nome ? `Collegata: Pagina «${messenger.pagina_nome}»` : 'Collegata'}
                  {messenger?.token_aggiornato_il ? (
                    <span className="num block text-muted-foreground">
                      Token salvato il {formatData(oggiRoma(new Date(messenger.token_aggiornato_il)))}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Non collegata</span>
            )}
          </Voce>
          {messenger?.ultimo_errore ? (
            <Voce etichetta="Ultimo errore">
              <span className="flex items-start gap-1.5 text-status-critical" data-testid="messenger-ultimo-errore">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {messenger.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(messenger.ultimo_errore_il, oggi)}:
                    </span>
                  ) : null}{' '}
                  {messenger.ultimo_errore}
                </span>
              </span>
            </Voce>
          ) : null}
        </dl>
        <TokenMessenger presente={tokenMessenger} />
      </section>

      <section
        id="chat-messenger-escluse"
        aria-labelledby="titolo-esclusi-messenger"
        className="scroll-mt-4 space-y-3 rounded-xl bg-card p-4"
      >
        <div className="space-y-1">
          <h2 id="titolo-esclusi-messenger" className="text-sm font-medium">
            Chat Messenger escluse
          </h2>
          <p className="text-sm text-muted-foreground">
            Le chat Messenger con queste persone (clienti, amici, il team) non entrano mai nell’Insight.
          </p>
        </div>
        {esclusiMessenger.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            Nessuna chat Messenger esclusa.
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

      <BloccoInsight stato={stato} configurato={insightConfigurato()} adesso={adesso} oggi={oggi} />
    </div>
  )
}
