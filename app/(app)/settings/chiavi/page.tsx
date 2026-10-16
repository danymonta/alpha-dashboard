import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { ChiaveFathom } from '@/app/(app)/settings/fathom/fathom-client'
import { TokenInstagram } from '@/app/(app)/settings/instagram/instagram-client'
import { TokenMessenger } from '@/app/(app)/settings/instagram/messenger-client'
import { quando } from '@/app/(app)/settings/instagram/quando'
import { GuidaChiave } from '@/components/impostazioni/guida-chiave'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { alfireConfigurata } from '@/lib/alfire/config'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { insightConfigurato } from '@/lib/insight/config'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { fraseScadePresto, statoToken } from '@/lib/instagram/stato-token'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Dynamic Server Component: rendered once per request, so reading the clock is stable. */
function adessoMs() {
  return Date.now()
}

function Voce({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{etichetta}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  )
}

/** The state of a key in one line: icon and words, never colour alone. */
function Stato({ tono, children, testId }: { tono: 'ok' | 'avviso' | 'errore' | 'spenta'; children: ReactNode; testId?: string }) {
  const Icona = tono === 'ok' ? CircleCheck : tono === 'spenta' ? Clock : TriangleAlert
  const colore =
    tono === 'ok'
      ? 'text-status-ok'
      : tono === 'avviso'
        ? 'text-status-warning'
        : tono === 'errore'
          ? 'text-status-critical'
          : 'text-muted-foreground'
  return (
    <span className="inline-flex items-start gap-1.5 text-sm" data-testid={testId}>
      <Icona className={`mt-0.5 size-4 shrink-0 ${colore}`} aria-hidden="true" />
      <span>{children}</span>
    </span>
  )
}

function Scheda({
  id,
  titolo,
  stato,
  children,
}: {
  id: string
  titolo: string
  stato: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`titolo-${id}`} className="scroll-mt-4 space-y-3 rounded-xl bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h2 id={`titolo-${id}`} className="text-sm font-medium">
          {titolo}
        </h2>
        {stato}
      </div>
      {children}
    </section>
  )
}

export default async function ChiaviPage() {
  await requireRuolo(['admin'])
  const supabase = await createClient()
  const [instagram, tokenIg, messenger, tokenMsg, fathom, fathomPresente] = await Promise.all([
    supabase
      .from('instagram_collegamento')
      .select('account_username, token_scade_il, token_aggiornato_il, ultimo_errore, ultimo_errore_il')
      .maybeSingle(),
    // whether each key is there, never its value
    supabase.rpc('instagram_token_presente'),
    supabase
      .from('messenger_collegamento')
      .select('pagina_nome, token_aggiornato_il, ultimo_errore, ultimo_errore_il')
      .maybeSingle(),
    supabase.rpc('messenger_token_presente'),
    supabase.from('fathom_collegamento').select('chiave_aggiornata_il, ultima_prova_il, ultimo_errore, ultimo_errore_il').maybeSingle(),
    supabase.rpc('fathom_chiave_presente'),
  ])
  if (instagram.error || tokenIg.error || messenger.error || tokenMsg.error || fathom.error || fathomPresente.error) {
    throw new Error('Impossibile caricare le chiavi e i collegamenti')
  }

  const adesso = adessoMs()
  const oggi = oggiRoma(new Date(adesso))
  const ig = instagram.data
  const tokenPresente = tokenIg.data === true
  const t = statoToken({
    presente: tokenPresente,
    scadeIl: ig?.token_scade_il ?? null,
    rifiutatoDaMeta: ig?.ultimo_errore === FRASI_ERRORE.token,
    adesso,
  })
  const scadeGiorno = ig?.token_scade_il ? oggiRoma(new Date(ig.token_scade_il)) : null
  const messengerPresente = tokenMsg.data === true
  const msg = messenger.data
  const fathomChiave = fathomPresente.data === true
  const fa = fathom.data
  const claude = insightConfigurato()
  const groq = alfireConfigurata()

  // what needs a hand, on top: an expired or about-to-expire token, a key that is missing
  const daSistemare: string[] = []
  if (t.scaduto) daSistemare.push('Il token di Instagram è scaduto o non è più valido.')
  else if (t.scadePresto && t.giorniAllaScadenza !== null) {
    daSistemare.push(`Il token di Instagram ${fraseScadePresto(t.giorniAllaScadenza).toLowerCase()}.`)
  }
  if (!claude) daSistemare.push('Manca la chiave di Claude su Vercel: Insight, analisi e Spunti sono spenti.')

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
        titolo="Chiavi e collegamenti"
        descrizione="Tutto quello che l’app usa per parlare con Instagram, Messenger, Fathom, Claude e Groq: se ognuno funziona, quando scade e, in un pannello, come rigenerare la chiave. Le chiavi non tornano mai nella pagina e non vanno mai incollate in chat."
      />

      {t.scaduto ? (
        <div
          role="alert"
          data-testid="instagram-token-scaduto"
          className="flex items-start gap-2 rounded-xl border border-status-critical/40 bg-status-critical/10 p-4 text-sm font-medium"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
          Token Instagram scaduto: generane uno nuovo dal pannello Meta e incollalo qui.
        </div>
      ) : null}

      {daSistemare.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-status-warning/40 bg-status-warning/10 p-4 text-sm" data-testid="chiavi-da-sistemare">
          {daSistemare.map((riga) => (
            <li key={riga} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
              {riga}
            </li>
          ))}
        </ul>
      ) : null}

      <Scheda
        id="instagram"
        titolo="Instagram"
        stato={
          !tokenPresente ? (
            <Stato tono="spenta">Non collegato</Stato>
          ) : t.scaduto ? (
            <Stato tono="errore">
              {t.scadutoPerData
                ? `Scaduto${scadeGiorno ? ` il ${formatData(scadeGiorno)}` : ''}`
                : 'Non più valido: Instagram lo ha rifiutato'}
            </Stato>
          ) : t.scadePresto && t.giorniAllaScadenza !== null ? (
            <Stato tono="avviso">{fraseScadePresto(t.giorniAllaScadenza)}</Stato>
          ) : (
            <Stato tono="ok">Salvato{scadeGiorno ? `, scade il ${formatData(scadeGiorno)}` : ''}</Stato>
          )
        }
      >
        <dl className="divide-y divide-border">
          <Voce etichetta="Account">
            {ig?.account_username ? (
              <span className="font-medium">@{ig.account_username}</span>
            ) : (
              <span className="text-muted-foreground">Si legge dal token al primo calcolo</span>
            )}
          </Voce>
          <Voce etichetta="Ultimo errore">
            {ig?.ultimo_errore ? (
              <span className="flex items-start gap-1.5 text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {ig.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(ig.ultimo_errore_il, oggi)}:
                    </span>
                  ) : null}{' '}
                  {ig.ultimo_errore}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Nessuno</span>
            )}
          </Voce>
        </dl>
        {t.scadePresto && t.giorniAllaScadenza !== null ? (
          <p className="text-sm text-status-warning">
            {fraseScadePresto(t.giorniAllaScadenza)}: se non si rinnova da solo, incolla un token nuovo prima di allora.
          </p>
        ) : null}
        <TokenInstagram presente={tokenPresente} scaduto={t.scaduto} scadeIl={scadeGiorno} />
        <p className="text-xs text-muted-foreground">
          Si salva cifrato, non si mostra più e si rinnova da solo ogni settimana finché resta valido. Chi lavora i DM, le chat
          escluse e «Ricalcola ieri» stanno in{' '}
          <Link href="/settings/instagram" className="underline underline-offset-4 hover:text-foreground">
            Instagram e Messenger
          </Link>
          .
        </p>
        <GuidaChiave id="instagram" />
      </Scheda>

      <Scheda
        id="messenger"
        titolo="Messenger"
        stato={
          messengerPresente ? (
            <Stato tono="ok">{msg?.pagina_nome ? `Collegata: Pagina «${msg.pagina_nome}»` : 'Collegata'}</Stato>
          ) : (
            <Stato tono="spenta">Non collegata</Stato>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          Il token della Pagina Facebook di Percorso Alpha. Serve solo per leggere le chat Messenger nell’Insight. Non manda mai
          messaggi.
        </p>
        <dl className="divide-y divide-border" data-testid="messenger-stato">
          <Voce etichetta="Pagina">
            {messengerPresente ? (
              <span className="inline-flex items-start gap-1.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
                <span>
                  {msg?.pagina_nome ? `Collegata: Pagina «${msg.pagina_nome}»` : 'Collegata'}
                  {msg?.token_aggiornato_il ? (
                    <span className="num block text-muted-foreground">
                      Token salvato il {formatData(oggiRoma(new Date(msg.token_aggiornato_il)))}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Non collegata</span>
            )}
          </Voce>
          {msg?.ultimo_errore ? (
            <Voce etichetta="Ultimo errore">
              <span className="flex items-start gap-1.5 text-status-critical" data-testid="messenger-ultimo-errore">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {msg.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(msg.ultimo_errore_il, oggi)}:
                    </span>
                  ) : null}{' '}
                  {msg.ultimo_errore}
                </span>
              </span>
            </Voce>
          ) : null}
        </dl>
        <TokenMessenger presente={messengerPresente} />
        <p className="text-xs text-muted-foreground">
          Le chat Messenger da escludere si scelgono in{' '}
          <Link href="/settings/instagram#chat-messenger-escluse" className="underline underline-offset-4 hover:text-foreground">
            Instagram e Messenger
          </Link>
          .
        </p>
        <GuidaChiave id="messenger" />
      </Scheda>

      <Scheda
        id="fathom"
        titolo="Fathom"
        stato={
          fa?.ultimo_errore ? (
            <Stato tono="errore">Non risponde bene</Stato>
          ) : fathomChiave ? (
            <Stato tono="ok" testId="fathom-stato">
              Fathom è collegato
              {fa?.chiave_aggiornata_il ? `: chiave salvata il ${formatData(fa.chiave_aggiornata_il)}` : ''}.
            </Stato>
          ) : (
            <Stato tono="spenta" testId="fathom-stato">
              Non collegato: senza la chiave l’app non trova le registrazioni. Il link incollato nel foglio dell’esito si salva lo
              stesso.
            </Stato>
          )
        }
      >
        {fa?.ultimo_errore ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-critical" data-testid="fathom-errore">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {fa.ultimo_errore}
          </p>
        ) : null}
        <ChiaveFathom presente={fathomChiave} salvataIl={fa?.chiave_aggiornata_il ?? null} />
        <p className="text-xs text-muted-foreground">
          L’app legge da Fathom solo la registrazione che corrisponde al link incollato dal closer, e la trascrizione quando la
          apri o quando Claude analizza la call. Trascrizioni e riassunti non si conservano. Interruttori e limite di spesa delle
          analisi stanno in{' '}
          <Link href="/settings/fathom" className="underline underline-offset-4 hover:text-foreground">
            Fathom
          </Link>
          .
        </p>
        <GuidaChiave id="fathom" />
      </Scheda>

      <Scheda
        id="anthropic"
        titolo="Claude (Anthropic)"
        stato={
          claude ? (
            <Stato tono="ok" testId="chiave-anthropic">
              Presente su Vercel
            </Stato>
          ) : (
            <Stato tono="errore" testId="chiave-anthropic">
              Manca ANTHROPIC_API_KEY su Vercel
            </Stato>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          La chiave sta su Vercel, non in questa app: qui si vede soltanto se c’è, mai il suo valore.
        </p>
        <GuidaChiave id="anthropic" />
      </Scheda>

      <Scheda
        id="groq"
        titolo="Groq (Alfire e voce)"
        stato={
          groq ? (
            <Stato tono="ok" testId="chiave-groq">
              Presente su Vercel
            </Stato>
          ) : (
            <Stato tono="errore" testId="chiave-groq">
              Manca ALFIRE_API_KEY su Vercel
            </Stato>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          La chiave sta su Vercel, non in questa app: qui si vede soltanto se c’è, mai il suo valore.
        </p>
        <GuidaChiave id="groq" />
      </Scheda>
    </div>
  )
}
