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
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { CHIAVI } from '@/lib/i18n/testi/chiavi'
import { IMPOSTAZIONI, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { insightConfigurato } from '@/lib/insight/config'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { statoToken } from '@/lib/instagram/stato-token'
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
  const lingua = await getLingua()
  const T = CHIAVI[lingua]
  const { formatData } = formato(lingua)
  const tr = (testo: string) => traduciImpostazioni(testo, lingua)
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
    throw new Error(T.errore)
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
  if (t.scaduto) daSistemare.push(T.daSistemareScaduto)
  else if (t.scadePresto && t.giorniAllaScadenza !== null) {
    daSistemare.push(T.daSistemareScadePresto(t.giorniAllaScadenza))
  }
  if (!claude) daSistemare.push(T.daSistemareClaude)

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: IMPOSTAZIONI[lingua].titolo }}
        titolo={T.titolo}
        descrizione={T.descrizione}
      />

      {t.scaduto ? (
        <div
          role="alert"
          data-testid="instagram-token-scaduto"
          className="flex items-start gap-2 rounded-xl border border-status-critical/40 bg-status-critical/10 p-4 text-sm font-medium"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
          {T.avvisoScaduto}
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
            <Stato tono="spenta">{T.nonCollegato}</Stato>
          ) : t.scaduto ? (
            <Stato tono="errore">
              {t.scadutoPerData ? T.scaduto(scadeGiorno ? formatData(scadeGiorno) : null) : T.rifiutato}
            </Stato>
          ) : t.scadePresto && t.giorniAllaScadenza !== null ? (
            <Stato tono="avviso">{T.scadeTra(t.giorniAllaScadenza)}</Stato>
          ) : (
            <Stato tono="ok">{T.salvato(scadeGiorno ? formatData(scadeGiorno) : null)}</Stato>
          )
        }
      >
        <dl className="divide-y divide-border">
          <Voce etichetta={T.account}>
            {ig?.account_username ? (
              <span className="font-medium">@{ig.account_username}</span>
            ) : (
              <span className="text-muted-foreground">{T.primoCalcolo}</span>
            )}
          </Voce>
          <Voce etichetta={T.ultimoErrore}>
            {ig?.ultimo_errore ? (
              <span className="flex items-start gap-1.5 text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {ig.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(ig.ultimo_errore_il, oggi, lingua)}:
                    </span>
                  ) : null}{' '}
                  {tr(ig.ultimo_errore)}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{T.nessuno}</span>
            )}
          </Voce>
        </dl>
        {t.scadePresto && t.giorniAllaScadenza !== null ? (
          <p className="text-sm text-status-warning">
            {T.rinnovaPrima(t.giorniAllaScadenza)}
          </p>
        ) : null}
        <TokenInstagram presente={tokenPresente} scaduto={t.scaduto} scadeIl={scadeGiorno} />
        <p className="text-xs text-muted-foreground">
          {T.notaInstagram}{' '}
          <Link href="/settings/instagram" className="underline underline-offset-4 hover:text-foreground">
            {T.instagramMessenger}
          </Link>
          .
        </p>
        <GuidaChiave id="instagram" lingua={lingua} />
      </Scheda>

      <Scheda
        id="messenger"
        titolo="Messenger"
        stato={
          messengerPresente ? (
            <Stato tono="ok">{T.collegata(msg?.pagina_nome ?? null)}</Stato>
          ) : (
            <Stato tono="spenta">{T.nonCollegata}</Stato>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          {T.descrizioneMessenger}
        </p>
        <dl className="divide-y divide-border" data-testid="messenger-stato">
          <Voce etichetta={T.pagina}>
            {messengerPresente ? (
              <span className="inline-flex items-start gap-1.5">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
                <span>
                  {T.collegata(msg?.pagina_nome ?? null)}
                  {msg?.token_aggiornato_il ? (
                    <span className="num block text-muted-foreground">
                      {T.tokenSalvatoIl(formatData(oggiRoma(new Date(msg.token_aggiornato_il))))}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">{T.nonCollegata}</span>
            )}
          </Voce>
          {msg?.ultimo_errore ? (
            <Voce etichetta={T.ultimoErrore}>
              <span className="flex items-start gap-1.5 text-status-critical" data-testid="messenger-ultimo-errore">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {msg.ultimo_errore_il ? (
                    <span className="num inline-flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {quando(msg.ultimo_errore_il, oggi, lingua)}:
                    </span>
                  ) : null}{' '}
                  {tr(msg.ultimo_errore)}
                </span>
              </span>
            </Voce>
          ) : null}
        </dl>
        <TokenMessenger presente={messengerPresente} />
        <p className="text-xs text-muted-foreground">
          {T.notaMessenger}{' '}
          <Link href="/settings/instagram#chat-messenger-escluse" className="underline underline-offset-4 hover:text-foreground">
            {T.instagramMessenger}
          </Link>
          .
        </p>
        <GuidaChiave id="messenger" lingua={lingua} />
      </Scheda>

      <Scheda
        id="fathom"
        titolo="Fathom"
        stato={
          fa?.ultimo_errore ? (
            <Stato tono="errore">{T.fathomNonRisponde}</Stato>
          ) : fathomChiave ? (
            <Stato tono="ok" testId="fathom-stato">
              {T.fathomCollegato(fa?.chiave_aggiornata_il ? formatData(fa.chiave_aggiornata_il) : null)}
            </Stato>
          ) : (
            <Stato tono="spenta" testId="fathom-stato">
              {T.fathomNonCollegato}
            </Stato>
          )
        }
      >
        {fa?.ultimo_errore ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-critical" data-testid="fathom-errore">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {tr(fa.ultimo_errore)}
          </p>
        ) : null}
        <ChiaveFathom presente={fathomChiave} salvataIl={fa?.chiave_aggiornata_il ?? null} />
        <p className="text-xs text-muted-foreground">
          {T.notaFathom}{' '}
          <Link href="/settings/fathom" className="underline underline-offset-4 hover:text-foreground">
            {T.fathom}
          </Link>
          .
        </p>
        <GuidaChiave id="fathom" lingua={lingua} />
      </Scheda>

      <Scheda
        id="anthropic"
        titolo={T.guida.guide.anthropic.titolo}
        stato={
          claude ? (
            <Stato tono="ok" testId="chiave-anthropic">
              {T.presenteSuVercel}
            </Stato>
          ) : (
            <Stato tono="errore" testId="chiave-anthropic">
              {T.mancaAnthropic}
            </Stato>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          {T.staSuVercel}
        </p>
        <GuidaChiave id="anthropic" lingua={lingua} />
      </Scheda>

      <Scheda
        id="groq"
        titolo={T.guida.guide.groq.titolo}
        stato={
          groq ? (
            <Stato tono="ok" testId="chiave-groq">
              {T.presenteSuVercel}
            </Stato>
          ) : (
            <Stato tono="errore" testId="chiave-groq">
              {T.mancaGroq}
            </Stato>
          )
        }
      >
        <p className="text-sm text-muted-foreground">
          {T.staSuVercel}
        </p>
        <GuidaChiave id="groq" lingua={lingua} />
      </Scheda>
    </div>
  )
}
