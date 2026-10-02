import { ChevronLeft, SearchX } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { ModificaProgetto } from '@/components/pm/progetto/modifica-progetto'
import { CoachDelCliente, ScegliCoach, type PersonaCoach } from '@/components/pm/progetto/scegli-coach'
import { SchedeProgetto } from '@/components/pm/schede-progetto'
import { BarraAvanzamento } from '@/components/pm/stato-progetto'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { ETICHETTA_RUOLO, livelloPmEffettivo } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'
import { formatData } from '@/lib/format'
import { ETICHETTA_STATO_PROGETTO, isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Header and tabs of one project. RLS decides who sees it: members, and the admin. */
export default async function LayoutProgetto({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const profilo = await requireProfilo()
  const { id } = await params
  const supabase = await createClient()

  const { data: progetto } = isUuid(id)
    ? await supabase
        .from('pm_progetti')
        .select(
          'id, nome, descrizione, stato, data_inizio, data_fine, responsabile_id, client_id, coach_id, reparto_id, reparto:pm_reparti(nome), responsabile:profiles!pm_progetti_responsabile_id_fkey(nome), coach:profiles!pm_progetti_coach_id_fkey(id, nome)',
        )
        .eq('id', id)
        .maybeSingle()
    : { data: null }

  if (!progetto) {
    return (
      <div className="max-w-3xl">
        <IntestazionePagina titolo="Progetto" indietro={{ href: '/progetti', etichetta: 'Progetti' }} />
        <StatoVuoto
          Icona={SearchX}
          titolo="Progetto non trovato"
          descrizione="Il progetto non esiste o non fai parte del suo team."
          azione={<LinkBottone href="/progetti" variant="outline">Torna ai progetti</LinkBottone>}
        />
      </div>
    )
  }

  const adminApp = profilo.ruolo === 'admin'
  const adminPm = livelloPmEffettivo(profilo.ruolo, profilo.livello_pm) === 'admin'
  const [gestisce, avanzamento, membri, cliente, clienti, collegati, reparti] = await Promise.all([
    supabase.rpc('pm_puo_gestire', { p_progetto: progetto.id }),
    // progress and late tasks: computed by the view, only read here
    supabase
      .from('v_pm_progetti')
      .select('task_totali, task_completati, task_in_ritardo, avanzamento')
      .eq('id', progetto.id)
      .maybeSingle(),
    supabase
      .from('pm_membri')
      .select('profilo:profiles!pm_membri_profile_id_fkey(id, nome)')
      .eq('progetto_id', progetto.id),
    // RLS on clients: whoever may not see this client gets nothing back
    progetto.client_id
      ? supabase.from('clients').select('nome, cognome').eq('id', progetto.client_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    adminApp
      ? supabase.from('clients').select('id, nome, cognome').order('nome').order('cognome')
      : Promise.resolve({ data: [], error: null }),
    // one project per client: the clients that already have another one are not offered
    adminApp
      ? supabase.from('pm_progetti').select('client_id').not('client_id', 'is', null).neq('id', progetto.id)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('pm_reparti').select('id, nome, attivo, progetti_con_cliente').order('ordine').order('nome'),
  ])

  const conProgetto = new Set((collegati.data ?? []).map((p) => p.client_id))

  // a client's project: who manages it picks the coach (02/10/2026)
  const sceltaCoach = progetto.client_id !== null && gestisce.data === true
  const [attivi, compitiDiRuolo] = sceltaCoach
    ? await Promise.all([
        supabase.from('profiles').select('id, nome, ruolo').eq('attivo', true).order('nome'),
        supabase
          .from('pm_task')
          .select('titolo, per_ruolo, assegnatari:pm_task_assegnatari(profile_id)')
          .eq('progetto_id', progetto.id)
          .is('parent_id', null)
          .not('per_ruolo', 'is', null)
          .order('ordine'),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]

  const persone = (membri.data ?? [])
    .flatMap((m) => (m.profilo ? [m.profilo] : []))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  const nomeCliente = cliente.data ? [cliente.data.nome, cliente.data.cognome].filter(Boolean).join(' ') : null
  const periodo =
    progetto.data_inizio || progetto.data_fine
      ? `${formatData(progetto.data_inizio)} → ${progetto.data_fine ? formatData(progetto.data_fine) : 'in corso'}`
      : null
  const meta = [progetto.reparto?.nome, ETICHETTA_STATO_PROGETTO[progetto.stato], periodo].filter(Boolean).join(' · ')
  // responsible and client only from 640px: on a phone the header stays short
  const chi = [
    progetto.responsabile ? `Responsabile: ${progetto.responsabile.nome}` : null,
    nomeCliente ? `Cliente: ${nomeCliente}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const numeri = avanzamento.data

  const personeCoach: PersonaCoach[] = (attivi.data ?? [])
    .map((p) => ({ id: p.id, nome: p.nome, ruolo: ETICHETTA_RUOLO[p.ruolo], coach: p.ruolo === 'coach' }))
    .sort((a, b) => Number(b.coach) - Number(a.coach) || a.nome.localeCompare(b.nome, 'it'))
  // the same choice pm_scegli_coach makes: only tasks still free or the coach's move, to
  // someone with the role (already in the project first)
  const nelProgetto = new Set(persone.map((p) => p.id))
  const elencoNonCaricato = Boolean(attivi.error || compitiDiRuolo.error)
  const daRuolo = (compitiDiRuolo.data ?? []).flatMap((t) => {
    if (!t.per_ruolo) return []
    const suChi = t.assegnatari.map((a) => a.profile_id)
    if (suChi.length > 0 && !(progetto.coach_id && suChi.includes(progetto.coach_id))) return []
    const chi = (attivi.data ?? [])
      .filter((p) => p.ruolo === t.per_ruolo)
      .sort((a, b) => Number(nelProgetto.has(b.id)) - Number(nelProgetto.has(a.id)) || a.nome.localeCompare(b.nome, 'it'))[0]
    const ruolo = ETICHETTA_RUOLO[t.per_ruolo]
    return [
      chi
        ? `«${t.titolo}» va a ${chi.nome} (${ruolo}).`
        : `«${t.titolo}» va al coach: nel team nessuno ha il ruolo ${ruolo}.`,
    ]
  })

  return (
    // one width for header, tabs and every tab's content: the right edge never jumps
    <div className="space-y-5">
      <header className="space-y-3">
        {/* ghost link: -ml-2 puts the chevron on the content edge, min-h-11 keeps the 44px target */}
        <Link
          href="/progetti"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 pl-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Progetti
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-heading text-xl font-semibold break-words md:text-2xl">{progetto.nome}</h1>
            {meta ? <p className="num text-sm text-muted-foreground">{meta}</p> : null}
            {chi ? <p className="hidden text-sm text-muted-foreground sm:block">{chi}</p> : null}
          </div>
          {gestisce.data ? (
            <ModificaProgetto
              progetto={{
                id: progetto.id,
                nome: progetto.nome,
                descrizione: progetto.descrizione,
                stato: progetto.stato,
                data_inizio: progetto.data_inizio,
                data_fine: progetto.data_fine,
                responsabile_id: progetto.responsabile_id,
                client_id: progetto.client_id,
                reparto_id: progetto.reparto_id,
              }}
              reparti={(reparti.data ?? []).filter((r) => r.attivo || r.id === progetto.reparto_id)}
              membri={persone}
              clienti={
                adminApp
                  ? (clienti.data ?? [])
                      .filter((c) => !conProgetto.has(c.id))
                      .map((c) => ({ id: c.id, etichetta: [c.nome, c.cognome].filter(Boolean).join(' ') }))
                  : null
              }
              eliminabile={adminPm}
            />
          ) : null}
        </div>
        {progetto.client_id ? (
          // a client's project: its coach (or that it has none yet), and for the admin the way to the client
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="coach-del-cliente">
            <CoachDelCliente coach={progetto.coach} />
            {sceltaCoach ? (
              <ScegliCoach
                progettoId={progetto.id}
                cliente={nomeCliente ?? progetto.nome}
                coach={progetto.coach}
                persone={personeCoach}
                daRuolo={daRuolo}
                elencoNonCaricato={elencoNonCaricato}
              />
            ) : null}
            {adminApp ? (
              <Link
                href={`/clients/${progetto.client_id}`}
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline underline-offset-4"
              >
                Scheda del cliente
              </Link>
            ) : null}
          </div>
        ) : null}
        {numeri ? (
          <BarraAvanzamento
            completati={numeri.task_completati ?? 0}
            totali={numeri.task_totali ?? 0}
            avanzamento={numeri.avanzamento}
            inRitardo={numeri.task_in_ritardo ?? 0}
            className="max-w-sm"
          />
        ) : null}
      </header>
      <SchedeProgetto id={progetto.id} />
      {children}
    </div>
  )
}
