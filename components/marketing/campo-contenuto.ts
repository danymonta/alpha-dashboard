'use client'

import { useEffect, useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'

import { modificaCampoContenuto, type EsitoCampo } from '@/app/(app)/marketing/contenuti/actions'
import { useOpzioniToast, usePannello } from '@/components/marketing/contesto-pannello'
import { useOpzioni } from '@/components/marketing/opzioni-contesto'
import { useUscitaDallaLista } from '@/components/marketing/sezione-contenuti'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { messaggioCampo } from '@/lib/marketing/pannello'
import { campoContenutoSchema, type CampoContenutoInput, type CampoInCella } from '@/lib/validation/contenuto'

export type ValoreCampo<C extends CampoInCella> = ContenutoElenco[C]

/**
 * One property of a content, saved by itself (1.33.0): a table cell, a card
 * chip, a field of the panel or of the page. The new value shows at once
 * (useOptimistic) and stays while the action runs; if the action fails the
 * value of the server comes back by itself. The save goes only over the
 * value the field showed (`prima`): when somebody else changed it meanwhile,
 * nothing is written and the field shows what is saved. While a save is in
 * flight `inCorso` is true and a cell does not reopen its editor (spec R13),
 * so a second change always starts from the value shown.
 *
 * Never router.refresh() after it: the action's revalidatePath already
 * brought the page redrawn in its answer (spec A0.2).
 */
export function useCampoContenuto<C extends CampoInCella>({
  id,
  nome,
  campo,
  valore,
}: {
  id: string
  /** The content's Name, for the focus that follows a row out of the list. */
  nome: string
  campo: C
  /** The value as the server (or the panel's copy) has it now. */
  valore: ValoreCampo<C>
}) {
  const pannello = usePannello()
  const opzioniToast = useOpzioniToast()
  const uscita = useUscitaDallaLista()
  const { opzioni } = useOpzioni()
  const [mostrato, imposta] = useOptimistic<ValoreCampo<C>>(valore)
  const [inCorso, avvia] = useTransition()
  // while the save (and the redraw it brings) is in flight, the panel knows
  const inizioSalvataggio = pannello?.inizioSalvataggio
  useEffect(() => (inCorso && inizioSalvataggio ? inizioSalvataggio() : undefined), [inCorso, inizioSalvataggio])

  /**
   * Validates with the same Zod schema as the action; returns the error to
   * show under the field (nothing sent), or null (sent, or nothing changed).
   */
  function salva(bozza: unknown): string | null {
    const prima = mostrato
    const letto = campoContenutoSchema.safeParse({ id, campo, valore: bozza, prima })
    if (!letto.success) return letto.error.issues[0]?.message ?? 'Dati non validi.'
    const nuovo = letto.data.valore as ValoreCampo<C>
    if (nuovo === prima) return null
    // a value outside the filters takes the row out of the list: the focus will follow
    if (uscita?.esce(campo, nuovo)) uscita.ricorda(id, nome, { motivo: 'filtri', cella: campo })

    avvia(async () => {
      imposta(nuovo)
      let esito: EsitoCampo
      try {
        esito = await modificaCampoContenuto({ id, campo, valore: nuovo, prima } as CampoContenutoInput)
      } catch {
        uscita?.dimentica()
        toast.error('Connessione assente. Riprova.', opzioniToast)
        return
      }
      if (esito.ok) {
        pannello?.aggiornaCampo(id, campo, esito.valore, esito.versione)
        toast.success(messaggioCampo(campo, esito.valore, opzioni), opzioniToast)
        return
      }
      if (esito.cambiato) pannello?.aggiornaCampo(id, campo, esito.cambiato.valore, esito.cambiato.versione)
      else uscita?.dimentica()
      if (esito.sparito) pannello?.segnaSparito(id)
      toast.error(esito.errore, opzioniToast)
    })
    return null
  }

  return { mostrato, inCorso, salva }
}
