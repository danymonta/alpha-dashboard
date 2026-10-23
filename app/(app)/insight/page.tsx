import { MessageCircle, Sparkles, TriangleAlert } from 'lucide-react'
import { cookies } from 'next/headers'

import { LinkBottone } from '@/components/link-bottone'
import { AgendaRecap } from '@/components/insight/agenda-recap'
import { AggiornamentoInsight, BottoneAggiornaDati } from '@/components/insight/aggiorna-dati'
import { AnnunciProvider } from '@/components/insight/annunci'
import type { ContenutoCalendario } from '@/components/insight/arriva-da'
import { Automazione } from '@/components/insight/automazione'
import { IntestazioneInsight } from '@/components/insight/intestazione-insight'
import { ContenutoInsight, NavigazioneInsight } from '@/components/insight/navigazione'
import { RecapChat } from '@/components/insight/recap-chat'
import { SchedeCanale } from '@/components/insight/schede-canale'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { leggeComeAdmin, puoScrivere } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { isDataISO } from '@/lib/date'
import { canaleIniziale, COOKIE_CANALE_INSIGHT, fonteDi, ID_PANNELLO_INSIGHT, idScheda, type Canale } from '@/lib/insight/canale'
import { insightConfigurato, UrlPassoNonValido, urlPasso } from '@/lib/insight/config'
import { LINK_CHIAVE_MESSENGER } from '@/lib/insight/link'
import { getLingua } from '@/lib/i18n/server'
import { INSIGHT } from '@/lib/i18n/testi/insight'
import { AGGIORNA } from '@/lib/insight/parole'
import { formattaOraRecap, leggiDettagliRecap, leggiRecap, type RecapLetto } from '@/lib/insight/recap'
import { leggiStatoInsight, leggiStatoInsightAdmin, type StatoInsight, type StatoInsightAdmin } from '@/lib/insight/stato'
import { FRASI_ERRORE } from '@/lib/instagram/report'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** The days of a tab the select offers: the 30 of the retention, with room to spare. */
const GIORNI_MAX = 60

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

type RigaRecap = { giorno: string; generato_il: string; esecuzione_id: string | null; dati: unknown }

/** The posts a recap names (the leads' origins and the posts table): the admin's calendar lookup. */
function shortcodeDelRecap(recap: RecapLetto): string[] {
  const codici = new Set<string>()
  for (const l of [...recap.leads, ...recap.reactivate]) if (l.origine?.shortcode) codici.add(l.origine.shortcode)
  for (const p of recap.content.posts) if (p.shortcode) codici.add(p.shortcode)
  return [...codici].slice(0, 200)
}

/** The Instagram token as Impostazioni › Instagram judges it: past its date, or refused by Meta (code 190). */
function tokenScaduto(collegamento: { token_scade_il: string | null; ultimo_errore: string | null } | null, adesso: number) {
  if (!collegamento) return false
  const scade = collegamento.token_scade_il ? Date.parse(collegamento.token_scade_il) : Number.NaN
  return (Number.isFinite(scade) && scade <= adesso) || collegamento.ultimo_errore === FRASI_ERRORE.token
}

/**
 * «Insight delle ultime 24h» (1.35.0, CLAUDE.md section 29): the artifact
 * "Recap DM Alpha" in the app, for the admin and every active setter (D2).
 * Three tabs: Instagram and Messenger (each its recap of the day) and Agenda
 * (inside the Instagram one). The tab in ?canale, then the cookie of this
 * browser, then Instagram; the day in ?giorno, else the newest (never
 * remembered, as the artifact).
 *
 * Everything is read with the session (RLS: insight_puo_leggere()). Both
 * roles get «Aggiorna dati» (the setter from 1.50.0, with neutral words). The
 * admin also gets «Automazione», the run's details, and the
 * calendar contents of the posts the recap names (never stored in the
 * recap: the setter has no Marketing area and gets none of it).
 */
export default async function InsightPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // the business coach (22/10/2026): reads the admin's recap, its warnings and costs; no «Aggiorna dati»,
  // no «Automazione», no «Fatto», no settings
  const profilo = await requireRuolo(['admin', 'setter', 'business_coach'])
  const admin = profilo.ruolo === 'admin'
  const comeAdmin = leggeComeAdmin(profilo.ruolo)
  const scrive = puoScrivere(profilo.ruolo)
  const sp = await searchParams
  const canale: Canale = canaleIniziale(primo(sp.canale), (await cookies()).get(COOKIE_CANALE_INSIGHT)?.value)
  const fonte = fonteDi(canale)
  const richiesto = primo(sp.giorno)
  const giornoRichiesto = isDataISO(richiesto) ? richiesto : null
  const adesso = new Date()

  const supabase = await createClient()

  function recapDi(giorno: string | null) {
    const query = supabase.from('insight_recap').select('giorno, generato_il, esecuzione_id, dati').eq('canale', fonte)
    return (giorno ? query.eq('giorno', giorno) : query.order('giorno', { ascending: false }).limit(1)).maybeSingle()
  }

  const [giorniR, recapR, statoR, agendaR, ultimoR, collegamentoR] = await Promise.all([
    supabase.from('insight_recap').select('giorno').eq('canale', fonte).order('giorno', { ascending: false }).limit(GIORNI_MAX),
    recapDi(giornoRichiesto),
    supabase.rpc('insight_stato'),
    // the Agenda badge: today's calls of the newest Instagram recap, whatever the tab and the day (as the artifact)
    supabase
      .from('insight_recap')
      .select('agenda:dati->agenda')
      .eq('canale', 'instagram')
      .order('giorno', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // a recap newer than this one reloads the page (the 60 s poll in the browser)
    supabase.from('insight_recap').select('generato_il').order('generato_il', { ascending: false }).limit(1).maybeSingle(),
    admin
      ? supabase.from('instagram_collegamento').select('token_scade_il, ultimo_errore').maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (giorniR.error || recapR.error || agendaR.error || ultimoR.error) {
    throw new Error('Impossibile leggere i recap dell’Insight')
  }

  let riga = (recapR.data ?? null) as RigaRecap | null
  // a day that has no recap (an old link, the cleanup after 30 days): the newest
  if (!riga && giornoRichiesto) {
    const piuNuovo = await recapDi(null)
    if (piuNuovo.error) throw new Error('Impossibile leggere i recap dell’Insight')
    riga = (piuNuovo.data ?? null) as RigaRecap | null
  }
  const giorno = riga?.giorno ?? null
  const letto = riga ? leggiRecap(riga.dati) : null
  // the run's warnings and how it was made are the admin's (C47, D23): they are not in the document the
  // setter reads (insight_recap.dati), they are on the run, which only the admin can read
  let recap: RecapLetto | null = letto
  if (letto && comeAdmin && riga?.esecuzione_id) {
    const { data: run } = await supabase.from('insight_esecuzioni').select('dettagli_recap').eq('id', riga.esecuzione_id).maybeSingle()
    recap = { ...letto, ...leggiDettagliRecap(run?.dettagli_recap, fonte) }
  }
  const giorni = ((giorniR.data ?? []) as { giorno: string }[]).map((r) => r.giorno)
  const agendaUltimo = (agendaR.data as { agenda?: unknown } | null)?.agenda
  const callOggi = Array.isArray(agendaUltimo)
    ? agendaUltimo.filter((c) => typeof c === 'object' && c !== null && (c as { day?: unknown }).day === 'oggi').length
    : 0

  const stato: StatoInsight | StatoInsightAdmin | null = statoR.error
    ? null
    : comeAdmin
      ? leggiStatoInsightAdmin(statoR.data)
      : leggiStatoInsight(statoR.data)

  // the admin only: the calendar of the posts the recap names, and whether Messenger has a token
  const codici = comeAdmin && recap && canale !== 'agenda' ? shortcodeDelRecap(recap) : []
  const [calendarioR, messengerR, fattiR] = await Promise.all([
    codici.length
      ? supabase.from('marketing_contenuti').select('id, nome, instagram_shortcode').in('instagram_shortcode', codici)
      : Promise.resolve({ data: [], error: null }),
    admin && fonte === 'messenger' && !riga ? supabase.rpc('messenger_token_presente') : Promise.resolve({ data: false, error: null }),
    giorno && canale !== 'agenda'
      ? supabase.from('insight_fatto').select('chiave').eq('giorno', giorno).eq('canale', fonte).eq('fatto', true)
      : Promise.resolve({ data: [], error: null }),
  ])
  const calendario: Record<string, ContenutoCalendario> = {}
  if (!calendarioR.error) {
    for (const c of (calendarioR.data ?? []) as { id: string; nome: string; instagram_shortcode: string | null }[]) {
      if (c.instagram_shortcode) calendario[c.instagram_shortcode] = { id: c.id, nome: c.nome }
    }
  }
  // the switches are read again in the browser at once (FattiProvider): a failed read here is not the page's end
  const fatti = fattiR.error ? [] : ((fattiR.data ?? []) as { chiave: string }[]).map((r) => r.chiave)

  let urlValido = true
  if (admin) {
    try {
      urlPasso()
    } catch (e) {
      if (!(e instanceof UrlPassoNonValido)) throw e
      urlValido = false
    }
  }

  const t = INSIGHT[await getLingua()]
  // «Aggiornato 08/10, 22:55 · ultime 24 ore», as lib/insight/parole.ts, in the page's language
  const quando = riga ? formattaOraRecap(recap?.generated_at || riga.generato_il).replace(' ', ', ') : ''
  const meta = [
    riga ? `${quando ? `${t.aggiornato(quando)} · ` : ''}${t.ultimeOre(recap?.window_hours ?? 24)}` : t.nessunRecap,
    // the setter has no «Automazione»: his meta line says when the recap comes
    !admin && stato ? (stato.attivo ? t.automatico(stato.ora) : t.automaticoSpento) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const props = {
    stato,
    // the admin reads why the Insight is off, the setter only that it is (1.50.0)
    configurato: insightConfigurato(),
    ultimoGeneratoIl: ((ultimoR.data ?? null) as { generato_il: string } | null)?.generato_il ?? null,
    adesso: adesso.toISOString(),
  }

  const contenuto = (() => {
    if (!riga) {
      if (fonte === 'messenger' && !(admin && messengerR.data === true)) {
        return (
          <StatoVuoto
            Icona={MessageCircle}
            titolo={t.messengerTitolo}
            descrizione={admin ? t.messengerAdmin : t.messengerLettura}
            azione={admin ? <LinkBottone href={LINK_CHIAVE_MESSENGER}>{AGGIORNA.apriImpostazioni}</LinkBottone> : undefined}
          />
        )
      }
      return (
        <StatoVuoto
          Icona={Sparkles}
          titolo={canale === 'agenda' ? t.vuotoAgenda : t.vuotoCanale(canale === 'messenger' ? 'Messenger' : 'Instagram')}
          descrizione={fonte === 'messenger' ? t.primoMessenger : t.vuotoDescrizione}
          azione={scrive ? <BottoneAggiornaDati className="h-11 gap-1.5 px-4" /> : undefined}
        />
      )
    }
    if (!recap || !giorno) {
      return (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          {t.illeggibile}
        </p>
      )
    }
    if (canale === 'agenda') return <AgendaRecap agenda={recap.agenda} showUp={recap.show_up} />
    return (
      <RecapChat
        key={`${fonte}-${giorno}`}
        recap={recap}
        fonte={fonte}
        giorno={giorno}
        fatti={fatti}
        admin={comeAdmin}
        adesso={props.adesso}
        calendario={calendario}
        solaLettura={!scrive}
      />
    )
  })()

  const corpo = (
    <NavigazioneInsight>
      <div className="space-y-6">
        <IntestazioneInsight canale={canale} meta={meta} giorni={giorni} giorno={giorno} conBottone={Boolean(riga) && scrive} />
        {admin ? (
          <Automazione
            attiva={stato?.attivo ?? false}
            ora={stato?.ora ?? '19:00'}
            configurato={insightConfigurato()}
            ultimoTickIl={(stato as StatoInsightAdmin | null)?.ultimo_tick_il ?? null}
          />
        ) : null}
        <SchedeCanale canale={canale} callOggi={callOggi} />
        <div role="tabpanel" id={ID_PANNELLO_INSIGHT} aria-labelledby={idScheda(canale)}>
          <ContenutoInsight>{contenuto}</ContenutoInsight>
        </div>
      </div>
    </NavigazioneInsight>
  )

  return (
    <AnnunciProvider>
      {comeAdmin ? (
        <AggiornamentoInsight
          admin
          {...props}
          urlValido={urlValido}
          tokenScaduto={tokenScaduto(
            (collegamentoR.data ?? null) as { token_scade_il: string | null; ultimo_errore: string | null } | null,
            adesso.getTime(),
          )}
        >
          {corpo}
        </AggiornamentoInsight>
      ) : (
        <AggiornamentoInsight admin={false} {...props}>
          {corpo}
        </AggiornamentoInsight>
      )}
    </AnnunciProvider>
  )
}
