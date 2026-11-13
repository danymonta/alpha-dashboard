'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { toast } from 'sonner'

import { BackendPercorsoProvider, type BackendPercorso } from '@/components/percorso/backend-percorso'
import { ScheletroPercorso } from '@/components/percorso/scheletro-percorso'
import { useTesti } from '@/components/i18n/lingua-provider'
import { fraseToccaATe } from '@/lib/email/cliente'
import { PROVA } from '@/lib/i18n/testi/prova'
import type { CampoBase } from '@/lib/percorso/campo-base'
import {
  campoDiProva,
  completaLezioneProva,
  segnaVideoLezioniProva,
  videoLezioneProva,
  type AulaProva,
  type DatiCampoProva,
} from '@/lib/percorso/campo-prova'
import { oggiRoma } from '@/lib/date'
import type { Percorso } from '@/lib/percorso/letture'
import {
  AVVISO_DELL_AZIONE,
  aggiungiAllegato,
  avanza,
  azioneTeam,
  daiConsenso,
  inviaQuestionario,
  percorsoDi,
  progressoVideo,
  salvaQuestionario,
  segnaVideoVisti,
  statoIniziale,
  togliAllegato,
  vaiA,
  type AzioneTeam,
  type DatiProva,
  type Meta,
  type StatoProva,
} from '@/lib/percorso/prova'
import { TESTI_PERCORSO, TESTI_REGISTRAZIONE } from '@/lib/percorso/testi'
import { BYTE_ALLEGATO_MAX, TIPI_ALLEGATO, nomeFilePulito, type TipoAllegato } from '@/lib/validation/questionario'

/**
 * The memory of «Prova del percorso» (1.82.0): the state of the fake client, the backend the
 * client's components write to (components/percorso/backend-percorso.tsx) and the commands of
 * the bar. Everything stays in this page: sessionStorage keeps it across a reload of the same
 * tab (a convenience, try/catch), «Ricomincia» starts again. Never a request that writes.
 */

export const INDIRIZZI_PROVA = {
  percorso: '/prova-onboarding',
  questionario: '/prova-onboarding/questionario',
  consensi: '/prova-onboarding/consensi',
  link: '/prova-onboarding/link',
} as const

export const CHIAVE_VISTO_PROVA = 'alpha_percorso_visto_prova'
const CHIAVE_STATO = 'alpha_prova_percorso'
const CHIAVE_AULA = 'alpha_prova_aula'
/** The code of the test registration: shown on the bar, never sent. */
export const CODICE_PROVA = '12345678'

type Fase = 'link' | 'registrazione'

type ContestoProva = {
  dati: DatiProva
  stato: StatoProva
  percorso: Percorso
  /** The home base of the fake client (1.83.0). */
  campo: CampoBase
  fase: Fase
  setFase: (f: Fase) => void
  codiceInviato: boolean
  team: (azione: AzioneTeam) => void
  segnaVideo: () => void
  vai: (meta: Meta) => void
  ricomincia: () => void
}

const Contesto = createContext<ContestoProva | null>(null)

export function useProva(): ContestoProva {
  const c = useContext(Contesto)
  if (!c) throw new Error('useProva fuori dalla prova')
  return c
}

function firmaDi(dati: DatiProva): string {
  return [dati.versioneConsenso, ...dati.passi.map((p) => p.chiave), ...dati.blocchi.map((b) => b.id)].join('|')
}

function leggiSalvato(firma: string): StatoProva | null {
  try {
    const grezzo = window.sessionStorage.getItem(CHIAVE_STATO)
    if (!grezzo) return null
    const v = JSON.parse(grezzo) as { firma?: string; stato?: StatoProva }
    return v.firma === firma && v.stato && typeof v.stato === 'object' && v.stato.passi ? v.stato : null
  } catch {
    return null
  }
}

function salva(firma: string, stato: StatoProva) {
  try {
    window.sessionStorage.setItem(CHIAVE_STATO, JSON.stringify({ firma, stato }))
  } catch {
    // a private window: the test simply starts again at the next reload
  }
}

function leggiAula(): AulaProva {
  try {
    const grezzo = window.sessionStorage.getItem(CHIAVE_AULA)
    const v = grezzo ? (JSON.parse(grezzo) as unknown) : null
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as AulaProva) : {}
  } catch {
    return {}
  }
}

function salvaAula(aula: AulaProva) {
  try {
    window.sessionStorage.setItem(CHIAVE_AULA, JSON.stringify(aula))
  } catch {
    // a private window: the Aula starts again at the next reload
  }
}

function dimentica() {
  try {
    window.sessionStorage.removeItem(CHIAVE_AULA)
    window.sessionStorage.removeItem(CHIAVE_STATO)
    window.localStorage.removeItem(CHIAVE_VISTO_PROVA)
  } catch {
    // nothing to forget
  }
}

function nessunaIscrizione() {
  return () => {}
}

/**
 * The state lives only in the browser (the memory of the tab, the clock of the admin): the server
 * draws the skeleton and the test starts once the page is in the browser, never a mismatch.
 */
export function ProvaProvider({ dati, campo, children }: { dati: DatiProva; campo: DatiCampoProva; children: ReactNode }) {
  const nelBrowser = useSyncExternalStore(
    nessunaIscrizione,
    () => true,
    () => false,
  )
  if (!nelBrowser) {
    return (
      <div data-testid="prova-carico" className="mx-auto w-full max-w-3xl px-4">
        <ScheletroPercorso />
      </div>
    )
  }
  return (
    <ProvaNelBrowser dati={dati} datiCampo={campo}>
      {children}
    </ProvaNelBrowser>
  )
}

function ProvaNelBrowser({ dati, datiCampo, children }: { dati: DatiProva; datiCampo: DatiCampoProva; children: ReactNode }) {
  const t = useTesti(PROVA)
  const router = useRouter()
  const firma = useMemo(() => firmaDi(dati), [dati])
  // the memory of this tab, or a client who just registered
  const [iniziale] = useState<StatoProva>(() => leggiSalvato(firmaDi(dati)) ?? statoIniziale(dati, new Date()))
  const [stato, setStatoGrezzo] = useState<StatoProva>(iniziale)
  const [fase, setFase] = useState<Fase>('link')
  const [codiceInviato, setCodiceInviato] = useState(false)
  const ref = useRef<StatoProva>(iniziale)
  const [aula, setAulaGrezza] = useState<AulaProva>(() => leggiAula())
  const aulaRef = useRef<AulaProva>(aula)
  const setAula = useCallback((nuova: AulaProva) => {
    aulaRef.current = nuova
    setAulaGrezza(nuova)
    salvaAula(nuova)
  }, [])
  // launched: the programme watched (the Aula's modules open after it)
  const lanciato = () => percorsoDi(dati, ref.current, new Date()).lanciato

  const setStato = useCallback(
    (nuovo: StatoProva) => {
      ref.current = nuovo
      setStatoGrezzo(nuovo)
      salva(firma, nuovo)
    },
    [firma],
  )

  const backend = useMemo<BackendPercorso>(() => {
    const ora = () => new Date()
    const attuale = () => ref.current
    return {
      async avanzaPasso(input) {
        const e = avanza(dati, attuale(), input, ora())
        if (!e.ok) return e
        setStato(e.stato)
        return { ok: true, percorso: percorsoDi(dati, e.stato, ora()) }
      },
      async daiConsenso(input) {
        const e = daiConsenso(dati, attuale(), input.versione, ora())
        if (!e.ok) return e
        setStato(e.stato)
        return { ok: true, datoIl: e.stato.consenso?.datoIl ?? null }
      },
      async salvaQuestionario(formData) {
        let input: { risposte: unknown; schermata: number; versione: number } | null = null
        try {
          const testo = formData.get('dati')
          input = typeof testo === 'string' ? JSON.parse(testo) : null
        } catch {
          input = null
        }
        if (!input) return { ok: false, errore: TESTI_PERCORSO.errore }
        const e = salvaQuestionario(dati, attuale(), input, ora())
        if (!e.ok) return e
        setStato(e.stato)
        return e.esito === 'cambiato'
          ? { ok: true, esito: 'cambiato', risposte: e.risposte, versione: e.versione }
          : { ok: true, esito: 'salvato', versione: e.versione }
      },
      async inviaQuestionario(input) {
        const e = inviaQuestionario(dati, attuale(), input.versione, ora())
        if (!e.ok) return e
        setStato(e.stato)
        return e.esito === 'cambiato'
          ? { ok: true, esito: 'cambiato', risposte: e.risposte, versione: e.versione }
          : { ok: true, esito: 'inviato', inviatoIl: e.inviatoIl }
      },
      async togliAllegato(input) {
        const e = togliAllegato(dati, attuale(), input.id)
        if (!e.ok) return e
        setStato(e.stato)
        return { ok: true, allegati: e.stato.allegati }
      },
      async completaLezione(input) {
        const e = completaLezioneProva(datiCampo, aulaRef.current, input.lezione, lanciato(), ora())
        if (!e.ok) return e
        setAula(e.aula)
        return { ok: true, completataIl: e.completataIl }
      },
      async video(corpo) {
        if (corpo.lezione) {
          const v = videoLezioneProva(
            datiCampo,
            aulaRef.current,
            { lezione: corpo.lezione, durata: corpo.durata, intervalli: corpo.intervalli },
            lanciato(),
            ora(),
          )
          if (!v.ok) throw new Error(v.errore)
          setAula(v.aula)
          return { percentuale: v.percentuale, visto: v.visto }
        }
        const e = progressoVideo(dati, attuale(), corpo, ora())
        if (!e.ok) throw new Error(e.errore)
        setStato(e.stato.stato)
        return { percentuale: e.stato.percentuale, visto: e.stato.visto }
      },
      async caricaAllegato(campo, file) {
        // only the name and the size: the file never leaves the browser in the test
        const tipo = (TIPI_ALLEGATO as readonly string[]).includes(file.type) ? (file.type as TipoAllegato) : null
        if (!tipo || file.size <= 0 || file.size > BYTE_ALLEGATO_MAX) throw new Error('file')
        const e = aggiungiAllegato(dati, attuale(), { campo, nome: nomeFilePulito(file.name), tipo, byte: file.size })
        if (!e.ok) throw new Error(e.errore)
        setStato(e.stato.stato)
        return e.stato.allegato
      },
      accesso: {
        async chiedi() {
          setCodiceInviato(true)
          return { ok: true }
        },
        async verifica(codice) {
          return codice.replace(/\D/g, '') === CODICE_PROVA
            ? { ok: true, vai: INDIRIZZI_PROVA.percorso }
            : { ok: false, errore: TESTI_REGISTRAZIONE.errato }
        },
        entra(vai) {
          setFase('link')
          setCodiceInviato(false)
          router.push(vai)
        },
      },
      continuaInvito() {
        setFase('registrazione')
      },
      indirizzi: INDIRIZZI_PROVA,
      chiaveVisto: CHIAVE_VISTO_PROVA,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lanciato reads the ref, never a stale state
  }, [dati, datiCampo, router, setStato, setAula])

  const team = useCallback(
    (azione: AzioneTeam) => {
      const s = ref.current
      const e = azioneTeam(dati, s, azione, new Date())
      if (!e.ok) {
        toast.error(e.errore)
        return
      }
      setStato(e.stato)
      toast.success(t.fatto(t.azioni[azione]))
      const motivo = AVVISO_DELL_AZIONE[azione]
      if (motivo) toast.info(t.email(fraseToccaATe(motivo)), { duration: 8000 })
    },
    [dati, setStato, t],
  )

  const segnaVideo = useCallback(() => {
    const s = ref.current
    setStato(segnaVideoVisti(dati, s))
    setAula(segnaVideoLezioniProva(datiCampo, aulaRef.current, percorsoDi(dati, s, new Date()).lanciato, new Date()))
    toast.success(t.videoSegnato)
  }, [dati, datiCampo, setStato, setAula, t])

  const vai = useCallback(
    (meta: Meta) => {
      const s = ref.current
      setStato(vaiA(dati, s, meta, new Date()))
      router.push(INDIRIZZI_PROVA.percorso)
    },
    [dati, router, setStato],
  )

  const ricomincia = useCallback(() => {
    dimentica()
    setFase('link')
    setCodiceInviato(false)
    setStato(statoIniziale(dati, new Date()))
    setAula({})
    toast.success(t.ricominciato)
    router.push(INDIRIZZI_PROVA.percorso)
  }, [dati, router, setStato, setAula, t])

  const percorso = useMemo(() => percorsoDi(dati, stato, new Date()), [dati, stato])
  const campo = useMemo(
    () =>
      campoDiProva(datiCampo, aula, {
        lanciato: percorso.lanciato,
        nome: dati.nomeCompleto.split(' ')[0] ?? '',
        giornoCheckup: oggiRoma(),
      }),
    [datiCampo, aula, percorso.lanciato, dati.nomeCompleto],
  )

  return (
    <Contesto.Provider
      value={{ dati, stato, percorso, campo, fase, setFase, codiceInviato, team, segnaVideo, vai, ricomincia }}
    >
      <BackendPercorsoProvider valore={backend}>{children}</BackendPercorsoProvider>
    </Contesto.Provider>
  )
}
