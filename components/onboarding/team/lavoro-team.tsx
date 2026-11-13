import {
  CalendarClock,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  FileText,
  Link2,
  Target,
  TriangleAlert,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import {
  AggiungiConsegna,
  BottoneCommunity,
  ConfermaCall,
  ConsegnaProgramma,
  EsitoCall,
  ObiettivoImpostato,
  RiavviaOnboarding,
  SbloccaPasso,
  TestRicevuti,
  TogliConsegna,
} from '@/components/onboarding/team/azioni-team'
import { formatOra, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ONBOARDING_TEAM } from '@/lib/i18n/testi/onboarding'
import type { PermessiTeam } from '@/lib/onboarding/code'
import type { CallIncaricato, SchedaIncaricato } from '@/lib/onboarding/team'
import { cn } from '@/lib/utils'

/**
 * «Il lavoro del team» (release B2): what the coach in charge, the responsible and the admin
 * do on a registered client, one card per moment of the path (the call, the community, the
 * goal, the test week, the programme) and, for the admin and the coach, «Sblocca step» and
 * «Riavvia onboarding». Each card says where the client is in words and offers only the
 * action that is due; the reviewer reads and has nothing to tap but his own task. Never the
 * link, the payment or the log (CLAUDE.md section 6).
 */

const ICONA_TIPO: Record<string, LucideIcon> = { video: Video, pdf: FileText, link: Link2 }

function Riquadro({
  titolo,
  Icona,
  children,
  testId,
}: {
  titolo: string
  Icona: LucideIcon
  children: ReactNode
  testId: string
}) {
  return (
    <section className="space-y-2.5 rounded-lg border border-border/70 p-3" data-testid={testId}>
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <Icona className="size-4 text-muted-foreground" aria-hidden="true" />
        {titolo}
      </h3>
      {children}
    </section>
  )
}

function Riga({ fatto, children }: { fatto: boolean; children: ReactNode }) {
  const Icona = fatto ? CircleCheck : CircleDashed
  return (
    <p className={cn('flex items-start gap-2 text-sm', !fatto && 'text-muted-foreground')}>
      <Icona className={cn('mt-0.5 size-4 shrink-0', fatto && 'text-status-ok')} aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  )
}

function Azioni({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-2 pt-0.5">{children}</div>
}

export function LavoroTeam({
  scheda,
  permessi,
  lingua,
  adesso,
  cliente,
}: {
  scheda: SchedaIncaricato
  permessi: PermessiTeam
  lingua: Lingua
  /** The moment of the read (ms): a call before it can be marked as held. */
  adesso: number
  cliente: string
}) {
  const t = ONBOARDING_TEAM[lingua]
  const { formatData, formatPercentuale } = formato(lingua)
  const giorno = (istante: string) => formatData(oggiRoma(new Date(istante)))
  const quando = (istante: string) => t.call.quando(giorno(istante), formatOra(istante))
  const statoPasso = (chiave: string) => scheda.passi.find((p) => p.chiave === chiave)?.stato ?? 'bloccato'
  const clientId = scheda.client_id
  const completato = scheda.percorso?.stato === 'completato'

  function azioniCall(call: CallIncaricato, evidenza: boolean) {
    if (!permessi.coach || call.stato !== 'prenotata') return null
    const passata = new Date(call.inizio).getTime() <= adesso
    return (
      <Azioni>
        {call.meet_url ? (
          <a
            href={call.meet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {t.call.apriMeet}
          </a>
        ) : null}
        <EsitoCall
          callId={call.id}
          inizio={call.inizio}
          passata={passata}
          evidenza={evidenza && passata}
          etichetta={passata ? t.call.esito.bottone : t.call.esito.sposta}
        />
      </Azioni>
    )
  }

  function rigaCall(call: CallIncaricato | null) {
    if (!call) return <Riga fatto={false}>{t.call.nonPrenotata}</Riga>
    switch (call.stato) {
      case 'da_confermare':
        return <Riga fatto={false}>{t.call.daConfermare(quando(call.inizio))}</Riga>
      case 'svolta':
        return <Riga fatto>{t.call.svolta(quando(call.inizio))}</Riga>
      case 'non_presentato':
        return <Riga fatto={false}>{t.call.nonPresentato}</Riga>
      default:
        return <Riga fatto={false}>{t.call.prenotata(quando(call.inizio))}</Riga>
    }
  }

  const c = scheda.community
  const statoObiettivo = statoPasso('obiettivo')
  const statoTest = statoPasso('test')
  const statoProgramma = statoPasso('programma')
  // «Sblocca step»: what the database lets open (or close, a step stuck on its video), never call or programme
  const bloccati = scheda.passi.filter((p) => p.sbloccabile).map((p) => ({ chiave: p.chiave, titolo: p.titolo }))

  // one primary action: the first open queue, in the order of the path (call, community, goal, test,
  // programme, checkpoint); every other button is outline, so the next thing to do is the only one in colour
  const callPassata = (call: CallIncaricato | null) =>
    !!call && call.stato === 'prenotata' && new Date(call.inizio).getTime() <= adesso
  const primaria: string | null = completato
    ? null
    : permessi.coach && scheda.call?.stato === 'da_confermare'
      ? 'call_conferma'
      : permessi.coach && callPassata(scheda.call)
        ? 'call_esito'
        : permessi.community && c?.richiesta_inviata_il && !c.community_approvata_il
          ? 'community_approva'
          : permessi.community && c?.presentato_il && !c.presentazione_controllata_il
            ? 'community_controlla'
            : permessi.coach && scheda.code.obiettivo_da_impostare
              ? 'obiettivo'
              : permessi.coach && statoTest === 'in_attesa_team'
                ? 'test'
                : permessi.coach && statoProgramma === 'in_attesa_team'
                  ? 'programma'
                  : permessi.coach && callPassata(scheda.checkpoint)
                    ? 'checkpoint_esito'
                    : null

  return (
    <div className="space-y-3" data-testid="lavoro-team">
      {scheda.code.preparazione_incompleta ? (
        <p
          className="flex items-start gap-2 rounded-lg bg-status-warning/10 px-3 py-2 text-sm text-status-warning"
          data-testid="preparazione-incompleta"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.scheda.preparazioneIncompleta}
        </p>
      ) : null}

      <Riquadro titolo={t.call.titolo} Icona={CalendarClock} testId="team-call">
        {rigaCall(scheda.call)}
        {scheda.call?.stato === 'da_confermare' && permessi.coach ? (
          <Azioni>
            <ConfermaCall clientId={clientId} inizio={scheda.call.inizio} evidenza={primaria === 'call_conferma'} />
          </Azioni>
        ) : null}
        {scheda.call ? azioniCall(scheda.call, primaria === 'call_esito') : null}
      </Riquadro>

      <Riquadro titolo={t.community.titolo} Icona={Users} testId="team-community">
        <Riga fatto={!!c?.richiesta_inviata_il}>
          {t.community.richiesta}
          {c?.richiesta_inviata_il ? ` ${t.community.il(giorno(c.richiesta_inviata_il))}` : ''}
        </Riga>
        <Riga fatto={!!c?.community_approvata_il}>
          {t.community.approvata}
          {c?.community_approvata_il ? ` ${t.community.il(giorno(c.community_approvata_il))}` : ''}
        </Riga>
        <Riga fatto={!!c?.presentato_il}>
          {t.community.presentato}
          {c?.presentato_il ? ` ${t.community.il(giorno(c.presentato_il))}` : ''}
        </Riga>
        <Riga fatto={!!c?.presentazione_controllata_il}>
          {t.community.controllata}
          {c?.presentazione_controllata_il ? ` ${t.community.il(giorno(c.presentazione_controllata_il))}` : ''}
        </Riga>
        {permessi.community && !completato && statoPasso('community') !== 'bloccato' ? (
          <Azioni>
            {!c?.community_approvata_il ? (
              <BottoneCommunity
                clientId={clientId}
                cliente={cliente}
                azione="approvata"
                evidenza={primaria === 'community_approva'}
              />
            ) : null}
            {c?.presentato_il && !c.presentazione_controllata_il ? (
              <BottoneCommunity
                clientId={clientId}
                cliente={cliente}
                azione="controllata"
                evidenza={primaria === 'community_controlla'}
              />
            ) : null}
          </Azioni>
        ) : null}
      </Riquadro>

      <Riquadro titolo={t.obiettivo.titolo} Icona={Target} testId="team-obiettivo">
        {scheda.code.obiettivo_da_impostare ? (
          <>
            <Riga fatto={false}>{t.obiettivo.daImpostare}</Riga>
            {permessi.coach ? (
              <Azioni>
                <ObiettivoImpostato clientId={clientId} evidenza={primaria === 'obiettivo'} />
              </Azioni>
            ) : null}
          </>
        ) : statoObiettivo === 'fatto' ? (
          <Riga fatto>{t.obiettivo.fatto}</Riga>
        ) : statoObiettivo === 'bloccato' ? (
          <Riga fatto={false}>{t.obiettivo.prima}</Riga>
        ) : (
          <Riga fatto>{t.obiettivo.aperto}</Riga>
        )}
      </Riquadro>

      <Riquadro titolo={t.test.titolo} Icona={CircleCheck} testId="team-test">
        {statoTest === 'bloccato' ? (
          <Riga fatto={false}>{t.test.prima}</Riga>
        ) : (
          <>
            {scheda.test && scheda.test.voci.length > 0 ? (
              <ul className="space-y-1" aria-label={t.test.voci}>
                {scheda.test.voci.map((v) => (
                  <li key={v.id}>
                    <Riga fatto={v.spuntata}>
                      {v.titolo ?? ''}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({v.spuntata ? t.test.spuntata : t.test.nonSpuntata})
                      </span>
                    </Riga>
                  </li>
                ))}
              </ul>
            ) : null}
            {statoTest === 'in_attesa_team' ? <Riga fatto={false}>{t.test.inAttesa}</Riga> : null}
            {statoTest === 'fatto' ? <Riga fatto>{t.test.fatti}</Riga> : null}
            {scheda.code.test_da_rivedere ? <Riga fatto={false}>{t.test.revisore}</Riga> : null}
            {statoTest === 'in_attesa_team' && permessi.coach ? (
              <Azioni>
                <TestRicevuti clientId={clientId} evidenza={primaria === 'test'} />
              </Azioni>
            ) : null}
          </>
        )}
      </Riquadro>

      <Riquadro titolo={t.programma.titolo} Icona={FileText} testId="team-programma">
        {statoProgramma === 'bloccato' && scheda.consegne.length === 0 ? (
          <Riga fatto={false}>{t.programma.prima}</Riga>
        ) : (
          <>
            <h4 className="text-xs font-medium text-muted-foreground">{t.programma.consegne}</h4>
            {scheda.consegne.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.programma.consegneVuote}</p>
            ) : (
              <ul className="divide-y divide-border/70" data-testid="consegne">
                {scheda.consegne.map((k) => {
                  const Icona = ICONA_TIPO[k.tipo] ?? Link2
                  const link = k.tipo === 'video' && k.youtube_id ? `https://www.youtube.com/watch?v=${k.youtube_id}` : k.url
                  return (
                    <li key={k.id} className="flex items-center gap-2 py-1.5">
                      <Icona className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm break-words">{k.titolo}</span>
                        <span className="num block text-xs text-muted-foreground">
                          {[
                            t.programma.tipi[k.tipo] ?? k.tipo,
                            k.obbligatoria ? t.programma.obbligatoria : null,
                            k.tipo === 'video' ? t.programma.visto(formatPercentuale(k.percentuale / 100)) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t.programma.apriNomeAccessibile(k.titolo)}
                          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <ExternalLink className="size-4" aria-hidden="true" />
                        </a>
                      ) : null}
                      {permessi.coach && !completato ? <TogliConsegna consegnaId={k.id} titolo={k.titolo} /> : null}
                    </li>
                  )
                })}
              </ul>
            )}
            {scheda.checkpoint ? (
              <Riga fatto={scheda.checkpoint.stato === 'svolta'}>
                {t.call.checkpoint}: {quando(scheda.checkpoint.inizio)}
              </Riga>
            ) : null}
            {permessi.coach && !completato ? (
              <Azioni>
                {statoProgramma === 'in_attesa_team' ? (
                  <ConsegnaProgramma
                    clientId={clientId}
                    consegne={scheda.consegne.length}
                    evidenza={primaria === 'programma'}
                  />
                ) : null}
                <AggiungiConsegna clientId={clientId} />
              </Azioni>
            ) : null}
            {scheda.checkpoint ? azioniCall(scheda.checkpoint, primaria === 'checkpoint_esito') : null}
          </>
        )}
      </Riquadro>

      {permessi.coach && !completato ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <SbloccaPasso clientId={clientId} bloccati={bloccati} />
          <RiavviaOnboarding clientId={clientId} />
        </div>
      ) : null}
    </div>
  )
}
