'use client'

import { ExternalLink, Pencil, Send } from 'lucide-react'
import { useId, useState } from 'react'

import { salvaTelegram } from '@/app/(app)/onboarding/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import { telegramClienteSchema } from '@/lib/validation/onboarding'

const CLASSE_LINK =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/**
 * The client on Telegram: his username and the link of his private group (the team makes
 * it and adds him: the ready message goes there). Its own table, clienti_telegram, away
 * from the contacts the closer and the setter read.
 */
export function TelegramScheda({
  clientId,
  username,
  gruppo,
}: {
  clientId: string
  username: string | null
  gruppo: string | null
}) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua].telegram
  const [aperto, setAperto] = useState(false)
  const [valori, setValori] = useState({ username: username ?? '', gruppo: gruppo ?? '' })
  const [errori, setErrori] = useState<{ username?: string; gruppo_privato_url?: string }>({})
  const [inCorso, setInCorso] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()

  async function invia(e: React.FormEvent) {
    e.preventDefault()
    const input = { client_id: clientId, username: valori.username, gruppo_privato_url: valori.gruppo }
    const valido = telegramClienteSchema.safeParse(input)
    if (!valido.success) {
      const trovati: typeof errori = {}
      for (const issue of valido.error.issues) {
        const campo = issue.path[0]
        if (campo === 'username' || campo === 'gruppo_privato_url') trovati[campo] ??= issue.message
      }
      setErrori(trovati)
      return
    }
    setErrori({})
    setInCorso(true)
    const ok = await salva(() => salvaTelegram(input), t.salvato)
    setInCorso(false)
    if (ok) setAperto(false)
  }

  return (
    <section aria-labelledby={`${id}-titolo`} className="rounded-xl bg-card p-3" data-testid="riquadro-telegram">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 id={`${id}-titolo`} className="flex items-center gap-1.5 text-sm font-medium">
          <Send className="size-4 text-muted-foreground" aria-hidden="true" />
          {t.titolo}
        </h2>
        <FoglioModifica
          aperto={aperto}
          onApertoChange={(v) => {
            setAperto(v)
            if (v) {
              setValori({ username: username ?? '', gruppo: gruppo ?? '' })
              setErrori({})
            }
            setErrore(null)
          }}
          trigger={<Button type="button" variant="ghost" className="-mr-1.5 h-11 px-2.5" data-testid="modifica-telegram" />}
          contenutoTrigger={
            <>
              <Pencil className="size-4" aria-hidden="true" />
              {ONBOARDING[lingua].modifica}
            </>
          }
          titolo={t.modifica}
        >
          <form onSubmit={invia} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-username`}>{t.username}</Label>
              <Input
                id={`${id}-username`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                className="h-11"
                value={valori.username}
                onChange={(e) => {
                  setValori((prima) => ({ ...prima, username: e.target.value }))
                  setErrori((prima) => ({ ...prima, username: undefined }))
                }}
                aria-invalid={errori.username ? true : undefined}
                aria-describedby={errori.username ? `${id}-username-errore` : `${id}-username-aiuto`}
              />
              <ErroreCampo id={`${id}-username-errore`} messaggio={traduciErroreOnboarding(errori.username, lingua)} />
              <p id={`${id}-username-aiuto`} className="text-xs text-muted-foreground">
                {t.usernameAiuto}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-gruppo`}>{t.gruppo}</Label>
              <Input
                id={`${id}-gruppo`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                className="h-11"
                value={valori.gruppo}
                onChange={(e) => {
                  setValori((prima) => ({ ...prima, gruppo: e.target.value }))
                  setErrori((prima) => ({ ...prima, gruppo_privato_url: undefined }))
                }}
                aria-invalid={errori.gruppo_privato_url ? true : undefined}
                aria-describedby={errori.gruppo_privato_url ? `${id}-gruppo-errore` : `${id}-gruppo-aiuto`}
              />
              <ErroreCampo id={`${id}-gruppo-errore`} messaggio={traduciErroreOnboarding(errori.gruppo_privato_url, lingua)} />
              <p id={`${id}-gruppo-aiuto`} className="text-xs text-muted-foreground">
                {t.gruppoAiuto}
              </p>
            </div>
            <ErroreModulo testo={errore ? traduciErroreOnboarding(errore, lingua) : null} />
            <BottoneSalva inCorso={inCorso} />
          </form>
        </FoglioModifica>
      </div>
      <dl className="divide-y divide-border">
        <div className="flex min-h-11 items-center justify-between gap-3 py-1">
          <dt className="shrink-0 text-sm text-muted-foreground">{t.username}</dt>
          <dd className="min-w-0 text-right text-sm">
            {username ? (
              <a href={`https://t.me/${username}`} target="_blank" rel="noopener noreferrer" className={CLASSE_LINK} aria-label={`@${username}: ${t.apriChat}`}>
                <span className="truncate">@{username}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            ) : (
              <span className="text-muted-foreground">{t.nonIndicato}</span>
            )}
          </dd>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 py-1">
          <dt className="shrink-0 text-sm text-muted-foreground">{t.gruppo}</dt>
          <dd className="min-w-0 text-right text-sm">
            {gruppo ? (
              <a href={gruppo} target="_blank" rel="noopener noreferrer" className={CLASSE_LINK}>
                {t.apriGruppo}
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            ) : (
              <span className="text-muted-foreground">{t.nonIndicato}</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}
