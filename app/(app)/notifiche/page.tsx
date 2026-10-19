import { Bell } from 'lucide-react'

import { EliminaNotifica } from '@/components/notifiche/elimina-notifica'
import { IconaTipo } from '@/components/notifiche/icona-tipo'
import { SegnaTutteLette } from '@/components/notifiche/segna-lette'
import { StatoEmail } from '@/components/notifiche/stato-email'
import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { LinkRiga } from '@/components/shell/link-riga'
import { percorsoIniziale } from '@/lib/auth/roles'
import { requireProfilo } from '@/lib/auth/session'
import { quandoNotifica } from '@/lib/notifiche/quando'
import { ETICHETTA_TIPO, eTipoNotifica } from '@/lib/notifiche/tipi'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/** The list shows the most recent this many; the rest are older than a few months of emails. */
const MASSIMO = 100

/**
 * The notification center (1.41.0, Dany 19/10/2026): every email the app sends
 * to the person is saved here too, whether or not it could leave. Every role
 * has the page (it is the bell's destination); only the recipient reads their
 * own rows, RLS decides (the admin reads nobody else's, CLAUDE.md section 17).
 * An error is the page's error.tsx ("Riprova"); loading.tsx is the skeleton.
 */
export default async function NotifichePage() {
  const profilo = await requireProfilo()
  const supabase = await createClient()
  const [{ data, error, count }, { count: daLeggere, error: erroreConteggio }] = await Promise.all([
    supabase
      .from('notifiche')
      .select('id, tipo, titolo, anteprima, canale, email_inviata, letta_il, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(MASSIMO),
    supabase.from('notifiche').select('id', { count: 'exact', head: true }).is('letta_il', null),
  ])
  if (error || erroreConteggio) throw new Error('notifiche: lettura non riuscita')

  const notifiche = data ?? []
  const nonLette = daLeggere ?? 0
  const admin = profilo.ruolo === 'admin'

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo="Notifiche"
        descrizione="Le email che l’app ti manda, salvate anche qui, e gli avvisi che compaiono solo qui: le ritrovi quando vuoi, anche se l’email non è partita."
        azione={notifiche.length > 0 ? <SegnaTutteLette daLeggere={nonLette} /> : undefined}
      />

      {notifiche.length === 0 ? (
        <StatoVuoto
          Icona={Bell}
          titolo="Nessuna notifica"
          descrizione={
            admin
              ? 'Qui compaiono il riepilogo della settimana, il backup, i promemoria dei clienti e gli avvisi (rate in ritardo, chiavi in scadenza, tracciamenti da approvare, spesa di Claude), appena ci sono.'
              : 'Per ora le notifiche arrivano solo all’admin. Se qualcosa dell’app ti riguarda, lo trovi qui.'
          }
          azione={<LinkBottone href={percorsoIniziale(profilo.ruolo)}>Torna al lavoro</LinkBottone>}
        />
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground" data-testid="notifiche-riga-conteggio">
            {nonLette > 0 ? `${nonLette} da leggere` : 'Hai letto tutto'}
          </p>
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card" data-testid="elenco-notifiche">
            {notifiche.map((n) => {
              const nuova = n.letta_il === null
              return (
                <li key={n.id} className="flex items-stretch" data-testid="notifica" data-letta={nuova ? 'no' : 'si'}>
                  <LinkRiga
                    href={`/notifiche/${n.id}`}
                    className="flex min-h-14 min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
                  >
                    <IconaTipo tipo={n.tipo} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className={cn('block text-sm break-words', nuova ? 'font-semibold' : 'font-medium')}>
                        {nuova ? <span className="sr-only">Da leggere: </span> : null}
                        {n.titolo}
                      </span>
                      {n.anteprima ? (
                        <span className="line-clamp-2 block text-sm break-words text-muted-foreground">{n.anteprima}</span>
                      ) : null}
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {nuova ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-foreground" data-testid="da-leggere">
                            <span aria-hidden="true" className="size-2 rounded-full bg-status-critical" />
                            Da leggere
                          </span>
                        ) : null}
                        <span>{eTipoNotifica(n.tipo) ? ETICHETTA_TIPO[n.tipo] : 'Notifica'}</span>
                        <span className="num">{quandoNotifica(n.created_at)}</span>
                        <StatoEmail inviata={n.email_inviata} canale={n.canale === 'app' ? 'app' : 'email'} />
                      </span>
                    </span>
                  </LinkRiga>
                  <div className="flex shrink-0 items-start py-1.5 pr-1">
                    <EliminaNotifica id={n.id} titolo={n.titolo} variante="icona" />
                  </div>
                </li>
              )
            })}
          </ul>
          {(count ?? 0) > MASSIMO ? (
            <p className="text-sm text-muted-foreground">Si vedono le {MASSIMO} più recenti.</p>
          ) : null}
        </>
      )}
    </div>
  )
}
