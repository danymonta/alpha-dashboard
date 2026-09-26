import { ControlliMembro, InvitaMembro, RevocaInvito } from '@/app/(app)/settings/team/team-client'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { ETICHETTA_RUOLO } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { publicEnv } from '@/lib/env'
import { formatData } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const io = await requireRuolo(['admin'])
  const supabase = await createClient()

  const [{ data: membri, error }, { data: inviti, error: erroreInviti }] = await Promise.all([
    supabase.from('profiles').select('id, nome, email, ruolo, attivo').order('attivo', { ascending: false }).order('nome'),
    supabase
      .from('invites')
      .select('email, ruolo, created_at')
      .is('usato_at', null)
      .eq('revocato', false)
      .order('created_at', { ascending: false }),
  ])
  if (error || erroreInviti) throw new Error('Impossibile caricare il team')

  return (
    <div className="max-w-3xl space-y-6">
      <IntestazionePagina
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
        titolo="Team"
        descrizione="Accesso solo su invito. Chi è disattivato non entra più e non vede nessun dato."
        azione={<InvitaMembro urlLogin={`${publicEnv.appUrl.replace(/^https?:\/\//, '')}/login`} />}
      />

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Membri ({membri.length})
        </h2>
        <ul className="divide-y divide-border rounded-xl bg-card" data-testid="membri">
          {membri.map((m) => (
            <li key={m.id} aria-label={m.nome} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.nome}
                  {m.id === io.id ? <span className="font-normal text-muted-foreground"> · sei tu</span> : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">{m.email}</p>
              </div>
              <ControlliMembro
                profileId={m.id}
                nome={m.nome}
                ruolo={m.ruolo}
                attivo={m.attivo}
                sonoIo={m.id === io.id}
              />
            </li>
          ))}
        </ul>
        <p className="px-1 text-xs text-muted-foreground">
          Il tuo account non si disattiva e non perde il ruolo admin: lo impedisce il database.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Inviti in attesa ({inviti.length})
        </h2>
        {inviti.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Nessun invito in attesa. Chi riceve un invito compare tra i membri al primo accesso.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card" data-testid="inviti">
            {inviti.map((i) => (
              <li key={i.email} aria-label={i.email} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{i.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ETICHETTA_RUOLO[i.ruolo]} · invitato il {formatData(oggiRoma(new Date(i.created_at)))}
                  </p>
                </div>
                <RevocaInvito email={i.email} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
