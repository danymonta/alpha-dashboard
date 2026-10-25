'use client'

import { Link2, LoaderCircle, Receipt, RotateCw, TriangleAlert, UserCheck } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { collegaVendita, venditeDaCollegare, type VenditaDaCollegare } from '@/app/(app)/calls/actions'
import { useFocusSullaCall } from '@/components/call/focus-sulla-call'
import { LinkBottone } from '@/components/link-bottone'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useLingua } from '@/components/i18n/lingua-provider'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { COLLEGA_VENDITA, VENDITA_TESTI, dettaglioVenditaIn } from '@/lib/i18n/testi/esito'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'

type Stato =
  | { nome: 'carica' }
  | { nome: 'errore'; messaggio: string }
  | { nome: 'pronto'; vendite: VenditaDaCollegare[] }

/** «Nuovo cliente del 07/10/2026, 1.500,00 €»: in the button's name, so two sales of one client stay apart. */
function dettaglio(v: Pick<VenditaDaCollegare, 'tipo' | 'data_vendita' | 'valore_contratto'>, lingua: Lingua): string {
  const { formatData, formatEuro } = formato(lingua)
  return dettaglioVenditaIn(ETICHETTE[lingua].tipoVendita[v.tipo], formatData(v.data_vendita), formatEuro(v.valore_contratto), lingua)
}

type Props = {
  callId: string
  /** The card's title (h3, tabIndex -1): the focus goes there when this button goes. */
  idTitolo: string
  nomeLead: string
  /** «Registra la vendita» of the card: the empty sheet offers it too. */
  hrefVendita: string
}

/**
 * «La vendita c’è già: collegala» (07/10/2026): on a closed call that asks for
 * its sale, the admin ties a sale registered without the call (Vendite, Alfire)
 * to it, so «Registra la vendita» never makes a second client and a second sale
 * for the same money. The candidates and the tie come from the database
 * (vendite_da_collegare, collega_vendita_call); only sales.call_id changes.
 */
export function CollegaVendita({ callId, idTitolo, nomeLead, hrefVendita }: Props) {
  const [aperto, setAperto] = useState(false)
  const [stato, setStato] = useState<Stato>({ nome: 'carica' })
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<string | null>(null)
  const [, avvia] = useTransition()
  const riuscito = useFocusSullaCall(idTitolo)
  const lingua = useLingua()
  const VENDITA_DA_REGISTRARE = VENDITA_TESTI[lingua]
  const t = COLLEGA_VENDITA[lingua]
  const { formatData, formatEuro } = formato(lingua)
  const ETICHETTA_TIPO_VENDITA = ETICHETTE[lingua].tipoVendita

  function carica() {
    setStato({ nome: 'carica' })
    avvia(async () => {
      let esito
      try {
        esito = await venditeDaCollegare({ call_id: callId })
      } catch {
        setStato({ nome: 'errore', messaggio: 'Connessione assente. Riprova.' })
        return
      }
      setStato(esito.ok ? { nome: 'pronto', vendite: esito.vendite } : { nome: 'errore', messaggio: esito.errore })
    })
  }

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    setErrore(null)
    setInCorso(null)
    // every opening reads the sales again: one may have been tied meanwhile
    if (valore) carica()
  }

  function collega(vendita: VenditaDaCollegare) {
    setErrore(null)
    setInCorso(vendita.sale_id)
    avvia(async () => {
      let esito
      try {
        esito = await collegaVendita({ call_id: callId, sale_id: vendita.sale_id })
      } catch {
        setErrore('Connessione assente. Riprova.')
        setInCorso(null)
        return
      }
      setInCorso(null)
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(VENDITA_DA_REGISTRARE.collegata(nomeLead), {
        description: `${vendita.cliente} · ${formatData(vendita.data_vendita)} · ${formatEuro(vendita.valore_contratto)}`,
      })
      setAperto(false)
      // the card no longer asks: this button goes, the focus goes to the card's title
      riuscito()
    })
  }

  return (
    <Sheet open={aperto} onOpenChange={apriChiudi}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={VENDITA_DA_REGISTRARE.nomeCollega(nomeLead)}
            className="h-11 shrink-0 gap-1.5 px-3"
            data-testid="collega-vendita"
          />
        }
      >
        <Link2 className="size-4" aria-hidden="true" />
        {VENDITA_DA_REGISTRARE.collega}
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle>{VENDITA_DA_REGISTRARE.titoloCollega(nomeLead)}</SheetTitle>
          <SheetDescription>{VENDITA_DA_REGISTRARE.descrizioneCollega}</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4" aria-busy={stato.nome === 'carica'}>
          {stato.nome === 'carica' ? (
            <div className="space-y-2" data-testid="collega-vendita-carica">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : stato.nome === 'errore' ? (
            <div className="space-y-2">
              <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {traduciErrore(stato.messaggio, lingua)}
              </p>
              <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={carica}>
                <RotateCw className="size-4" aria-hidden="true" />
                {t.riprova}
              </Button>
            </div>
          ) : stato.vendite.length === 0 ? (
            <div
              className="space-y-3 rounded-xl border border-dashed border-border px-3 py-4"
              data-testid="collega-vendita-vuoto"
            >
              <p className="text-sm text-muted-foreground">{VENDITA_DA_REGISTRARE.nessuna}</p>
              <LinkBottone
                href={hrefVendita}
                className="gap-1.5 px-3"
                aria-label={VENDITA_DA_REGISTRARE.nomeBottone(nomeLead)}
              >
                <Receipt className="size-4" aria-hidden="true" />
                {VENDITA_DA_REGISTRARE.bottone}
              </LinkBottone>
            </div>
          ) : (
            <ul className="space-y-2" data-testid="collega-vendita-elenco">
              {stato.vendite.map((v) => (
                <li key={v.sale_id} className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.cliente}</p>
                    <p className="text-sm text-muted-foreground">
                      {ETICHETTA_TIPO_VENDITA[v.tipo]} · {formatData(v.data_vendita)} ·{' '}
                      <span className="num">{formatEuro(v.valore_contratto)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{v.setter ? t.setter(v.setter) : t.senzaSetter}</p>
                    {v.stesso_cliente ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <UserCheck className="size-3.5 shrink-0" aria-hidden="true" />
                        {VENDITA_DA_REGISTRARE.stessoCliente}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    className="h-11 shrink-0 px-3"
                    aria-label={VENDITA_DA_REGISTRARE.nomeBottoneCollega(v.cliente, dettaglio(v, lingua))}
                    disabled={inCorso !== null}
                    onClick={() => collega(v)}
                  >
                    {inCorso === v.sale_id ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Link2 className="size-4" aria-hidden="true" />
                    )}
                    {VENDITA_DA_REGISTRARE.bottoneCollega}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {traduciErrore(errore, lingua)}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
