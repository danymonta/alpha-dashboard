import {
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDot,
  FolderKanban,
  Hourglass,
  ListChecks,
  Lock,
  Receipt,
  ScrollText,
  SearchX,
  Send,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { LinkBottone } from '@/components/link-bottone'
import { RiquadriCliente } from '@/components/onboarding/cliente-riquadri'
import { EliminaOnboarding } from '@/components/onboarding/elimina-onboarding'
import { RiquadroLink } from '@/components/onboarding/riquadro-link'
import { StatoOnboardingBadge } from '@/components/onboarding/stato'
import { TeamScheda } from '@/components/onboarding/team-scheda'
import { TelegramScheda } from '@/components/onboarding/telegram-scheda'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { formatOra, oggiRoma } from '@/lib/date'
import { getFormato, getLingua } from '@/lib/i18n/server'
import { ONBOARDING, titoloPasso } from '@/lib/i18n/testi/onboarding'
import { EVENTI_MAX, leggiPersone, leggiScheda } from '@/lib/onboarding/letture'
import { azioniLink, eventoInParole, nomeCliente, statoOnboarding } from '@/lib/onboarding/stati'
import { createClient } from '@/lib/supabase/server'
import { eStatoPasso, type StatoPasso } from '@/lib/validation/onboarding'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/** One icon per state of a step: the words say it, the icon only reinforces. */
const ICONA_PASSO: Record<StatoPasso, LucideIcon> = {
  bloccato: Lock,
  disponibile: Circle,
  in_corso: CircleDot,
  inviato: Send,
  in_attesa_team: Hourglass,
  fatto: CircleCheck,
}

const CLASSE_RIGA_LINK =
  'flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/**
 * The card of a client in onboarding (1.77.0, docs/onboarding/rilascio-a.md): the state,
 * the box «Link» with the admin's actions, the team, Telegram, the steps of the flow, the
 * log in words and the ways to the client's card, his sale and his project. Admin only:
 * RLS gives no row to anyone else. Never an amount; the log names only the admin's own
 * actions (CLAUDE.md sections 6 and 17).
 */
export default async function SchedaOnboardingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const profilo = await requireRuolo(['admin'])
  const { clientId } = await params
  const lingua = await getLingua()
  const t = ONBOARDING[lingua]
  const { formatData } = await getFormato()
  const supabase = await createClient()
  const [scheda, persone] = await Promise.all([leggiScheda(supabase, clientId), leggiPersone(supabase)])
  const indietro = { href: '/onboarding', etichetta: t.titolo }

  if (!scheda) {
    return (
      <div className="max-w-3xl space-y-6">
        <IntestazionePagina titolo={t.titolo} indietro={indietro} />
        <StatoVuoto
          Icona={SearchX}
          titolo={t.scheda.nonTrovata}
          descrizione={t.scheda.nonTrovataDescrizione}
          azione={
            <LinkBottone href="/onboarding" variant="outline">
              {t.tornaOnboarding}
            </LinkBottone>
          }
        />
      </div>
    )
  }

  const { riga, impostazioni } = scheda
  const aperto = impostazioni.aperto_ai_clienti
  const stato = statoOnboarding(riga, aperto)
  const nome = nomeCliente(riga, lingua)
  const giorno = (istante: string) => formatData(oggiRoma(new Date(istante)))

  return (
    <div className="max-w-5xl space-y-6" data-testid="scheda-onboarding">
      <IntestazionePagina
        titolo={t.scheda.titolo(nome)}
        indietro={indietro}
        descrizione={
          // the state under the name, in words with its icon; what it means is in the box «Link»
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="stato-scheda">
            <StatoOnboardingBadge stato={stato} lingua={lingua} className="font-medium" />
            {riga.percorso_stato === 'in_corso' && riga.passo_corrente ? (
              <span>{t.passoCorrente(titoloPasso(riga.passo_corrente, riga.passo_titolo, lingua))}</span>
            ) : null}
            {riga.created_at ? <span className="num">{t.scheda.avviatoIl(giorno(riga.created_at))}</span> : null}
          </span>
        }
      />

      {/* on the phone one column in the order the admin needs: link, team, Telegram, then steps, log and
          links (the two columns become one, `contents`, and each box takes its place with `order`) */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="min-w-0 max-lg:contents lg:space-y-4">
          <div className="max-lg:order-1">
            <RiquadroLink
              riga={{
                invito_id: riga.invito_id,
                invito_stato: riga.invito_stato,
                attivato_il: riga.attivato_il,
                attivato_da: riga.attivato_da,
                scade_il: riga.scade_il,
                usato_il: riga.usato_il,
                revocato_il: riga.revocato_il,
                revocato_motivo: riga.revocato_motivo,
                minorenne: riga.minorenne,
                consenso_genitore_il: riga.consenso_genitore_il,
                pagamento_confermato: riga.pagamento_confermato,
                prova: riga.prova,
                account_stato: riga.account_stato,
              }}
              stato={stato}
              azioni={azioniLink(riga, aperto)}
              aperto={aperto}
              giorni={impostazioni.giorni_validita_link}
              link={scheda.link}
              cliente={nome}
            />
          </div>

          <div className="space-y-4 max-lg:order-2">
            <RiquadriCliente
              lingua={lingua}
              accountStato={riga.account_stato}
              registratoIl={riga.registrato_il}
              consensi={scheda.consensi}
              video={scheda.video}
            />
          </div>

          <section aria-labelledby="passi-titolo" className="rounded-xl bg-card p-3 max-lg:order-5" data-testid="riquadro-passi">
            <div className="space-y-0.5 py-1.5">
              <h2 id="passi-titolo" className="flex items-center gap-1.5 text-sm font-medium">
                <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
                {t.passi.titolo}
              </h2>
              <p className="text-xs text-muted-foreground">{t.passi.descrizione}</p>
            </div>
            {scheda.passi.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">{t.passi.vuoto}</p>
            ) : (
              <ol className="divide-y divide-border">
                {scheda.passi.map((p, i) => {
                  const statoPasso: StatoPasso = eStatoPasso(p.stato) ? p.stato : 'bloccato'
                  const Icona = ICONA_PASSO[statoPasso]
                  const attore = p.attore === 'team' ? t.passi.attori.team : t.passi.attori.cliente
                  return (
                    <li key={p.passo} className="flex items-start gap-3 py-2.5" data-passo={p.passo} data-stato={statoPasso}>
                      <Icona
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          statoPasso === 'fatto' ? 'text-status-ok' : 'text-muted-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm break-words', statoPasso === 'bloccato' && 'text-muted-foreground')}>
                          {t.passi.numero(i + 1, titoloPasso(p.passo, p.titolo, lingua))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {attore}
                          {p.completato_il ? ` · ${t.passi.completatoIl(giorno(p.completato_il))}` : null}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-xs',
                          statoPasso === 'fatto' ? 'text-status-ok' : 'text-muted-foreground',
                        )}
                      >
                        {t.passi.stati[statoPasso]}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="registro-titolo" className="rounded-xl bg-card p-3 max-lg:order-6" data-testid="riquadro-registro">
            <div className="space-y-0.5 py-1.5">
              <h2 id="registro-titolo" className="flex items-center gap-1.5 text-sm font-medium">
                <ScrollText className="size-4 text-muted-foreground" aria-hidden="true" />
                {t.registro.titolo}
              </h2>
              <p className="text-xs text-muted-foreground">{t.registro.descrizione}</p>
            </div>
            {scheda.eventi.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">{t.registro.vuoto}</p>
            ) : (
              <ol className="divide-y divide-border">
                {scheda.eventi.map((e) => {
                  const attore =
                    e.attore === 'sistema'
                      ? t.registro.attori.sistema
                      : e.attore === 'cliente'
                        ? t.registro.attori.cliente
                        : t.registro.attori.team
                  return (
                    <li key={e.id} className="py-2.5" data-evento={e.tipo}>
                      <p className="text-sm break-words">{eventoInParole(e, lingua)}</p>
                      <p className="num text-xs text-muted-foreground">
                        {giorno(e.created_at)} {formatOra(e.created_at)} · {e.autore ? t.registro.da(e.autore) : attore}
                      </p>
                    </li>
                  )
                })}
              </ol>
            )}
            {scheda.eventiTagliati ? (
              <p className="pt-2 text-xs text-muted-foreground">{t.registro.massimo(EVENTI_MAX)}</p>
            ) : null}
          </section>
        </div>

        <div className="min-w-0 max-lg:contents lg:space-y-4">
          <div className="max-lg:order-3">
            <TeamScheda
              clientId={clientId}
              incarichi={{
                coach: { id: riga.coach_id, nome: riga.coach_nome },
                revisore: { id: riga.revisore_id, nome: riga.revisore_nome },
                responsabile: { id: riga.responsabile_id, nome: riga.responsabile_nome },
              }}
              persone={persone.map(({ id, nome: n }) => ({ id, nome: n }))}
              io={profilo.id}
              linkAttivo={riga.invito_stato === 'attivo' || riga.invito_stato === 'usato'}
            />
          </div>

          <div className="max-lg:order-4">
            <TelegramScheda
              clientId={clientId}
              username={scheda.telegram?.username ?? null}
              gruppo={scheda.telegram?.gruppo_privato_url ?? null}
            />
          </div>

          <nav
            aria-labelledby="collegamenti-titolo"
            className="rounded-xl bg-card p-3 max-lg:order-7"
            data-testid="riquadro-collegamenti"
          >
            <h2 id="collegamenti-titolo" className="flex min-h-11 items-center text-sm font-medium">
              {t.scheda.collegamenti}
            </h2>
            <ul className="-mx-2">
              <li>
                <Link href={`/clients/${clientId}`} className={CLASSE_RIGA_LINK}>
                  <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{t.apriCliente}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
              <li>
                {riga.sale_id ? (
                  <Link href={`/sales/${riga.sale_id}`} className={CLASSE_RIGA_LINK}>
                    <Receipt className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{t.apriVendita}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ) : (
                  <p className="flex min-h-11 items-center gap-3 px-2 py-2 text-sm text-muted-foreground">
                    <Receipt className="size-4 shrink-0" aria-hidden="true" />
                    {t.scheda.senzaVendita}
                  </p>
                )}
              </li>
              <li>
                {riga.progetto_id ? (
                  <Link href={`/progetti/${riga.progetto_id}`} className={CLASSE_RIGA_LINK} data-testid="apri-progetto">
                    <FolderKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{t.apriProgetto}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ) : (
                  <p className="flex min-h-11 items-center gap-3 px-2 py-2 text-sm text-muted-foreground">
                    <FolderKanban className="size-4 shrink-0" aria-hidden="true" />
                    {t.scheda.senzaProgetto}
                  </p>
                )}
              </li>
            </ul>
          </nav>

          <div className="max-lg:order-8">
            <EliminaOnboarding clientId={clientId} cliente={nome} registrato={riga.account_stato !== null} />
          </div>
        </div>
      </div>
    </div>
  )
}
