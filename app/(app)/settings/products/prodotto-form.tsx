'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { cambiaAttivoProdotto, salvaProdotto } from '@/app/(app)/settings/products/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { formatImportoInput } from '@/lib/format'
import { prodottoSchema, type ProdottoInput } from '@/lib/validation/anagrafiche'

type Prodotto = { id: string; nome: string; durata_mesi: number; prezzo_listino: number; attivo: boolean }

export function ProdottoForm({ prodotto }: { prodotto?: Prodotto }) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProdottoInput>({
    resolver: zodResolver(prodottoSchema),
    defaultValues: prodotto
      ? { ...prodotto, prezzo_listino: formatImportoInput(prodotto.prezzo_listino) }
      : { nome: '', durata_mesi: 3, prezzo_listino: '', attivo: true },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await salvaProdotto(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(prodotto ? 'Prodotto aggiornato' : 'Prodotto creato')
    setAperto(false)
    if (!prodotto) reset()
  })

  return (
    <Sheet open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setErrore(null) }}>
      <SheetTrigger
        render={
          prodotto ? (
            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Modifica ${prodotto.nome}`} />
          ) : (
            <Button type="button" className="h-11" />
          )
        }
      >
        {prodotto ? <Pencil className="size-4" aria-hidden="true" /> : (<><Plus className="size-4" aria-hidden="true" />Nuovo prodotto</>)}
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{prodotto ? prodotto.nome : 'Nuovo prodotto'}</SheetTitle>
          <SheetDescription>Il prezzo di listino precompila il valore nelle nuove vendite.</SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="p-nome">Nome</Label>
            <Input id="p-nome" className="h-11" placeholder="Percorso Alpha 3 mesi" {...register('nome')} />
            <ErroreCampo id="p-nome-errore" messaggio={errors.nome?.message} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-durata">Durata (mesi)</Label>
              <Input id="p-durata" inputMode="numeric" className="num h-11" {...register('durata_mesi')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-prezzo">Prezzo di listino</Label>
              <Input id="p-prezzo" inputMode="decimal" className="num h-11 text-right" placeholder="0,00" {...register('prezzo_listino')} />
            </div>
          </div>
          <ErroreCampo id="p-errore" messaggio={errors.durata_mesi?.message ?? errors.prezzo_listino?.message} />
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Salva
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function AttivoProdotto({ id, nome, attivo }: { id: string; nome: string; attivo: boolean }) {
  const [inCorso, avvia] = useTransition()
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Switch
        checked={attivo}
        disabled={inCorso}
        aria-label={`${nome} in vendita`}
        onCheckedChange={(valore) =>
          avvia(async () => {
            const esito = await cambiaAttivoProdotto({ id, attivo: valore })
            if (esito.ok) toast.success(valore ? `${nome} di nuovo in vendita` : `${nome} fuori vendita`)
            else toast.error(esito.errore)
          })
        }
      />
      {attivo ? 'In vendita' : 'Fuori vendita'}
    </label>
  )
}
