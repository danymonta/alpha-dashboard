'use client'

import { Copy, TriangleAlert } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  COLLEGA_CLAUDE,
  clientMancante,
  comandoClaudeCode,
  etichettaDialogo,
} from '@/lib/mcp/consenso'

export type ClientClaude = { clientId: string; nome: string }

type Props = {
  /** The MCP endpoint to paste in Claude: APP_URL + /mcp. */
  urlMcp: string
  /** The public client registered for the hosted apps (redirect https://claude.ai/api/mcp/auth_callback). */
  claude: ClientClaude | null
  /** The public client registered for Claude Code (loopback port 48721). */
  claudeCode: ClientClaude | null
  admin: boolean
}

/**
 * «Collega Claude» in Profilo › Account (admin, video editor, marketing;
 * 09/10/2026): the steps of Claude's «Add custom connector» dialog with the
 * address and the client ids to paste. Client ids are public identifiers, not
 * secrets. The English labels sit in brackets until the Italian ones are
 * checked against Claude's real interface (lib/mcp/consenso.ts).
 */
export function CollegaClaude({ urlMcp, claude, claudeCode, admin }: Props) {
  const idTitolo = useId()

  return (
    <section aria-labelledby={idTitolo} className="space-y-4 rounded-xl bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h2 id={idTitolo} className="font-heading text-base font-semibold">
          {COLLEGA_CLAUDE.titolo}
        </h2>
        <p className="text-sm text-muted-foreground">{COLLEGA_CLAUDE.descrizione}</p>
      </div>

      {!claude && !claudeCode ? (
        <Nota>{admin ? COLLEGA_CLAUDE.nonAttivoAdmin : COLLEGA_CLAUDE.nonAttivo}</Nota>
      ) : null}

      {claude ? <Passi urlMcp={urlMcp} clientId={claude.clientId} /> : null}
      {!claude && claudeCode ? <Nota>{admin ? clientMancante('claude') : COLLEGA_CLAUDE.mancaClaude}</Nota> : null}

      {claudeCode ? (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{COLLEGA_CLAUDE.claudeCode}</h3>
          <DaCopiare valore={comandoClaudeCode(claudeCode.clientId, urlMcp)} etichetta="Copia il comando per Claude Code" />
          <p className="text-sm text-muted-foreground">
            {COLLEGA_CLAUDE.claudeCodeDopo} <code className="rounded bg-muted px-1 text-foreground">/mcp</code> › alpha ›
            Authenticate.
          </p>
        </div>
      ) : null}
      {claude && !claudeCode && admin ? <Nota>{clientMancante('claude_code')}</Nota> : null}

      {claude || claudeCode ? <p className="text-sm text-muted-foreground">{COLLEGA_CLAUDE.privacy}</p> : null}
    </section>
  )
}

function Passi({ urlMcp, clientId }: { urlMcp: string; clientId: string }) {
  return (
    <ol className="space-y-4 text-sm">
      <Passo n={1}>
        In Claude, dal sito o dall’app per computer: <b>{etichettaDialogo('menu')}</b> ({COLLEGA_CLAUDE.indirizzoMenu}) ›{' '}
        <b>{etichettaDialogo('aggiungiConnettore')}</b>.
      </Passo>
      <Passo n={2}>
        <p>
          Nome: <b>{COLLEGA_CLAUDE.nome}</b>. URL, esattamente così:
        </p>
        <DaCopiare valore={urlMcp} etichetta="Copia l’indirizzo" />
      </Passo>
      <Passo n={3}>
        <p>
          Accesso: <b>{etichettaDialogo('accediOra')}</b>. Client OAuth: scegli <b>{etichettaDialogo('clientProprio')}</b>,
          non «{etichettaDialogo('identitaPubblicata')}» né «{etichettaDialogo('registrazioneAutomatica')}»: con Alpha
          Management non funzionano. Incolla l’ID client:
        </p>
        <DaCopiare valore={clientId} etichetta="Copia l’ID client" />
        <p>
          Lascia vuoto il segreto. Se il riquadro ha tutto in una schermata, l’ID client sta in{' '}
          <b>{etichettaDialogo('avanzate')}</b>.
        </p>
      </Passo>
      <Passo n={4}>
        Premi <b>{etichettaDialogo('aggiungi')}</b>, poi <b>{etichettaDialogo('connetti')}</b>: entri con Google e confermi qui.
        Se hai sbagliato il passo 3 non si corregge: rimuovi il connettore e aggiungilo di nuovo.
      </Passo>
      <Passo n={5}>{COLLEGA_CLAUDE.telefono}</Passo>
    </ol>
  )
}

function Passo({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </li>
  )
}

/** A value to paste in Claude: in full, wrapped, with a 44 px copy button. */
function DaCopiare({ valore, etichetta }: { valore: string; etichetta: string }) {
  const testo = useRef<HTMLElement>(null)

  async function copia() {
    try {
      await navigator.clipboard.writeText(valore)
      toast.success('Copiato')
    } catch {
      // no clipboard (permissions, an old browser): the text selected, ready for the system copy
      const el = testo.current
      const selezione = window.getSelection()
      if (el && selezione) selezione.selectAllChildren(el)
      toast('Testo selezionato: copialo dal menu del telefono o con Ctrl+C.')
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-1 pl-3">
      <code
        ref={testo}
        className="min-w-0 flex-1 py-2.5 font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]"
      >
        {valore}
      </code>
      <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={etichetta} onClick={copia}>
        <Copy className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-status-warning/10 px-3 py-2.5 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
      <span className="[overflow-wrap:anywhere]">{children}</span>
    </p>
  )
}
