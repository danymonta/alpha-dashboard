'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { eliminaProgetto, modificaProgetto } from '@/app/(app)/progetti/[id]/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import type { OpzioneCliente, OpzionePersona } from '@/components/pm/progetto/nuovo-progetto'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ETICHETTA_STATO_PROGETTO, type StatoProgetto } from '@/lib/progetti'
import { STATI_PROGETTO, modificaProgettoSchema, type ModificaProgettoInput } from '@/lib/validation/progetti'

const OPZIONI_STATO = STATI_PROGETTO.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_PROGETTO[s] }))

export type ProgettoModificabile = {
  id: string
  nome: string
  reparto_id: string
  descrizione: string | null
  stato: StatoProgetto
  data_inizio: string | null
  data_fine: string | null
  responsabile_id: string | null
  client_id: string | null
}

/**
 * "Modifica" in the project header, for who manages it. The client field is
 * there only for the app admin; deleting only for the PM admin, after a question.
 */
export function ModificaProgetto({
  progetto,
  reparti,
  membri,
  clienti,
  eliminabile,
}: {
  progetto: ProgettoModificabile
  /** Active departments, plus the current one even if deactivated. */
  reparti: readonly { id: string; nome: string }[]
  membri: readonly OpzionePersona[]
  clienti: readonly OpzioneCliente[] | null
  eliminabile: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const iniziali: ModificaProgettoInput = {
    id: progetto.id,
    nome: progetto.nome,
    reparto_id: progetto.reparto_id,
    descrizione: progetto.descrizione ?? '',
    stato: progetto.stato,
    data_inizio: progetto.data_inizio ?? '',
    data_fine: progetto.data_fine ?? '',
    responsabile_id: progetto.responsabile_id ?? '',
    // without the field the action leaves the client link as it is
    ...(clienti ? { client_id: progetto.client_id ?? '' } : {}),
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaProgettoInput>({ resolver: zodResolver(modificaProgettoSchema), defaultValues: iniziali })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaProgetto(valori), 'Progetto salvato')) setAperto(false)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (v) reset(iniziali)
        else setErrore(null)
      }}
      // below 640px an icon next to the title, from 640px the outlined "Modifica"
      trigger={
        <Button
          type="button"
          variant="ghost"
          aria-label="Modifica"
          className="size-11 shrink-0 text-muted-foreground sm:w-auto sm:border-input sm:bg-input/30 sm:px-2.5 sm:text-foreground sm:hover:bg-input/50"
        />
      }
      contenutoTrigger={
        <>
          <Pencil className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Modifica</span>
        </>
      }
      titolo="Modifica il progetto"
      descrizione="Nome, reparto, stato, date e responsabile. I task restano come sono."
    >
      <div className="space-y-6">
        <form onSubmit={invia} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mp-nome">Nome</Label>
            <Input id="mp-nome" className="h-11" {...register('nome')} />
            <ErroreCampo id="mp-nome-errore" messaggio={errors.nome?.message} />
          </div>

          <SceltaRapida legenda="Stato" opzioni={OPZIONI_STATO} registrazione={register('stato')} colonne={2} />

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="mp-inizio">Inizio</Label>
              <Input id="mp-inizio" type="date" className="num h-11" {...register('data_inizio')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mp-fine">Fine</Label>
              <Input id="mp-fine" type="date" className="num h-11" {...register('data_fine')} />
            </div>
          </div>
          <ErroreCampo id="mp-date-errore" messaggio={errors.data_inizio?.message ?? errors.data_fine?.message} />

          <div className="space-y-1.5">
            <Label htmlFor="mp-reparto">Reparto</Label>
            <select id="mp-reparto" className={CLASSE_SELECT} {...register('reparto_id')}>
              {reparti.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
            <ErroreCampo id="mp-reparto-errore" messaggio={errors.reparto_id?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mp-responsabile">Responsabile</Label>
            <select id="mp-responsabile" className={CLASSE_SELECT} {...register('responsabile_id')}>
              <option value="">Nessuno</option>
              {membri.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Uno dei membri del progetto.</p>
          </div>

          {clienti ? (
            <div className="space-y-1.5">
              <Label htmlFor="mp-cliente">Cliente</Label>
              <select id="mp-cliente" className={CLASSE_SELECT} {...register('client_id')}>
                <option value="">Nessun cliente</option>
                {clienti.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.etichetta}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Solo tu vedi il collegamento al cliente e ai suoi dati.</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="mp-descrizione">Descrizione</Label>
            <Textarea id="mp-descrizione" rows={3} {...register('descrizione')} />
            <ErroreCampo id="mp-descrizione-errore" messaggio={errors.descrizione?.message} />
          </div>

          <ErroreModulo testo={errore} />
          <BottoneSalva inCorso={isSubmitting}>Salva il progetto</BottoneSalva>
        </form>

        {eliminabile ? <EliminaProgetto id={progetto.id} nome={progetto.nome} /> : null}
      </div>
    </FoglioModifica>
  )
}

function EliminaProgetto({ id, nome }: { id: string; nome: string }) {
  const router = useRouter()
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()

  function elimina() {
    avvia(async () => {
      let esito
      try {
        esito = await eliminaProgetto({ id })
      } catch {
        toast.error('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        toast.error(esito.errore)
        return
      }
      setConferma(false)
      toast.success(`Progetto ${nome} eliminato`)
      router.push('/progetti')
    })
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">Un progetto chiuso si archivia. Eliminarlo cancella tutto il suo lavoro.</p>
      <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setConferma(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
        Elimina il progetto
      </Button>
      <Dialog open={conferma} onOpenChange={(v) => { if (!inCorso) setConferma(v) }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Eliminare {nome}?</DialogTitle>
            <DialogDescription>
              Se ne vanno liste, task, tempo registrato e note del progetto. Non si può annullare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setConferma(false)}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" className="h-11" disabled={inCorso} onClick={elimina}>
              {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
