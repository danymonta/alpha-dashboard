import { Bell } from 'lucide-react'
import { z } from 'zod'

import { EliminaNotifica } from '@/components/notifiche/elimina-notifica'
import { SegnaLettaAllApertura } from '@/components/notifiche/segna-lette'
import { StatoEmail } from '@/components/notifiche/stato-email'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireProfilo } from '@/lib/auth/session'
import { publicEnv } from '@/lib/env'
import { documentoSicuro } from '@/lib/notifiche/documento'
import { quandoNotifica } from '@/lib/notifiche/quando'
import { ETICHETTA_TIPO, eTipoNotifica, etichettaLink, linkInterno } from '@/lib/notifiche/tipi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * One notification, as the email was (1.41.0): the HTML our own code generated
 * inside a sandboxed iframe (srcdoc). Never scripts: the sandbox has no
 * allow-scripts and no allow-same-origin, so the email runs in an opaque
 * origin; allow-popups(-to-escape-sandbox) only so that its links open in a
 * new tab (the document says <base target="_blank">), and a policy inside the
 * document keeps every remote resource out but our own logo (documentoSicuro).
 * Opening it marks it read (SegnaLettaAllApertura, once).
 */
export default async function NotificaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfilo()
  const { id } = await params
  const supabase = await createClient()
  const valido = z.string().uuid().safeParse(id).success
  const { data: n, error } = valido
    ? await supabase
        .from('notifiche')
        .select('id, tipo, titolo, anteprima, corpo_html, link, email_inviata, letta_il, created_at')
        .eq('id', id)
        .maybeSingle()
    : { data: null, error: null }
  if (error) throw new Error('notifica: lettura non riuscita')

  if (!n) {
    return (
      <div className="max-w-3xl">
        <IntestazionePagina titolo="Notifica" indietro={{ href: '/notifiche', etichetta: 'Notifiche' }} />
        <StatoVuoto
          Icona={Bell}
          titolo="Questa notifica non c’è più"
          descrizione="L’hai eliminata, o non è una tua notifica."
          azione={<LinkBottone href="/notifiche">Torna alle notifiche</LinkBottone>}
        />
      </div>
    )
  }

  const link = linkInterno(n.link)
  const etichetta = etichettaLink(link)

  return (
    <div className="max-w-3xl space-y-5">
      <SegnaLettaAllApertura id={n.id} giaLetta={n.letta_il !== null} />
      <IntestazionePagina
        titolo={n.titolo}
        indietro={{ href: '/notifiche', etichetta: 'Notifiche' }}
        descrizione={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{eTipoNotifica(n.tipo) ? ETICHETTA_TIPO[n.tipo] : 'Notifica'}</span>
            <span className="num">{quandoNotifica(n.created_at)}</span>
            <StatoEmail inviata={n.email_inviata} />
          </span>
        }
      />

      {!n.email_inviata ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          L’email non è partita (il servizio di invio non è configurato o non ha risposto): questa è la copia salvata
          nell’app.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {link && etichetta ? <LinkBottone href={link}>{etichetta}</LinkBottone> : null}
      </div>

      <iframe
        title={`Email: ${n.titolo}`}
        data-testid="corpo-notifica"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={documentoSicuro(n.corpo_html, publicEnv.appUrl)}
        referrerPolicy="no-referrer"
        className="h-[30rem] w-full rounded-xl border border-border bg-white md:h-[36rem]"
      />

      <EliminaNotifica id={n.id} titolo={n.titolo} variante="foglio" dopo="/notifiche" />
    </div>
  )
}
