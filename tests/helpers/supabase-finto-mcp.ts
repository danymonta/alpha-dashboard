/**
 * A fake Supabase client for the MCP tests (the pattern of tests/alfire.test.ts):
 * every query is recorded step by step (from/rpc, then select, eq, in, order,
 * limit…), and when it is awaited the test's own `rispondi` decides the answer
 * from what the query did. The answer never depends on the order of the calls,
 * so the tests do not care how the shared core builds its queries.
 */

export type Passo = [metodo: string, ...argomenti: unknown[]]

export type Chiamata = {
  tipo: 'from' | 'rpc'
  /** the table or the function */
  nome: string
  passi: Passo[]
}

export type RispostaFinta = {
  data?: unknown
  error?: { code?: string; message: string } | null
  count?: number | null
  status?: number
}

/** True when the query went through this step (and, if given, with these first arguments). */
export function ha(c: Chiamata, metodo: string, ...argomenti: unknown[]): boolean {
  return c.passi.some(
    ([m, ...args]) => m === metodo && argomenti.every((a, i) => JSON.stringify(args[i]) === JSON.stringify(a)),
  )
}

/** The arguments of the first step with this name. */
export function argomenti(c: Chiamata, metodo: string): unknown[] | undefined {
  return c.passi.find(([m]) => m === metodo)?.slice(1)
}

export function supabaseFinto(rispondi: (c: Chiamata) => RispostaFinta | Promise<RispostaFinta>) {
  const chiamate: Chiamata[] = []

  async function risposta(c: Chiamata) {
    const r = await rispondi(c)
    return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null, status: r.status ?? (r.error ? 400 : 200) }
  }

  function query(c: Chiamata): unknown {
    const q: unknown = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => risposta(c).then(ok, ko)
          }
          if (typeof prop !== 'string') return undefined
          return (...args: unknown[]) => {
            c.passi.push([prop, ...args])
            return prop === 'single' || prop === 'maybeSingle' ? risposta(c) : q
          }
        },
      },
    )
    return q
  }

  const client = {
    from(nome: string) {
      const c: Chiamata = { tipo: 'from', nome, passi: [] }
      chiamate.push(c)
      return query(c)
    },
    rpc(nome: string, args?: unknown) {
      const c: Chiamata = { tipo: 'rpc', nome, passi: [['args', args]] }
      chiamate.push(c)
      return query(c)
    },
  }

  return { client, chiamate }
}
