import { createElement, isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: 'http://127.0.0.1:1', supabasePublishableKey: 'chiave-finta', appUrl: 'http://localhost:3000' },
}))
// the brand mark draws embers on a canvas: nothing to check here
vi.mock('@/components/brand/logo-fuoco', () => ({ LogoFuoco: () => null }))

/** What Next's redirect() throws: the test sees where the browser would go. */
class Redirezione extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT')
  }
}
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Redirezione(url)
  }),
  RedirectType: { push: 'push', replace: 'replace' },
  useRouter: () => ({ refresh: vi.fn() }),
}))

type Errore = { name?: string; status?: number; code?: string; message?: string }
type Esito<T> = { data: T | null; error: Errore | null }

/** The cookie session's Supabase client: every call recorded, each answer set by the test. */
const sb = vi.hoisted(() => {
  const stato = {
    chiamate: [] as string[],
    puo: { data: true, error: null } as { data: unknown; error: unknown },
    dettagli: { data: null, error: null } as { data: unknown; error: unknown },
    approva: { data: null, error: null } as { data: unknown; error: unknown },
    nega: { data: null, error: null } as { data: unknown; error: unknown },
    revoca: { data: {}, error: null } as { data: unknown; error: unknown },
    grants: { data: [], error: null } as { data: unknown; error: unknown },
    clientMcp: { data: [], error: null } as { data: unknown; error: unknown },
    argomenti: [] as unknown[][],
  }
  const client = {
    rpc: async (nome: string) => {
      stato.chiamate.push(`rpc:${nome}`)
      return nome === 'mcp_client' ? stato.clientMcp : stato.puo
    },
    auth: {
      oauth: {
        getAuthorizationDetails: async (...a: unknown[]) => {
          stato.chiamate.push('dettagli')
          stato.argomenti.push(a)
          return stato.dettagli
        },
        approveAuthorization: async (...a: unknown[]) => {
          stato.chiamate.push('approva')
          stato.argomenti.push(a)
          return stato.approva
        },
        denyAuthorization: async (...a: unknown[]) => {
          stato.chiamate.push('nega')
          stato.argomenti.push(a)
          return stato.nega
        },
        revokeGrant: async (...a: unknown[]) => {
          stato.chiamate.push('revoca')
          stato.argomenti.push(a)
          return stato.revoca
        },
        listGrants: async () => {
          stato.chiamate.push('grants')
          return stato.grants
        },
      },
    },
  }
  return { stato, client }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => sb.client) }))

const sessione = vi.hoisted(() => ({
  profilo: { id: 'p1', nome: 'Giulia Marketing', ruolo: 'marketing', livello_pm: 'employee', attivo: true } as Record<string, unknown> | null,
}))
vi.mock('@/lib/auth/session', () => ({ getProfilo: vi.fn(async () => sessione.profilo) }))

import { scollegaApp } from '@/app/(app)/account/actions'
import { decidiCollegamento } from '@/app/oauth/consent/actions'
import ConsensoPage from '@/app/oauth/consent/page'
import { AppCollegate } from '@/components/account/app-collegate'
import { CollegaClaude } from '@/components/account/collega-claude'
import { ElencoAppCollegate, ErroreSezioneAccount } from '@/components/account/elenco-app-collegate'
import { SezioneCollegaClaude } from '@/components/account/sezione-collega-claude'
import {
  SchedaConsenso,
  SchedaMessaggio,
  SchedaNonAmmesso,
  SchedaNonDaClaude,
  SchedaRicollega,
} from '@/components/oauth/scheda-consenso'
import {
  APP_COLLEGATE,
  COLLEGA_CLAUDE,
  CONSENSO,
  MESSAGGI_AUTORIZZAZIONE,
  avvisoPhishing,
  azioniConsenso,
  clientMancante,
  comandoClaudeCode,
  destinazioneClaude,
  erroreVersoClaude,
  leggiDestinazione,
  maiVistoPer,
  tipoErroreAutorizzazione,
} from '@/lib/mcp/consenso'
import { NON_VALIDA, consensoSchema, scollegaAppSchema } from '@/lib/validation/mcp'

const ID = 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE' // what GoTrue generates: 32 letters and digits
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const CON_CODICE = `${CALLBACK}?code=7d0b8c9e-1111-4222-8333-944455556666&state=stato-di-claude`
const NEGATA = `${CALLBACK}?error=access_denied&error_description=User+denied+the+request&state=stato-di-claude`
const CLIENT = '0b7a5b8e-3c1d-4e2f-9a6b-7c8d9e0f1a2b'

const DETTAGLI = {
  authorization_id: ID,
  redirect_uri: CALLBACK,
  client: { id: CLIENT, name: 'Claude', uri: '', logo_uri: '' },
  user: { id: 'p1', email: 'giulia@example.com' },
  scope: 'email',
}

function modulo(campi: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(campi)) f.set(k, v)
  return f
}

/** The URL the action sent the browser to, or its answer when it stayed. */
async function tocca(campi: Record<string, string>): Promise<{ verso: string } | { esito: unknown }> {
  try {
    return { esito: await decidiCollegamento(null, modulo(campi)) }
  } catch (e) {
    if (e instanceof Redirezione) return { verso: e.url }
    throw e
  }
}

const errore = (e: Errore) => ({ data: null, error: e }) satisfies Esito<never>

beforeEach(() => {
  sb.stato.chiamate.length = 0
  sb.stato.argomenti.length = 0
  sb.stato.puo = { data: true, error: null }
  sb.stato.dettagli = { data: DETTAGLI, error: null }
  sb.stato.approva = { data: { redirect_url: CON_CODICE }, error: null }
  sb.stato.nega = { data: { redirect_url: NEGATA }, error: null }
  sb.stato.revoca = { data: {}, error: null }
  sb.stato.grants = { data: [], error: null }
  sb.stato.clientMcp = { data: [], error: null }
  sessione.profilo = { id: 'p1', nome: 'Giulia Marketing', ruolo: 'marketing', livello_pm: 'employee', attivo: true }
})

describe('dove la pagina di consenso può mandare il browser', () => {
  it.each([
    CALLBACK,
    CON_CODICE,
    'https://claude.com/api/mcp/auth_callback?code=x&state=y',
    'https://CLAUDE.AI/api/mcp/auth_callback',
    'http://localhost:48721/callback?code=x&state=y',
    'http://127.0.0.1:48721/callback',
    'http://localhost:51234/callback',
  ])('accetta %s', (url) => {
    expect(destinazioneClaude(url)).toBe(true)
  })

  const idn = new URL('https://claudе.ai/').hostname // Cyrillic "е": xn--…
  it.each([
    ['un sottodominio di un altro', 'https://claude.ai.evil.com/api/mcp/auth_callback'],
    ['userinfo', 'https://claude.ai@evil.com/api/mcp/auth_callback'],
    ['userinfo con password', 'https://user:pw@claude.ai/api/mcp/auth_callback'],
    ['claude.ai nella query', 'https://evil.com/?claude.ai'],
    ['il callback nella query', `https://evil.com/api/mcp/auth_callback?x=${CALLBACK}`],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['senza protocollo', '//claude.ai/api/mcp/auth_callback'],
    ['http su claude.ai', 'http://claude.ai/api/mcp/auth_callback'],
    ['un’altra porta', 'https://claude.ai:444/api/mcp/auth_callback'],
    ['un altro percorso', 'https://claude.ai/api/mcp/auth_callback/altro'],
    ['un percorso vicino', 'https://claude.ai/api/mcp/auth_callbacks'],
    ['un sosia IDN', 'https://claudе.ai/api/mcp/auth_callback'],
    ['un sosia IDN già convertito', `https://${idn}/api/mcp/auth_callback`],
    ['il punto finale', 'https://claude.ai./api/mcp/auth_callback'],
    ['uno spazio in fondo', `${CALLBACK} `],
    ['una tabulazione in testa', `\t${CALLBACK}`],
    ['un a capo nel percorso', 'https://claude.ai/api/mcp/auth_\ncallback'],
    ['una barra rovesciata', 'https://claude.ai\\@evil.com/api/mcp/auth_callback'],
    ['un frammento', `${CALLBACK}#x`],
    ['https sul computer', 'https://localhost:48721/callback'],
    ['un host che inizia come localhost', 'http://localhost.evil.com/callback'],
    ['un host che inizia come 127.0.0.1', 'http://127.0.0.1.nip.io/callback'],
    ['un altro percorso sul computer', 'http://127.0.0.1:48721/altro'],
    ['vuoto', ''],
  ])('rifiuta %s', (_, url) => {
    expect(destinazioneClaude(url)).toBe(false)
  })

  it('rifiuta null e undefined, e dice l’host vero di quelli buoni', () => {
    expect(destinazioneClaude(null)).toBe(false)
    expect(destinazioneClaude(undefined)).toBe(false)
    expect(leggiDestinazione(CON_CODICE)).toMatchObject({ tipo: 'claude', host: 'claude.ai' })
    expect(leggiDestinazione('http://127.0.0.1:48721/callback')).toMatchObject({ tipo: 'claude_code', host: '127.0.0.1' })
  })
})

describe('il rifiuto verso Claude senza il codice', () => {
  it('toglie code, tiene state e il callback, mette access_denied', () => {
    const url = new URL(erroreVersoClaude(CON_CODICE) ?? '')
    expect(`${url.origin}${url.pathname}`).toBe(CALLBACK)
    expect(url.searchParams.has('code')).toBe(false)
    expect(url.searchParams.get('state')).toBe('stato-di-claude')
    expect(url.searchParams.get('error')).toBe('access_denied')
    expect(url.searchParams.get('error_description')).toBe('User denied the request')
  })

  it('lascia lo state com’era, codifica compresa, e vale anche per Claude Code', () => {
    const url = erroreVersoClaude('http://127.0.0.1:48721/callback?code=abc&state=a%2Fb%20c%3D') ?? ''
    expect(url).toContain('state=a%2Fb%20c%3D')
    expect(url).not.toContain('code=')
    expect(url.startsWith('http://127.0.0.1:48721/callback?')).toBe(true)
  })

  it('un errore già presente non si ripete', () => {
    const url = new URL(erroreVersoClaude(`${CALLBACK}?error=server_error&state=s`) ?? '')
    expect(url.searchParams.getAll('error')).toEqual(['access_denied'])
  })

  it('null per un indirizzo che non è di Claude', () => {
    expect(erroreVersoClaude('https://evil.com/api/mcp/auth_callback?code=x')).toBeNull()
    expect(erroreVersoClaude(null)).toBeNull()
  })
})

describe('le risposte di Supabase Auth, per le persone', () => {
  it.each([
    [{ status: 404, code: 'feature_disabled' }, 'non_attivo'],
    [{ name: 'AuthApiError', status: 404, code: 'oauth_authorization_not_found' }, 'scaduta'],
    [{ name: 'AuthApiError', status: 400, code: 'validation_failed' }, 'usata'],
    [{ name: 'AuthSessionMissingError', status: 400 }, 'sessione'],
    [{ name: 'AuthApiError', status: 403, code: 'bad_jwt' }, 'sessione'],
    [{ name: 'AuthRetryableFetchError', status: 503 }, 'temporaneo'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'temporaneo'],
    [{ name: 'AuthUnknownError', status: 400 }, 'temporaneo'],
    [{ name: 'AuthApiError', status: 500 }, 'temporaneo'],
  ] as const)('%o → %s', (e, tipo) => {
    expect(tipoErroreAutorizzazione(e)).toBe(tipo)
  })
})

describe('lo schema del modulo di consenso', () => {
  it('accetta l’id di Supabase e le quattro decisioni', () => {
    for (const decisione of ['consenti', 'rifiuta']) {
      expect(consensoSchema.safeParse({ authorization_id: ID, decisione }).success).toBe(true)
    }
    for (const decisione of ['continua', 'annulla']) {
      expect(consensoSchema.safeParse({ authorization_id: ID, decisione, redirect_url: CON_CODICE }).success).toBe(true)
      // continua e annulla portano l’indirizzo che Supabase ha già costruito
      expect(consensoSchema.safeParse({ authorization_id: ID, decisione }).success).toBe(false)
    }
  })

  it.each(['../user', 'abc', 'a b c d e f g h', `${ID}/consent`, 'x'.repeat(201), ''])('rifiuta l’id %s', (id) => {
    const r = consensoSchema.safeParse({ authorization_id: id, decisione: 'rifiuta' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe(NON_VALIDA)
  })

  it('rifiuta una decisione inventata e un indirizzo troppo lungo', () => {
    expect(consensoSchema.safeParse({ authorization_id: ID, decisione: 'approva' }).success).toBe(false)
    expect(
      consensoSchema.safeParse({ authorization_id: ID, decisione: 'continua', redirect_url: 'x'.repeat(2001) }).success,
    ).toBe(false)
  })
})

describe('il tocco sulla pagina di consenso', () => {
  it('Consenti: controlla di nuovo chi è, approva e torna a Claude col codice', async () => {
    expect(await tocca({ authorization_id: ID, decisione: 'consenti' })).toEqual({ verso: CON_CODICE })
    expect(sb.stato.chiamate).toEqual(['rpc:puo_usare_mcp', 'approva'])
    expect(sb.stato.argomenti[0]).toEqual([ID, { skipBrowserRedirect: true }])
  })

  it('Consenti da chi nel frattempo non può più: diventa un rifiuto, mai un’approvazione', async () => {
    sb.stato.puo = { data: false, error: null }
    expect(await tocca({ authorization_id: ID, decisione: 'consenti' })).toEqual({ verso: NEGATA })
    expect(sb.stato.chiamate).toEqual(['rpc:puo_usare_mcp', 'dettagli', 'nega'])
  })

  it('Consenti quando il controllo non risponde: nessuna approvazione, si riprova', async () => {
    sb.stato.puo = { data: null, error: { message: 'rete' } }
    expect(await tocca({ authorization_id: ID, decisione: 'consenti' })).toEqual({
      esito: { errore: MESSAGGI_AUTORIZZAZIONE.temporaneo, finale: false },
    })
    expect(sb.stato.chiamate).toEqual(['rpc:puo_usare_mcp'])
  })

  it('Rifiuta di chi non può collegare Claude: legge prima i dettagli (lega la richiesta), poi nega; nessun controllo del ruolo', async () => {
    sb.stato.puo = { data: false, error: null }
    expect(await tocca({ authorization_id: ID, decisione: 'rifiuta' })).toEqual({ verso: NEGATA })
    expect(sb.stato.chiamate).toEqual(['dettagli', 'nega'])
    expect(sb.stato.argomenti[1]).toEqual([ID, { skipBrowserRedirect: true }])
  })

  it('Rifiuta quando Supabase approva da solo un vecchio consenso: access_denied, mai il codice', async () => {
    sb.stato.dettagli = { data: { redirect_url: CON_CODICE }, error: null }
    const r = await tocca({ authorization_id: ID, decisione: 'rifiuta' })
    expect(sb.stato.chiamate).toEqual(['dettagli'])
    expect('verso' in r).toBe(true)
    const url = new URL((r as { verso: string }).verso)
    expect(url.searchParams.has('code')).toBe(false)
    expect(url.searchParams.get('error')).toBe('access_denied')
    expect(url.searchParams.get('state')).toBe('stato-di-claude')
  })

  it('Continua consegna l’indirizzo col codice; da chi non può più, diventa Annulla', async () => {
    expect(await tocca({ authorization_id: ID, decisione: 'continua', redirect_url: CON_CODICE })).toEqual({
      verso: CON_CODICE,
    })
    sb.stato.puo = { data: false, error: null }
    const r = (await tocca({ authorization_id: ID, decisione: 'continua', redirect_url: CON_CODICE })) as {
      verso: string
    }
    expect(r.verso).not.toContain('code=')
    expect(r.verso).toContain('error=access_denied')
  })

  it('Annulla: Claude riceve access_denied con lo stesso state, senza il codice e senza chiamare Supabase', async () => {
    const r = (await tocca({ authorization_id: ID, decisione: 'annulla', redirect_url: CON_CODICE })) as {
      verso: string
    }
    expect(sb.stato.chiamate).toEqual([])
    expect(r.verso).toBe(erroreVersoClaude(CON_CODICE))
  })

  it('un indirizzo che non è di Claude: nessun redirect, la frase, nel log solo l’host', async () => {
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sb.stato.approva = { data: { redirect_url: 'https://evil.example/cb?code=segreto&state=s' }, error: null }
    expect(await tocca({ authorization_id: ID, decisione: 'consenti' })).toEqual({
      esito: { errore: CONSENSO.nonDaClaude, finale: true },
    })
    expect(avviso).toHaveBeenCalledWith('[mcp] consenso destinazione rifiutata host=evil.example')
    expect(JSON.stringify(avviso.mock.calls)).not.toContain('segreto')

    // a refusal still happened in Supabase: the sentence says so
    sb.stato.nega = { data: { redirect_url: 'https://evil.example/cb?error=access_denied' }, error: null }
    expect(await tocca({ authorization_id: ID, decisione: 'rifiuta' })).toEqual({
      esito: { errore: CONSENSO.rifiutataNonDaClaude, finale: true },
    })
    // a continua posted by hand towards another site goes nowhere
    expect(await tocca({ authorization_id: ID, decisione: 'continua', redirect_url: 'https://evil.example/x' })).toEqual({
      esito: { errore: CONSENSO.nonDaClaude, finale: true },
    })
    avviso.mockRestore()
  })

  it.each([
    [{ name: 'AuthApiError', status: 404, code: 'oauth_authorization_not_found' }, 'scaduta', true],
    [{ name: 'AuthApiError', status: 400, code: 'validation_failed' }, 'usata', true],
    [{ name: 'AuthApiError', status: 404, code: 'feature_disabled' }, 'non_attivo', true],
    [{ name: 'AuthRetryableFetchError', status: 503 }, 'temporaneo', false],
  ] as const)('un errore di Supabase (%o) resta sulla pagina con la sua frase', async (e, tipo, finale) => {
    sb.stato.approva = errore(e)
    expect(await tocca({ authorization_id: ID, decisione: 'consenti' })).toEqual({
      esito: { errore: MESSAGGI_AUTORIZZAZIONE[tipo], finale },
    })
    sb.stato.dettagli = errore(e)
    expect(await tocca({ authorization_id: ID, decisione: 'rifiuta' })).toEqual({
      esito: { errore: MESSAGGI_AUTORIZZAZIONE[tipo], finale },
    })
  })

  it('un modulo non valido non chiama Supabase', async () => {
    expect(await tocca({ authorization_id: '../x', decisione: 'consenti' })).toEqual({
      esito: { errore: NON_VALIDA, finale: true },
    })
    expect(await tocca({ authorization_id: ID, decisione: 'approva' })).toEqual({
      esito: { errore: NON_VALIDA, finale: true },
    })
    expect(sb.stato.chiamate).toEqual([])
  })

  it('redirect() non sta mai dentro un try: il segnale di Next esce dall’azione', async () => {
    await expect(decidiCollegamento(null, modulo({ authorization_id: ID, decisione: 'consenti' }))).rejects.toBeInstanceOf(
      Redirezione,
    )
  })
})

/** The page's element: PaginaConsenso wrapping one card. */
async function pagina(authorization_id: unknown): Promise<ReactElement<{ children: ReactElement }>> {
  const el = await ConsensoPage({ searchParams: Promise.resolve({ authorization_id } as never) })
  if (!isValidElement(el)) throw new Error('non è un elemento')
  return el as ReactElement<{ children: ReactElement }>
}

describe('la pagina di consenso mentre si apre', () => {
  it('chi non può collegare Claude: la scheda del rifiuto, e i dettagli non si leggono mai', async () => {
    sb.stato.puo = { data: false, error: null }
    const el = await pagina(ID)
    expect(el.props.children.type).toBe(SchedaNonAmmesso)
    expect(sb.stato.chiamate).toEqual(['rpc:puo_usare_mcp'])
  })

  it('il controllo che non risponde vale come no, e i dettagli non si leggono', async () => {
    sb.stato.puo = { data: null, error: { message: 'rete' } }
    expect((await pagina(ID)).props.children.type).toBe(SchedaNonAmmesso)
    expect(sb.stato.chiamate).not.toContain('dettagli')
  })

  it('primo consenso: la scheda con il client, chi si collega e dove si torna', async () => {
    const el = await pagina(ID)
    expect(el.props.children.type).toBe(SchedaConsenso)
    expect(el.props.children.props).toMatchObject({
      authorizationId: ID,
      client: 'Claude',
      nome: 'Giulia Marketing',
      ruolo: 'Marketing',
      chi: { ruolo: 'marketing', livello: 'employee' },
      destinazione: { tipo: 'claude', host: 'claude.ai' },
    })
  })

  it('un consenso già dato: «Ricollega Claude», mai un redirect senza tocco', async () => {
    sb.stato.dettagli = { data: { redirect_url: CON_CODICE }, error: null }
    const el = await pagina(ID)
    expect(el.props.children.type).toBe(SchedaRicollega)
    expect(el.props.children.props).toMatchObject({ redirectUrl: CON_CODICE })
  })

  it('un indirizzo di ritorno che non è di Claude: non lo segue', async () => {
    const avviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    sb.stato.dettagli = { data: { ...DETTAGLI, redirect_uri: 'https://evil.example/cb' }, error: null }
    let el = await pagina(ID)
    expect(el.props.children.type).toBe(SchedaNonDaClaude)
    expect(el.props.children.props).toMatchObject({ authorizationId: ID })
    sb.stato.dettagli = { data: { redirect_url: 'https://evil.example/cb?code=x' }, error: null }
    el = await pagina(ID)
    expect(el.props.children.type).toBe(SchedaNonDaClaude)
    expect(el.props.children.props).toEqual({})
    avviso.mockRestore()
  })

  it.each([
    [{ name: 'AuthApiError', status: 404, code: 'oauth_authorization_not_found' }, 'scaduta'],
    [{ name: 'AuthApiError', status: 400, code: 'validation_failed' }, 'usata'],
    [{ name: 'AuthApiError', status: 404, code: 'feature_disabled' }, 'non_attivo'],
  ] as const)('%o: la frase, senza bottoni', async (e, tipo) => {
    sb.stato.dettagli = errore(e)
    const el = await pagina(ID)
    expect(el.props.children.type).toBe(SchedaMessaggio)
    expect(el.props.children.props).toMatchObject({ testo: MESSAGGI_AUTORIZZAZIONE[tipo] })
  })

  it('Supabase che non risponde: l’errore con «Riprova» (error.tsx)', async () => {
    sb.stato.dettagli = errore({ name: 'AuthRetryableFetchError', status: 503 })
    await expect(pagina(ID)).rejects.toThrow()
  })

  it.each([undefined, '', '../x', ['a', 'b']])('un id non valido (%o): la frase, nessuna chiamata', async (id) => {
    const el = await pagina(id)
    expect(el.props.children.type).toBe(SchedaMessaggio)
    expect(el.props.children.props).toMatchObject({ testo: NON_VALIDA })
    expect(sb.stato.chiamate).toEqual([])
  })
})

describe('le parole della scheda di consenso', () => {
  const MARKETING = { ruolo: 'marketing', livello: 'employee' } as const
  const ADMIN = { ruolo: 'admin', livello: 'admin' } as const
  const props = {
    authorizationId: ID,
    client: 'Claude',
    destinazione: { tipo: 'claude' as const, host: 'claude.ai' },
    nome: 'Giulia Marketing',
    ruolo: 'Marketing',
  }

  it('dice cosa farà Claude, cosa non vedrà mai e avvisa del link mandato da altri', () => {
    const html = renderToStaticMarkup(createElement(SchedaConsenso, { ...props, chi: MARKETING }))
    for (const frase of [CONSENSO.titolo, ...azioniConsenso(MARKETING), CONSENSO.maiVisto, CONSENSO.team, CONSENSO.phishing]) {
      expect(html).toContain(frase)
    }
    expect(html).toContain('claude.ai')
    expect(html).toContain('Giulia Marketing')
    expect(html).not.toContain(CONSENSO.azioneAdmin)
    expect(html).not.toContain(CONSENSO.phishingClaudeCode)
    expect(html).toContain('value="consenti"')
    expect(html).toContain('value="rifiuta"')
  })

  it('l’elenco di «Claude potrà» è una frase: «;» tra le voci e «.» in fondo, per ruolo e livello', () => {
    const frase = (voci: readonly string[]) => voci.map((v, i) => `${v}${i === voci.length - 1 ? '.' : ';'}`)
    expect(azioniConsenso(MARKETING)).toEqual(frase([...CONSENSO.azioni, ...CONSENSO.azioniProgetti]))
    expect(azioniConsenso(ADMIN)).toEqual(
      frase([
        CONSENSO.azioniCall.admin,
        ...CONSENSO.azioni,
        CONSENSO.azioneAdmin,
        ...CONSENSO.azioniProgetti,
        CONSENSO.azioneGestione,
        CONSENSO.azioneTempoTeam,
      ]),
    )
    // every role connects Claude since 22/10/2026: the setter has projects, his own time and (23/10/2026) his
    // calls and leads, not the calendar; the closer his calls and their outcome
    expect(azioniConsenso({ ruolo: 'setter', livello: 'employee' })).toEqual(
      frase([CONSENSO.azioniCall.setter, ...CONSENSO.azioniProgetti]),
    )
    expect(azioniConsenso({ ruolo: 'closer', livello: 'employee' })).toEqual(
      frase([CONSENSO.azioniCall.closer, ...CONSENSO.azioniProgetti]),
    )
    expect(azioniConsenso({ ruolo: 'coach', livello: 'manager' })).toEqual(frase([...CONSENSO.azioniProgetti, CONSENSO.azioneGestione]))
    // the business coach reads only (22/10/2026), whatever his level
    expect(azioniConsenso({ ruolo: 'business_coach', livello: 'manager' })).toEqual(frase([...CONSENSO.azioniSolaLettura]))
    for (const voce of [
      ...CONSENSO.azioni,
      CONSENSO.azioneAdmin,
      ...CONSENSO.azioniProgetti,
      CONSENSO.azioneGestione,
      CONSENSO.azioneTempoTeam,
      ...Object.values(CONSENSO.azioniCall),
    ]) {
      expect(voce).not.toMatch(/[;.,:]$/)
    }
    for (const chi of [MARKETING, ADMIN, { ruolo: 'setter', livello: 'employee' } as const]) {
      const html = renderToStaticMarkup(createElement(SchedaConsenso, { ...props, chi }))
      const voci = [...html.matchAll(/<li[^>]*>(?:<svg.*?<\/svg>)?(.*?)<\/li>/g)].map((m) => m[1])
      expect(voci, chi.ruolo).toEqual(azioniConsenso(chi))
    }
  })

  it('l’eliminazione di un contenuto e il tempo del team solo per l’admin', () => {
    const html = renderToStaticMarkup(createElement(SchedaConsenso, { ...props, chi: ADMIN }))
    expect(html).toContain(`${CONSENSO.azioneAdmin};`)
    expect(html).toContain(`${CONSENSO.azioneTempoTeam}.`)
    const coach = renderToStaticMarkup(createElement(SchedaConsenso, { ...props, chi: { ruolo: 'coach', livello: 'manager' } }))
    expect(coach).not.toContain(CONSENSO.azioneAdmin)
    expect(coach).not.toContain(CONSENSO.azioneTempoTeam)
    expect(coach).not.toContain(CONSENSO.azioni[0])
  })

  it('«Non vedrà mai» per ruolo: chi lavora sulle call le raggiunge, il setter mai importi, link di Fathom o performance', () => {
    expect(maiVistoPer(MARKETING)).toBe(CONSENSO.maiVisto)
    expect(maiVistoPer({ ruolo: 'coach' })).toBe(CONSENSO.maiVisto)
    expect(maiVistoPer(ADMIN)).toBe(CONSENSO.maiVistoCall)
    expect(maiVistoPer({ ruolo: 'closer' })).toBe(CONSENSO.maiVistoCall)
    expect(maiVistoPer({ ruolo: 'setter' })).toBe(CONSENSO.maiVistoSetter)
    expect(CONSENSO.maiVistoSetter).toMatch(/importi, link di Fathom, performance/)
    expect(maiVistoPer({ ruolo: 'business_coach' })).toBe(CONSENSO.maiVistoSolaLettura)
    for (const frase of [CONSENSO.maiVistoCall, CONSENSO.maiVistoSetter]) {
      expect(frase).toContain('le analisi di Claude sulle call')
      expect(frase).toContain('né call, né lead')
    }
    const setter = renderToStaticMarkup(createElement(SchedaConsenso, { ...props, chi: { ruolo: 'setter', livello: 'employee' } }))
    expect(setter).toContain(CONSENSO.maiVistoSetter)
    expect(setter).not.toContain(CONSENSO.azioniCall.closer)
  })

  it('per Claude Code: il computer, l’avviso che ogni programma può rispondere, e niente «Connetti»', () => {
    const html = renderToStaticMarkup(
      createElement(SchedaConsenso, { ...props, chi: MARKETING, destinazione: { tipo: 'claude_code', host: '127.0.0.1' } }),
    )
    expect(html).toContain('un programma sul tuo computer (Claude Code), indirizzo 127.0.0.1')
    expect(html).toContain(CONSENSO.loopback)
    expect(html).toContain(CONSENSO.phishingClaudeCode)
    expect(html).not.toContain('Connetti')
  })

  it('l’avviso del link mandato da altri dice quello che la persona ha appena fatto', () => {
    expect(avvisoPhishing('claude')).toBe(CONSENSO.phishing)
    expect(avvisoPhishing('claude', true)).toBe(CONSENSO.phishingRicollega)
    expect(avvisoPhishing('claude_code')).toBe(CONSENSO.phishingClaudeCode)
    expect(avvisoPhishing('claude_code', true)).toBe(CONSENSO.phishingRicollegaClaudeCode)
    expect(CONSENSO.phishingClaudeCode).toContain('/mcp › Authenticate')
    expect(CONSENSO.phishingClaudeCode).toMatch(/premi Rifiuta\.$/)
    expect(CONSENSO.phishingRicollegaClaudeCode).toMatch(/premi Annulla\.$/)
    for (const frase of [CONSENSO.phishingClaudeCode, CONSENSO.phishingRicollegaClaudeCode]) {
      expect(frase).not.toContain('Connetti')
    }
  })

  it('«Ricollega Claude» porta l’indirizzo nel modulo e offre Continua e Annulla', () => {
    const html = renderToStaticMarkup(
      createElement(SchedaRicollega, { ...props, redirectUrl: CON_CODICE }),
    )
    expect(html).toContain(CONSENSO.titoloRicollega)
    expect(html).toContain(CONSENSO.phishingRicollega)
    expect(html).toContain('value="continua"')
    expect(html).toContain('value="annulla"')
    expect(html).toContain('name="redirect_url"')
    const code = renderToStaticMarkup(
      createElement(SchedaRicollega, {
        ...props,
        redirectUrl: CON_CODICE,
        destinazione: { tipo: 'claude_code', host: 'localhost' },
      }),
    )
    expect(code).toContain(CONSENSO.phishingRicollegaClaudeCode)
    expect(code).not.toContain('Connetti')
  })

  it('chi non può (un account disattivato): il perché e «Torna a Claude», che rifiuta', () => {
    const html = renderToStaticMarkup(createElement(SchedaNonAmmesso, { authorizationId: ID }))
    expect(html).toContain('solo con un account attivo')
    expect(html).toContain(CONSENSO.tornaAClaude)
    expect(html).toContain('value="rifiuta"')
    expect(html).not.toContain('value="consenti"')
  })
})

describe('Collega Claude in Profilo › Account', () => {
  const URL_MCP = 'https://dashboard.percorsoalpha.com/mcp'
  const claude = { clientId: CLIENT, nome: 'Claude' }
  const claudeCode = { clientId: '11111111-2222-4333-8444-555555555555', nome: 'Claude Code' }

  it('con i due client: l’indirizzo, l’ID di Claude e il comando per Claude Code', () => {
    const html = renderToStaticMarkup(createElement(CollegaClaude, { urlMcp: URL_MCP, claude, claudeCode, admin: false }))
    expect(html).toContain(URL_MCP)
    expect(html).toContain(CLIENT)
    expect(html).toContain(comandoClaudeCode(claudeCode.clientId, URL_MCP))
    expect(html).toContain('Use your own OAuth client')
    expect(html).toContain('Usa il tuo client OAuth')
    // every value has its 44 px copy button
    expect(html.match(/aria-label="Copia/g)).toHaveLength(3)
  })

  it('il comando per Claude Code vale in ogni cartella e usa la porta registrata', () => {
    expect(comandoClaudeCode('abc', URL_MCP)).toBe(
      `claude mcp add --scope user --transport http --client-id abc --callback-port 48721 alpha ${URL_MCP}`,
    )
  })

  it('senza client: all’admin dove attivarlo, agli altri di chiederlo', () => {
    const admin = renderToStaticMarkup(createElement(CollegaClaude, { urlMcp: URL_MCP, claude: null, claudeCode: null, admin: true }))
    expect(admin).toContain('attiva il server OAuth in Supabase (Authentication › OAuth Server)')
    expect(admin).toContain('Client type Public')
    expect(admin).not.toContain(URL_MCP)
    const altri = renderToStaticMarkup(createElement(CollegaClaude, { urlMcp: URL_MCP, claude: null, claudeCode: null, admin: false }))
    expect(altri).toContain('chiedi all’admin')
  })

  it('un client solo: i suoi passi e, all’admin, l’indirizzo di ritorno che manca', () => {
    const soloClaude = renderToStaticMarkup(createElement(CollegaClaude, { urlMcp: URL_MCP, claude, claudeCode: null, admin: true }))
    expect(soloClaude).toContain(CLIENT)
    expect(soloClaude).toContain('http://localhost:48721/callback')
    expect(soloClaude).not.toContain('claude mcp add')
    const soloClaudeAltri = renderToStaticMarkup(
      createElement(CollegaClaude, { urlMcp: URL_MCP, claude, claudeCode: null, admin: false }),
    )
    expect(soloClaudeAltri).not.toContain('48721')

    const soloCode = renderToStaticMarkup(createElement(CollegaClaude, { urlMcp: URL_MCP, claude: null, claudeCode, admin: true }))
    expect(soloCode).toContain('https://claude.ai/api/mcp/auth_callback')
    expect(soloCode).toContain('claude mcp add')
  })
})

describe('Scollega in App collegate', () => {
  it('revoca solo l’app scelta, con la sessione di chi tocca', async () => {
    expect(await scollegaApp({ clientId: CLIENT })).toEqual({ ok: true })
    expect(sb.stato.chiamate).toEqual(['revoca'])
    expect(sb.stato.argomenti[0]).toEqual([{ clientId: CLIENT }])
  })

  it('un’app già scollegata altrove vale come scollegata; il server spento no', async () => {
    sb.stato.revoca = errore({ name: 'AuthApiError', status: 404, code: 'oauth_consent_not_found' })
    expect(await scollegaApp({ clientId: CLIENT })).toEqual({ ok: true })
    sb.stato.revoca = errore({ name: 'AuthApiError', status: 404, code: 'feature_disabled' })
    expect(await scollegaApp({ clientId: CLIENT })).toEqual({ ok: false, errore: 'App non scollegata. Riprova.' })
    sb.stato.revoca = errore({ name: 'AuthRetryableFetchError', status: 503 })
    expect(await scollegaApp({ clientId: CLIENT })).toEqual({ ok: false, errore: 'App non scollegata. Riprova.' })
  })

  it('un id che non è un uuid, o nessuna sessione: niente da revocare', async () => {
    expect(scollegaAppSchema.safeParse({ clientId: 'abc' }).success).toBe(false)
    expect(await scollegaApp({ clientId: 'abc' })).toMatchObject({ ok: false })
    sessione.profilo = null
    expect(await scollegaApp({ clientId: CLIENT })).toEqual({ ok: false, errore: 'Sessione scaduta. Rientra e riprova.' })
    expect(sb.stato.chiamate).toEqual([])
  })
})

/** The element an async server component returns, rendered as the page would. */
async function html(el: Promise<ReactElement | null>): Promise<string> {
  const risolto = await el
  return risolto ? renderToStaticMarkup(risolto) : ''
}

describe('App collegate in Profilo › Account', () => {
  const grant = (id: string, name: string, granted_at: string) => ({
    client: { id, name, uri: '', logo_uri: '' },
    scopes: ['email'],
    granted_at,
  })

  it('le app della persona, dalla più recente, con il giorno di Roma e «Scollega»', async () => {
    sb.stato.grants = {
      data: [
        grant(CLIENT, 'Claude', '2026-10-01T09:00:00Z'),
        // 23:30 UTC of the 8th is already the 9th in Rome
        grant('11111111-2222-4333-8444-555555555555', 'Claude Code', '2026-10-08T23:30:00Z'),
      ],
      error: null,
    }
    const el = (await AppCollegate()) as ReactElement
    const pagina = renderToStaticMarkup(el)
    expect(pagina).toContain(APP_COLLEGATE.titolo)
    expect(pagina.indexOf('Claude Code')).toBeLessThan(pagina.indexOf('collegata il 01/10/2026'))
    expect(pagina).toContain('collegata il 09/10/2026')
    expect(pagina).toContain('aria-label="Scollega Claude Code"')
    expect(pagina).toContain('aria-label="Scollega Claude"')
    // the heading takes the focus when a disconnected row leaves
    expect(pagina).toMatch(/<h2 id="titolo-app-collegate" tabindex="-1"/)
    expect(sb.stato.chiamate).toEqual(['grants'])
  })

  it('nessuna app: la frase dello stato vuoto', async () => {
    expect(await html(AppCollegate())).toContain(APP_COLLEGATE.vuoto)
  })

  it('Supabase che non risponde: l’errore con «Riprova», mai «Nessuna app collegata»', async () => {
    sb.stato.grants = errore({ name: 'AuthRetryableFetchError', status: 503 })
    const el = (await AppCollegate()) as ReactElement
    const pagina = renderToStaticMarkup(el)
    expect(pagina).not.toContain(APP_COLLEGATE.vuoto)
    expect(pagina).toContain(APP_COLLEGATE.errore)
    expect(pagina).toContain('Riprova')
  })

  it('il server OAuth spento: la sezione non c’è', async () => {
    sb.stato.grants = errore({ name: 'AuthApiError', status: 404, code: 'feature_disabled' })
    expect(await AppCollegate()).toBeNull()
  })

  it('l’elenco e l’errore si disegnano a 390 px senza nomi tecnici', () => {
    const elenco = renderToStaticMarkup(
      createElement(ElencoAppCollegate, {
        app: [{ clientId: CLIENT, nome: 'Claude', collegataIl: '09/10/2026' }],
        idTitolo: 'titolo-app-collegate',
      }),
    )
    // 44 px: the button and the dialog's buttons share h-11
    expect(elenco).toContain('h-11')
    expect(elenco).not.toContain(CLIENT)
    const errorePagina = renderToStaticMarkup(createElement(ErroreSezioneAccount, { titolo: APP_COLLEGATE.errore }))
    expect(errorePagina).toContain(APP_COLLEGATE.errore)
    expect(errorePagina).toContain('Riprova')
  })
})

describe('la sezione Collega Claude legge i client registrati', () => {
  it('i due client dall’indirizzo di ritorno, col più vecchio quando sono doppi', async () => {
    sb.stato.clientMcp = {
      data: [
        { tipo: 'claude', nome: 'Claude', client_id: CLIENT },
        { tipo: 'claude', nome: 'Claude (doppione)', client_id: '99999999-2222-4333-8444-555555555555' },
        { tipo: 'claude_code', nome: 'Claude Code', client_id: '11111111-2222-4333-8444-555555555555' },
      ],
      error: null,
    }
    const el = (await SezioneCollegaClaude({ admin: false })) as ReactElement<{
      claude: unknown
      claudeCode: unknown
      urlMcp: string
    }>
    expect(el.type).toBe(CollegaClaude)
    expect(el.props.claude).toEqual({ clientId: CLIENT, nome: 'Claude' })
    expect(el.props.claudeCode).toEqual({ clientId: '11111111-2222-4333-8444-555555555555', nome: 'Claude Code' })
    // the address comes from APP_URL, never from the request
    expect(el.props.urlMcp).toBe('http://localhost:3000/mcp')
    expect(sb.stato.chiamate).toEqual(['rpc:mcp_client'])
  })

  it('nessun client: la card dice che non è ancora attivo', async () => {
    const el = (await SezioneCollegaClaude({ admin: true })) as ReactElement
    expect(renderToStaticMarkup(el)).toContain(COLLEGA_CLAUDE.nonAttivoAdmin)
  })

  it('all’admin dice che i client vanno registrati Public: uno Confidential non vale (mcp_client lo salta)', () => {
    for (const frase of [COLLEGA_CLAUDE.nonAttivoAdmin, clientMancante('claude'), clientMancante('claude_code')]) {
      expect(frase).toContain('Client type Public, senza segreto (un client Confidential non vale)')
    }
    expect(COLLEGA_CLAUDE.nonAttivoAdmin).toContain('Authentication › OAuth Server')
  })

  it('una lettura che non riesce: l’errore con «Riprova», mai «non attivo»', async () => {
    sb.stato.clientMcp = { data: null, error: { message: 'rete' } }
    const el = (await SezioneCollegaClaude({ admin: true })) as ReactElement<{ titolo: string }>
    expect(el.type).toBe(ErroreSezioneAccount)
    expect(el.props.titolo).toBe(COLLEGA_CLAUDE.errore)
  })
})
