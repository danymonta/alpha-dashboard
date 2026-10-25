'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, EllipsisVertical, ListPlus, Pencil, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { eliminaLista, salvaLista, spostaLista } from '@/app/(app)/progetti/[id]/actions'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import type { ListaVista } from '@/components/pm/attivita/contesto'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ATTIVITA } from '@/lib/i18n/testi/attivita'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { listaSchema, type ListaInput } from '@/lib/validation/progetti'

function ModuloLista({
  progettoId,
  lista,
  chiudi,
}: {
  progettoId: string
  lista?: ListaVista
  chiudi: () => void
}) {
  const t = useTesti(ATTIVITA)
  const lingua = useLingua()
  const tradotto = (messaggio: string | undefined) => traduciErroreProgetti(messaggio, lingua)
  const { errore, salva } = useSalvataggio()
  const chiave = lista?.id ?? 'nuova'
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ListaInput>({
    resolver: zodResolver(listaSchema),
    defaultValues: {
      id: lista?.id ?? null,
      progetto_id: progettoId,
      nome: lista?.nome ?? '',
      descrizione: lista?.descrizione ?? '',
      data_inizio: lista?.data_inizio ?? '',
      data_fine: lista?.data_fine ?? '',
    },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => salvaLista(valori), lista ? t.listaSalvata : t.listaCreata)) chiudi()
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`l-nome-${chiave}`}>{t.nomeLista}</Label>
        <Input id={`l-nome-${chiave}`} className="h-11" placeholder={t.nomeListaSegnaposto} {...register('nome')} />
        <ErroreCampo id={`l-nome-errore-${chiave}`} messaggio={tradotto(errors.nome?.message)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`l-inizio-${chiave}`}>{t.inizio}</Label>
          <Input id={`l-inizio-${chiave}`} type="date" className="num h-11" {...register('data_inizio')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`l-fine-${chiave}`}>{t.fine}</Label>
          <Input id={`l-fine-${chiave}`} type="date" className="num h-11" {...register('data_fine')} />
        </div>
      </div>
      <ErroreCampo id={`l-date-errore-${chiave}`} messaggio={tradotto(errors.data_inizio?.message ?? errors.data_fine?.message)} />
      <div className="space-y-1.5">
        <Label htmlFor={`l-descrizione-${chiave}`}>{t.descrizione}</Label>
        <Textarea id={`l-descrizione-${chiave}`} rows={3} {...register('descrizione')} />
        <ErroreCampo id={`l-descrizione-errore-${chiave}`} messaggio={tradotto(errors.descrizione?.message)} />
      </div>
      <ErroreModulo testo={tradotto(errore ?? undefined) ?? null} />
      <BottoneSalva inCorso={isSubmitting}>{lista ? t.salvaLista : t.creaLista}</BottoneSalva>
    </form>
  )
}

export function NuovaLista({ progettoId }: { progettoId: string }) {
  const t = useTesti(ATTIVITA)
  const [aperto, setAperto] = useState(false)
  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={setAperto}
      trigger={<Button type="button" variant="outline" className="h-11" />}
      contenutoTrigger={
        <>
          <ListPlus className="size-4" aria-hidden="true" />
          {t.nuovaLista}
        </>
      }
      titolo={t.nuovaLista}
      descrizione={t.descrizioneLista}
    >
      <ModuloLista progettoId={progettoId} chiudi={() => setAperto(false)} />
    </FoglioModifica>
  )
}

/**
 * The ⋮ menu of a list, for who manages the project: edit, move, delete.
 * Deleting takes its tasks too, so it asks first and says how many.
 */
export function MenuLista({
  progettoId,
  lista,
  prima,
  ultima,
}: {
  progettoId: string
  lista: ListaVista
  prima: boolean
  ultima: boolean
}) {
  const t = useTesti(ATTIVITA)
  const lingua = useLingua()
  const [modifica, setModifica] = useState(false)
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()

  function sposta(direzione: 'su' | 'giu') {
    avvia(async () => {
      const esito = await spostaLista({ id: lista.id, direzione })
      if (esito.ok) toast.success(direzione === 'su' ? t.spostataSu : t.spostataGiu)
      else toast.error(traduciErroreProgetti(esito.errore, lingua))
    })
  }

  function elimina() {
    setConferma(false)
    avvia(async () => {
      const esito = await eliminaLista({ id: lista.id })
      if (esito.ok) toast.success(t.listaEliminata(lista.nome))
      else toast.error(traduciErroreProgetti(esito.errore, lingua))
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-muted-foreground"
              aria-label={t.azioniLista(lista.nome)}
              disabled={inCorso}
            />
          }
        >
          <EllipsisVertical className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48">
          <DropdownMenuItem className="min-h-11" onClick={() => setModifica(true)}>
            <Pencil aria-hidden="true" />
            {t.modificaLista}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" disabled={prima} onClick={() => sposta('su')}>
            <ArrowUp aria-hidden="true" />
            {t.spostaSu}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" disabled={ultima} onClick={() => sposta('giu')}>
            <ArrowDown aria-hidden="true" />
            {t.spostaGiu}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11" variant="destructive" onClick={() => setConferma(true)}>
            <Trash2 aria-hidden="true" />
            {t.eliminaLista}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={modifica} onOpenChange={setModifica}>
        <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t.modificaLista}</SheetTitle>
            <SheetDescription>{t.descrizioneLista}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <ModuloLista progettoId={progettoId} lista={lista} chiudi={() => setModifica(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t.eliminareLista(lista.nome)}</DialogTitle>
            <DialogDescription>
              {lista.task_totali === 0
                ? t.listaVuota
                : lista.task_totali === 1
                  ? t.unTask
                  : t.piuTask(lista.task_totali)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setConferma(false)}>
              {t.annulla}
            </Button>
            <Button type="button" variant="destructive" className="h-11" onClick={elimina}>
              {t.elimina}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
