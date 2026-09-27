'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Pencil, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiornaCliente, eliminaCliente } from '@/app/(app)/clients/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
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
import { ETICHETTA_FONTE, FONTI } from '@/lib/validation/call'

type Voce = { id: string; nome: string }

export function ModificaCliente({
  cliente,
  setters,
  closers,
}: {
  cliente: ClienteInput
  setters: Voce[]
  closers: Voce[]
}) {
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
      fonte: cliente.fonte ?? null,
      setter_id: cliente.setter_id ?? '',
      closer_id: cliente.closer_id ?? '',
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
        Modifica
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Dati del cliente</SheetTitle>
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
            <Label htmlFor="c-fonte">Fonte</Label>
            <select id="c-fonte" className={CLASSE_SELECT} {...register('fonte', { setValueAs: (v) => v || null })}>
              <option value="">Non indicata</option>
              {FONTI.map((f) => (
                <option key={f} value={f}>
                  {ETICHETTA_FONTE[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-setter">Setter (owner)</Label>
              <select id="c-setter" className={CLASSE_SELECT} {...register('setter_id')}>
                <option value="">Nessuno</option>
                {setters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-closer">Closer</Label>
              <select id="c-closer" className={CLASSE_SELECT} {...register('closer_id')}>
                <option value="">Nessuno</option>
                {closers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            La provvigione segue il setter di ogni vendita: se cambi l’owner qui, correggi anche le vendite.
          </p>
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
          {cliente.id ? (
            <div className="border-t border-border pt-4">
              <Elimina
                etichetta="Elimina il cliente"
                cosa={`${cliente.nome} ${cliente.cognome ?? ''}`.trim()}
                fatto="Cliente eliminato"
                anteprima={{ tipo: 'cliente', id: cliente.id }}
                dopo="/clients"
                azione={() => eliminaCliente({ id: cliente.id })}
              />
            </div>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  )
}
