'use client'

import { createContext, useContext, type ReactNode } from 'react'

import {
  avanzaPasso,
  daiConsenso,
  inviaQuestionario,
  salvaQuestionario,
  togliAllegato,
  type EsitoConsenso,
  type EsitoInvia,
  type EsitoPercorso,
  type EsitoSalva,
  type EsitoTogli,
} from '@/app/(cliente)/percorso/actions'
import type { AllegatoCliente } from '@/lib/percorso/allegati'
import { CHIAVE_VISTO } from '@/lib/percorso/animazioni'
import type { AvanzaPasso } from '@/lib/validation/percorso'
import type { CampoAllegato } from '@/lib/validation/questionario'

/**
 * Where the client's area writes (1.82.0, «Prova del percorso»): one point the components of
 * /percorso read instead of importing the server actions directly. The default is the real
 * area, exactly as before (the server actions, POST /api/percorso/video, the upload of the
 * questionnaire's files, the addresses under /percorso, the memory of the animations); the
 * admin's test of the path (/prova-onboarding) gives its own, which writes only in the memory
 * of the page. Nothing of the real area changes.
 */

export type CorpoVideo = { blocco?: string; consegna?: string; durata: number; intervalli: [number, number][] }

export type EsitoChiediCodice = { ok: true } | { ok: false; errore: string; scaduta?: boolean }
export type EsitoVerificaCodice = { ok: true; vai: string } | { ok: false; errore: string; scaduta?: boolean; pronto?: boolean }

export type BackendPercorso = {
  avanzaPasso: (input: AvanzaPasso) => Promise<EsitoPercorso>
  daiConsenso: (input: { tipo: string; versione: string }) => Promise<EsitoConsenso>
  salvaQuestionario: (dati: FormData) => Promise<EsitoSalva>
  inviaQuestionario: (input: { versione: number }) => Promise<EsitoInvia>
  togliAllegato: (input: { id: string }) => Promise<EsitoTogli>
  /** The seconds of a video seen: null = the real POST /api/percorso/video of the player. */
  video: ((corpo: CorpoVideo) => Promise<{ percentuale: number; visto: boolean }>) | null
  /** A file of the questionnaire: null = the real upload (row, signed address, confirmation). */
  caricaAllegato: ((campo: CampoAllegato, file: File) => Promise<AllegatoCliente>) | null
  /** The registration's two steps (the address, the code): null = the real server actions. */
  accesso: {
    chiedi: (email: string) => Promise<EsitoChiediCodice>
    verifica: (codice: string) => Promise<EsitoVerificaCodice>
    /** After the code: the real area loads the whole page (a new cookie); the test moves on in memory. */
    entra: (vai: string) => void
  } | null
  /** «Continua» on the page of the link: null = the real server action. */
  continuaInvito: (() => void) | null
  indirizzi: { percorso: string; questionario: string; consensi: string }
  /** The key of what the animations remember between two visits: the test never touches the client's. */
  chiaveVisto: string
}

export const BACKEND_REALE: BackendPercorso = {
  avanzaPasso,
  daiConsenso,
  salvaQuestionario,
  inviaQuestionario,
  togliAllegato,
  video: null,
  caricaAllegato: null,
  accesso: null,
  continuaInvito: null,
  indirizzi: { percorso: '/percorso', questionario: '/percorso/questionario', consensi: '/percorso/consensi' },
  chiaveVisto: CHIAVE_VISTO,
}

const Contesto = createContext<BackendPercorso>(BACKEND_REALE)

export function BackendPercorsoProvider({ valore, children }: { valore: BackendPercorso; children: ReactNode }) {
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

export function useBackendPercorso(): BackendPercorso {
  return useContext(Contesto)
}
