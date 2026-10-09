/**
 * A fake PostgREST client for the code that takes the Supabase client as a
 * parameter (the content calendar's shared core and reads, MCP release):
 * every query records its steps, every awaited query or rpc takes the next
 * answer in line. Only the methods that code uses.
 */

export type Errore = { code?: string; message: string }
export type Risposta = { data?: unknown; error?: Errore | null; count?: number | null }

/** One step of a query: the method and its arguments, e.g. ['eq', 'id', '…']. */
export type Passo = [string, ...unknown[]]

const METODI = [
  'insert',
  'update',
  'delete',
  'select',
  'eq',
  'in',
  'is',
  'gte',
  'lte',
  'regexIMatch',
  'order',
  'limit',
] as const

export function supabaseFinto() {
  const risposte: Risposta[] = []
  /** one entry per from(): the table and its steps, in order */
  const query: { tabella: string; passi: Passo[] }[] = []
  const rpc: { nome: string; args: unknown }[] = []

  const prossima = () => {
    const r = risposte.shift() ?? {}
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null })
  }

  function costruttore(passi: Passo[]): Record<string, unknown> {
    const q: Record<string, unknown> = {}
    for (const metodo of METODI) {
      q[metodo] = (...args: unknown[]) => {
        passi.push([metodo, ...args])
        return q
      }
    }
    q.single = () => {
      passi.push(['single'])
      return prossima()
    }
    q.maybeSingle = () => {
      passi.push(['maybeSingle'])
      return prossima()
    }
    q.then = (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => prossima().then(ok, ko)
    return q
  }

  const client = {
    from(tabella: string) {
      const passi: Passo[] = []
      query.push({ tabella, passi })
      return costruttore(passi)
    },
    rpc(nome: string, args: unknown) {
      rpc.push({ nome, args })
      return prossima()
    },
  }

  return {
    client,
    query,
    rpc,
    risponde(...r: Risposta[]) {
      risposte.push(...r)
    },
    /** the steps of every query with this method, e.g. passi('insert') → [[{…}]] */
    passi(metodo: string): unknown[][] {
      return query.flatMap((q) => q.passi.filter(([m]) => m === metodo).map(([, ...args]) => args))
    },
    /** nothing reached the database */
    intatto() {
      return query.length === 0 && rpc.length === 0
    },
  }
}
