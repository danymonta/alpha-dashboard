'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Pencil, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiornaCliente } from '@/app/(app)/clients/actions'
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
import { Textarea } from '@/components/ui/textarea'
import { clienteSchema, type ClienteInput } from '@/lib/validation/anagrafiche'

export function ModificaCliente({ cliente }: { cliente: ClienteInput }) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClienteInput>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      ...cliente,
      instagram_handle: cliente.instagram_handle?.replace(/^@/, '') ?? '',
    },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiornaCliente(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success('Cliente aggiornato')
    setAperto(false)
  })

  return (
    <Sheet
      open={aperto}
      onOpenChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset()
        }
      }}
    >
      <SheetTrigger render={<Button type="button" variant="outline" className="h-11" />}>
        <Pencil className="size-4" aria-hidden="true" />
        Modifica contatti
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Contatti del cliente</SheetTitle>
          <SheetDescription>Stato e valore non si modificano qui: vengono dalle vendite.</SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-nome">Nome</Label>
              <Input id="c-nome" className="h-11" aria-invalid={errors.nome ? true : undefined} {...register('nome')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-cognome">Cognome</Label>
              <Input id="c-cognome" className="h-11" {...register('cognome')} />
            </div>
          </div>
          <ErroreCampo id="c-nome-errore" messaggio={errors.nome?.message} />
          <div className="space-y-1.5">
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" inputMode="email" className="h-11" {...register('email')} />
            <ErroreCampo id="c-email-errore" messaggio={errors.email?.message} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-telefono">Telefono</Label>
              <Input id="c-telefono" type="tel" inputMode="tel" className="h-11" {...register('telefono')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-ig">Instagram</Label>
              <Input id="c-ig" autoCapitalize="none" className="h-11" {...register('instagram_handle')} />
            </div>
          </div>
          <ErroreCampo id="c-contatti-errore" messaggio={errors.telefono?.message ?? errors.instagram_handle?.message} />
          <div className="space-y-1.5">
            <Label htmlFor="c-note">Note</Label>
            <Textarea id="c-note" rows={3} {...register('note')} />
          </div>
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
