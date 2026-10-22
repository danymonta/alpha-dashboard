'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * The account reads and never writes (the business coach, Dany 22/10/2026:
 * «Voglio che il business coach abbia accessi in lettura e veda tutto»). Set
 * once by the app shell from the role (solaLettura, lib/auth/roles.ts): the
 * client components that write (a cell of the Piano editoriale, a sheet, a
 * «Collega») show the value and no control. The server actions refuse him
 * anyway (negaSeNon), and RLS before them: this is what the page offers, not
 * what protects.
 */
const Contesto = createContext(false)

export function SolaLetturaProvider({ attiva, children }: { attiva: boolean; children: ReactNode }) {
  return <Contesto.Provider value={attiva}>{children}</Contesto.Provider>
}

/** True for a read-only account: hide the control that writes, show the value. */
export function useSolaLettura(): boolean {
  return useContext(Contesto)
}
