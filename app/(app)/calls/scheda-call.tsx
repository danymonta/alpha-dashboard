import { CalendarCheck, CalendarClock, CircleAlert, MessageCircle, Receipt, RotateCw } from 'lucide-react'

import { CollegaVendita } from '@/app/(app)/calls/collega-vendita'
import { FissaFollowUp } from '@/app/(app)/calls/follow-up'
import { ModificaCall } from '@/app/(app)/calls/modifica-call'
import { RegistraEsito } from '@/app/(app)/calls/registra-esito'
import { SpostaCall } from '@/app/(app)/calls/sposta-call'
import { AnalisiCall } from '@/components/call/analisi-call'
import { DallaCall } from '@/components/call/dalla-call'
import { PerformanceCall } from '@/components/call/performance-call'
import { RegistrazioneCall } from '@/components/call/registrazione-call'
import { StatoCall } from '@/components/call/stato-call'
import { LinkBottone } from '@/components/link-bottone'
import { Badge } from '@/components/ui/badge'
import { FOLLOW_UP, VENDITA_DA_REGISTRARE, chiedeVendita, quandoFollowUp } from '@/lib/call/follow-up'
import { avvisoEsitoFermo, motivoQuandoBloccato } from '@/lib/call/spostamento'
import { formatOra, oggiRoma } from '@/lib/date'
import { etichettaGiornoBreveIn, etichettaGiornoIn, quandoBreveIn, quandoFollowUpIn } from '@/lib/i18n/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { CALL } from '@/lib/i18n/testi/call'
import type { Database } from '@/lib/supabase/database.types'
import { chiedeMotivo } from '@/lib/validation/esito'
import { REGISTRAZIONE_OBBLIGATORIA_DAL } from '@/lib/validation/registrazione'
import {
  COLONNE_ANALISI,
  COLONNE_DALLA_CALL,
  COLONNE_VALUTAZIONE,
  type AnalisiVista,
  type DallaCallVista,
  type RegistrazioneVista,
  type ValutazioneVista,
} from '@/lib/call/analisi/vista'
import { normalizzaLink } from '@/lib/fathom/link'

type Enums = Database['public']['Enums']

/**
 * The columns of a call card, as CallVista reads them. The follow-up call
 * (Dany, 07/10/2026) both ways: `partenza` is the call this one follows up
 * (follow_up_di), `call_di_follow_up` the follow-up call of this one (one at
 * most). RLS reads them as the card: the closer and the setter of the first
 * call are the follow-up's too, unless it was handed to another closer; then
 * `ha_follow_up` (public.call_ha_follow_up) still says it is there, never
 * when. `di_follow_up` marks a follow-up call, also once its first call is gone.
 */
export const CAMPI_CALL =
  'id, programmata_il, tipo, stato, esito, qualificata, closer_id, importata, note, note_closer, obiezione_principale, prodotto_proposto_id, spostata_dal, volte_spostata, follow_up_di, di_follow_up, ha_follow_up:call_ha_follow_up, lead:leads(nome, instagram_handle), setter:profiles!calls_setter_id_fkey(nome), closer:profiles!calls_closer_id_fkey(nome), partenza:follow_up_di(id, programmata_il), call_di_follow_up:calls!follow_up_di(id, programmata_il, stato)'

/**
 * The amount pitched is read only where RLS lets it through: closer and admin.
 * The outcome, the reason for not closing and the closer's notes are written
 * by the closer (his outcome sheet opens on them) and read by the setter who
 * booked the call (Dany, 30/09/2026): he learns why his leads did not close;
 * the database keeps him from changing them. The setter's note goes the other
 * way: he writes it, the closer reads it.
 */
export const CAMPI_CALL_CLOSER = `${CAMPI_CALL}, link_registrazione, performance, pitch:call_pitch(importo_proposto), ha_vendita:call_ha_vendita, registrazione:call_registrazioni(stato, recording_id, link_verificato, durata_secondi), analisi:call_analisi(${COLONNE_ANALISI}), valutazione:call_valutazioni(${COLONNE_VALUTAZIONE}), spunti:call_spunti_setter(spunti)`

/**
 * The setter's query adds what he reads of the analysis («Dalla call»: the lead, never the recording,
 * the performance or the closer's valuation) and his own suggestions. He does not receive
 * link_registrazione nor performance (1.37.0): the Fathom link could show the whole call, price
 * included, and the performance is how the closer led it.
 */
export const CAMPI_CALL_SETTER = `${CAMPI_CALL}, dalla_call:call_analisi_setter(${COLONNE_DALLA_CALL}), spunti:call_spunti_setter(spunti)`

export type CallVista = {
  id: string
  programmata_il: string
  tipo: Enums['call_type']
  stato: Enums['call_status']
  esito: Enums['call_outcome'] | null
  qualificata: boolean | null
  closer_id: string | null
  /** Imported from Dany's call sheet (calls.importata): never asks for its sale (chiedeVendita). */
  importata?: boolean
  /** "Note del setter": the setter writes them, the closer reads them. */
  note: string | null
  /** "Note aggiuntive" of the closer: the closer writes them, the setter reads them. */
  note_closer: string | null
  /** Only in the closer's query (CAMPI_CALL_CLOSER): never in the setter's page. */
  link_registrazione?: string | null
  /** Only in the closer's query. */
  performance?: Enums['call_performance'] | null
  prodotto_proposto_id: string | null
  /** What Fathom answered for the link, or «non registrata»: the closer's query only. */
  registrazione?: RegistrazioneVista | null
  /** Claude's analysis, the closer's query only. */
  analisi?: AnalisiVista | null
  /** How the call was led: only the closer who led it (RLS), the closer's query only. */
  valutazione?: ValutazioneVista | null
  /** «Dalla call»: the setter's query only. */
  dalla_call?: DallaCallVista | null
  /** Suggestions on the DMs: the call's setter only (RLS). */
  spunti?: { spunti: string[] } | null
  /** Where the call was before its last move ("Spostata dal …"), and how many moves. */
  spostata_dal: string | null
  volte_spostata: number
  /** "Motivo di non chiusura": the closer writes it, the setter reads it. */
  obiezione_principale?: string | null
  /** Embedded only in the closer's query: RLS keeps it from the setter anyway. */
  pitch?: { importo_proposto: number } | null
  /** The call this one is the follow-up of (calls.follow_up_di, 07/10/2026). */
  follow_up_di?: string | null
  /** A follow-up call, with its link or after its first call was deleted (calls.di_follow_up). */
  di_follow_up?: boolean
  /** That call, when RLS lets it be read: its moment is on the card. */
  partenza?: { id: string; programmata_il: string } | null
  /** The follow-up call of this one: one at most, when RLS lets it be read. */
  call_di_follow_up?: { id: string; programmata_il: string; stato: Enums['call_status'] }[] | null
  /** Whether this call has its follow-up call, also one handed to another closer (public.call_ha_follow_up). */
  ha_follow_up?: boolean | null
  /**
   * Whether a closed call has its sale, only in the closer's query
   * (public.call_ha_vendita: also a sale that carries another closer): false
   * asks «Registra la vendita».
   */
  ha_vendita?: boolean | null
  lead: { nome: string; instagram_handle: string | null } | null
  setter: { nome: string } | null
  closer: { nome: string } | null
}

type Voce = { id: string; nome: string }

type Props = {
  call: CallVista
  /** Lists for the edit sheet: closers to hand the call to, products to pitch. */
  closers: Voce[]
  prodotti: Voce[]
  oggi: string
  adesso: number
  /** closer: records the outcome and moves the call; setter: moves the calls still to be held. */
  vista: 'closer' | 'setter'
  /** The admin also writes the setter's note; the closer only reads it. */
  admin?: boolean
  mostraGiorno?: boolean
  eliminabile?: boolean
  /** Where the sale of a closed call returns after saving (an internal path, e.g. the closer's day). */
  tornaA?: string | null
  /** The page's language (1.53.0): the card's lines; the sheets that write stay Italian. */
  lingua?: Lingua
}

export function SchedaCall({
  call,
  closers,
  prodotti,
  oggi,
  adesso,
  vista,
  admin = false,
  mostraGiorno = true,
  eliminabile = false,
  tornaA = null,
  lingua = 'it',
}: Props) {
  const t = CALL[lingua]
  const giorno = oggiRoma(new Date(call.programmata_il))
  const ora = formatOra(call.programmata_il)
  const nome = call.lead?.nome ?? t.leadSenzaNome
  const passata = new Date(call.programmata_il).getTime() < adesso
  const idTitolo = `call-${call.id}`
  const stato = (
    <StatoCall stato={call.stato} esito={call.esito} qualificata={call.qualificata} passata={passata} lingua={lingua} />
  )
  // the sheets that write stay Italian (1.53.0): they get the Italian description
  const descrizione = CALL.it.descrizioneCall(t.tipo[call.tipo], etichettaGiornoIn(giorno, oggi, 'it'), ora)
  const volte = call.volte_spostata ?? 0
  const traccia =
    call.spostata_dal && volte >= 1
      ? volte === 1
        ? t.spostataDal(quandoBreveIn(call.spostata_dal, oggi, lingua))
        : t.spostataVolte(volte, quandoBreveIn(call.spostata_dal, oggi, lingua))
      : null
  const ruolo = vista === 'setter' ? 'setter' : admin ? 'admin' : 'closer'
  // "Sposta" (Dany, 02/10/2026): a call still to be held, or one "In attesa di
  // conferma" (stato riprogrammata, 04/10/2026). The setter moves only the first:
  // an outcome is the closer's, and moving a call clears it. A held call and a
  // no-show never move, for anyone (restaNelSuoGiorno): they are neither.
  const spostabile = call.stato === 'programmata' || (vista === 'closer' && call.stato === 'riprogrammata')
  const sposta = spostabile ? (
    <SpostaCall
      callId={call.id}
      nomeLead={nome}
      descrizione={descrizione}
      giorno={giorno}
      ora={ora}
      oggi={oggi}
      admin={admin}
      inEvidenza={call.stato === 'riprogrammata'}
    />
  ) : null

  // the follow-up call (07/10/2026): the one this follows up, and the one that follows this.
  // One handed to another closer is not read here, but it is there: never "in chat",
  // never a booking that would fail, never its day
  const seguito = call.call_di_follow_up?.[0] ?? null
  const diAltroCloser = !seguito && call.ha_follow_up === true
  const inChat = !seguito && !diAltroCloser && call.stato === 'svolta' && call.esito === 'follow_up'
  const followUpFissato = call.di_follow_up === true || Boolean(call.follow_up_di)
  // the net under "Chiusa" → sale: the call's closer and the admin; the setter never reads sales
  const venditaDaRegistrare = vista === 'closer' && chiedeVendita(call)
  const hrefVendita = `/sales/new?${new URLSearchParams({ call: call.id, ...(tornaA ? { da: tornaA } : {}) }).toString()}`

  const dettagli = [
    t.tipo[call.tipo],
    call.lead?.instagram_handle,
    vista === 'closer'
      ? call.setter && t.da(call.setter.nome.split(' ')[0])
      : call.closer && t.con(call.closer.nome.split(' ')[0]),
  ].filter(Boolean)

  return (
    <article aria-labelledby={idTitolo} className="rounded-xl bg-card p-3">
      <div className="flex gap-3">
        <div className="w-14 shrink-0 pt-0.5 text-center">
          <p className="num text-base font-medium">{ora}</p>
          {mostraGiorno ? (
            // "gio 23/07" always on two lines, "oggi" on one: never a random wrap
            <p className="num text-xs leading-tight text-muted-foreground">
              {etichettaGiornoBreveIn(giorno, oggi, lingua)
                .split(' ')
                .map((parte) => (
                  <span key={parte} className="block">
                    {parte}
                  </span>
                ))}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {/* tabIndex -1: the focus comes back here when the button that opened a sheet goes (CollegaVendita, FissaFollowUp) */}
            <h3 id={idTitolo} tabIndex={-1} className="truncate text-sm font-medium">
              {nome}
            </h3>
            {followUpFissato ? (
              <Badge variant="outline" className="text-muted-foreground" data-testid="badge-follow-up">
                <RotateCw aria-hidden="true" />
                {t.followUp}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">{dettagli.join(' · ')}</p>
          {followUpFissato ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" data-testid="follow-up-di">
              <RotateCw className="size-3.5 shrink-0" aria-hidden="true" />
              {call.partenza ? t.followUpDella(quandoBreveIn(call.partenza.programmata_il, oggi, lingua)) : t.followUpSenzaData}
            </p>
          ) : null}
          {traccia ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" data-testid="spostata">
              <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
              {traccia}
            </p>
          ) : null}
          {/* setter: no outcome to record; a call he can move has the action row below */}
          {vista === 'setter' && !sposta ? <div className="mt-1">{stato}</div> : null}
        </div>
        <div className="-mt-1.5 -mr-1.5">
          <ModificaCall
            call={{
              id: call.id,
              tipo: call.tipo,
              data: giorno,
              ora,
              closer_id: call.closer_id,
              note: call.note,
              note_closer: call.note_closer,
              obiezione_principale: call.obiezione_principale ?? null,
              link_registrazione: vista === 'closer' ? (call.link_registrazione ?? null) : null,
              performance: vista === 'closer' ? (call.performance ?? null) : null,
              prodotto_proposto_id: call.prodotto_proposto_id,
              importo_proposto: call.pitch?.importo_proposto ?? null,
            }}
            nomeLead={nome}
            closers={closers}
            prodotti={prodotti}
            conDettagli={vista === 'closer'}
            noteSetterModificabili={vista === 'setter' || admin}
            // the setter's on any call not to be held any more; closer and admin
            // correct the date of every call, a no-show included (03/10/2026)
            quandoBloccato={motivoQuandoBloccato(call.stato, ruolo)}
            conSposta={sposta !== null}
            eliminabile={eliminabile}
          />
        </div>
      </div>

      {/* 390px: the state on one line, the buttons on the next when they do not fit beside it */}
      {vista === 'closer' || sposta ? (
        <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 pl-[4.25rem]">
          {stato}
          <div className="ml-auto flex items-center gap-2">
            {sposta}
            {vista === 'closer' ? (
              <RegistraEsito
                callId={call.id}
                nomeLead={nome}
                descrizione={descrizione}
                giaRegistrata={call.stato !== 'programmata'}
                futura={!passata}
                ferma={avvisoEsitoFermo(call.stato)}
                tornaA={tornaA}
                motivo={call.obiezione_principale ?? null}
                noteCloser={call.note_closer}
                giorno={giorno}
                ora={ora}
                oggi={oggi}
                admin={admin}
                setter={call.setter?.nome ?? null}
                chiedeRegistrazione={
                  passata && !call.link_registrazione && !call.registrazione && giorno >= REGISTRAZIONE_OBBLIGATORIA_DAL
                }
                followUp={
                  seguito
                    ? quandoFollowUp(seguito.programmata_il, oggi)
                    : diAltroCloser
                      ? FOLLOW_UP.assegnataAltroCloser
                      : null
                }
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* the follow-up call of this one, or the follow-up by chat; the setter reads, never books */}
      {seguito ? (
        <p className="mt-1 flex items-center gap-1.5 pl-[4.25rem] text-sm" data-testid="call-di-follow-up">
          <CalendarCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {t.followUpDi(quandoFollowUpIn(seguito.programmata_il, oggi, lingua))}
        </p>
      ) : diAltroCloser ? (
        <p className="mt-1 flex items-center gap-1.5 pl-[4.25rem] text-sm" data-testid="call-di-follow-up">
          <CalendarCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {t.followUpAltroCloser}
        </p>
      ) : inChat ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pl-[4.25rem]">
          <p className="flex min-h-11 items-center gap-1.5 text-sm" data-testid="follow-up-in-chat">
            <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {t.followUpInChat}
          </p>
          {vista === 'closer' ? (
            <div className="ml-auto">
              <FissaFollowUp
                callId={call.id}
                idTitolo={idTitolo}
                nomeLead={nome}
                descrizione={descrizione}
                giorno={giorno}
                ora={ora}
                oggi={oggi}
                admin={admin}
                setter={call.setter?.nome ?? null}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* a closed call without its sale: cash, revenue and the setter's commission start from it */}
      {venditaDaRegistrare ? (
        <div className="mt-1 pl-[4.25rem]">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="flex min-h-11 items-center gap-1.5 text-sm text-status-warning" data-testid="vendita-da-registrare">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              {t.venditaDaRegistrare}
            </p>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {/* a sale registered without the call: the admin ties it, never a second sale */}
              {admin ? (
                <CollegaVendita callId={call.id} idTitolo={idTitolo} nomeLead={nome} hrefVendita={hrefVendita} />
              ) : null}
              <LinkBottone href={hrefVendita} className="gap-1.5 px-3" aria-label={VENDITA_DA_REGISTRARE.nomeBottone(nome)}>
                <Receipt className="size-4" aria-hidden="true" />
                {VENDITA_DA_REGISTRARE.bottone}
              </LinkBottone>
            </div>
          </div>
          {/* the closer does not tie a sale: he asks the admin, never a second sale */}
          {admin ? null : (
            <p className="text-xs text-muted-foreground" data-testid="vendita-chiedi-admin">
              {VENDITA_DA_REGISTRARE.chiediAdmin}
            </p>
          )}
        </div>
      ) : null}

      {/* the recording, Claude's analysis and how the call was led: the closer and the admin; the setter reads «Dalla call» */}
      {vista === 'closer' ? (
        <>
          <RegistrazioneCall
            callId={call.id}
            nomeLead={nome}
            link={call.link_registrazione ?? null}
            registrazione={call.registrazione ?? null}
            svolta={call.stato === 'svolta' && chiedeRegistrazioneEsito(call.esito)}
            oggi={oggi}
          />
          <AnalisiCall
            callId={call.id}
            analisi={call.analisi ?? null}
            analizzabile={call.stato === 'svolta' && Boolean(call.esito) && analizzabileDa(call)}
            esito={call.esito}
            motivoSalvato={call.obiezione_principale ?? null}
            link={call.link_registrazione ?? null}
          />
          {call.valutazione ? (
            <PerformanceCall callId={call.id} valutazione={call.valutazione} performanceSalvata={call.performance ?? null} />
          ) : null}
          {/* the admin who is also the call's setter reads his own suggestions (RLS gives no other row) */}
          {call.spunti?.spunti?.length ? <SpuntiDelSetter spunti={call.spunti.spunti} lingua={lingua} /> : null}
        </>
      ) : call.dalla_call ? (
        <DallaCall dalla={call.dalla_call} spunti={call.spunti?.spunti ?? null} />
      ) : null}

      {/* the closer reads what the setter wrote with the call's pencil */}
      {vista === 'closer' ? <TestoCall etichetta={t.noteSetter} testo={call.note} testId="note-setter" /> : null}

      {/* both sides see it: the closer wrote it, the setter learns from it */}
      {chiedeMotivo(call.esito) ? (
        <TestoCall etichetta={t.motivo} testo={call.obiezione_principale} testId="motivo-non-chiusura" />
      ) : null}

      {/* the setter reads the closer's notes, never writes them */}
      {vista === 'setter' ? <TestoCall etichetta={t.noteCloser} testo={call.note_closer} testId="note-closer" /> : null}
    </article>
  )
}

/** A text of the call, under the card: two lines at most, in full in the edit sheet. */
function TestoCall({ etichetta, testo, testId }: { etichetta: string; testo: string | null | undefined; testId: string }) {
  if (!testo?.trim()) return null
  return (
    <p className="mt-1 line-clamp-2 pl-[4.25rem] text-sm break-words" data-testid={testId}>
      <span className="text-muted-foreground">{etichetta}:</span> <span lang="it">{testo}</span>
    </p>
  )
}

function chiedeRegistrazioneEsito(esito: string | null): boolean {
  return esito === 'chiusa' || esito === 'follow_up' || esito === 'persa'
}

/** A held call with a Fathom link and a registration row: the one Claude can analyse. */
function analizzabileDa(call: CallVista): boolean {
  if (!call.link_registrazione || call.registrazione?.stato !== 'collegata') return false
  const n = normalizzaLink(call.link_registrazione)
  return n.ok && n.fathom
}

function SpuntiDelSetter({ spunti, lingua }: { spunti: string[]; lingua: Lingua }) {
  const t = CALL[lingua]
  return (
    <div className="mt-1 pl-[4.25rem] text-sm" data-testid="spunti-per-te">
      <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.spuntiTitolo}</h5>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {spunti.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t.spuntiSoloTu}</p>
    </div>
  )
}
