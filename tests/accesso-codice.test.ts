import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  esitoRichiestaCodice,
  esitoVerificaCodice,
  messaggioCodice,
  messaggioRichiesta,
  motivoLoginPerLink,
  PAROLE_ACCESSO,
  testoAttesa,
} from '@/lib/auth/accesso'
import { destinazioneSicura } from '@/lib/auth/origine'
import {
  ATTESA_NUOVO_CODICE_S,
  codiceAccessoSchema,
  emailAccessoSchema,
  linkAccessoSchema,
  richiestaCodiceSchema,
  verificaCodiceSchema,
} from '@/lib/validation/accesso'

describe('l’indirizzo per il codice', () => {
  it('si pulisce: spazi tolti, minuscolo', () => {
    expect(emailAccessoSchema.parse('  Dany@Percorsoalpha.COM ')).toBe('dany@percorsoalpha.com')
  })

  it.each(['', '   ', 'senza-chiocciola', 'a@', '@b.it', 'a b@c.it'])('rifiuta «%s»', (v) => {
    expect(emailAccessoSchema.safeParse(v).success).toBe(false)
  })

  it('dice in italiano cosa non va', () => {
    const r = emailAccessoSchema.safeParse('nope')
    expect(r.success ? '' : r.error.issues[0].message).toBe('Scrivi un indirizzo valido, ad esempio nome@dominio.it')
    const vuoto = emailAccessoSchema.safeParse('')
    expect(vuoto.success ? '' : vuoto.error.issues[0].message).toBe('Scrivi il tuo indirizzo di posta')
  })
})

describe('il codice di 8 cifre', () => {
  it.each([
    ['12345678', '12345678'],
    [' 12345678 ', '12345678'],
    ['1234 5678', '12345678'],
    ['1234-5678', '12345678'],
    ['00000000', '00000000'],
  ])('«%s» vale %s', (scritto, atteso) => {
    expect(codiceAccessoSchema.parse(scritto)).toBe(atteso)
  })

  it.each(['', '1234567', '123456789', 'abcdefgh', '12a45678', '12.45678'])('rifiuta «%s»', (v) => {
    expect(codiceAccessoSchema.safeParse(v).success).toBe(false)
  })

  it('i messaggi sono quelli della pagina', () => {
    const corto = codiceAccessoSchema.safeParse('1234567')
    expect(corto.success ? '' : corto.error.issues[0].message).toBe('Il codice ha 8 cifre')
    const vuoto = codiceAccessoSchema.safeParse('  ')
    expect(vuoto.success ? '' : vuoto.error.issues[0].message).toBe('Scrivi il codice')
  })
})

describe('quello che ricevono le server action', () => {
  it('la richiesta ha l’indirizzo pulito e «/» se manca «da»', () => {
    expect(richiestaCodiceSchema.parse({ email: ' A@B.it ' })).toEqual({ email: 'a@b.it', da: '/' })
  })

  it('la verifica vuole indirizzo e codice', () => {
    expect(verificaCodiceSchema.parse({ email: 'a@b.it', codice: '1234 5678', da: '/sales' })).toEqual({
      email: 'a@b.it',
      codice: '12345678',
      da: '/sales',
    })
    expect(verificaCodiceSchema.safeParse({ email: 'a@b.it' }).success).toBe(false)
    expect(verificaCodiceSchema.safeParse({ codice: '12345678' }).success).toBe(false)
  })

  it('«da» fuori dall’app arriva fin qui come testo ma non porta mai fuori', () => {
    const { da } = richiestaCodiceSchema.parse({ email: 'a@b.it', da: 'https://evil.example.com' })
    expect(destinazioneSicura(da)).toBe('/')
    expect(destinazioneSicura('//evil.example.com')).toBe('/')
    expect(destinazioneSicura('/\\evil.example.com')).toBe('/')
  })
})

describe('il link nell’email', () => {
  it('accetta il token di Supabase e i due tipi dell’accesso', () => {
    expect(linkAccessoSchema.safeParse({ token_hash: 'a'.repeat(56), type: 'email' }).success).toBe(true)
    expect(linkAccessoSchema.safeParse({ token_hash: `pkce_${'f'.repeat(56)}`, type: 'magiclink' }).success).toBe(true)
  })

  it.each([
    [{ token_hash: null, type: 'email' }],
    [{ token_hash: 'abc', type: 'email' }],
    [{ token_hash: 'a'.repeat(56), type: 'recovery' }],
    [{ token_hash: 'a'.repeat(56), type: 'signup' }],
    [{ token_hash: 'a'.repeat(56), type: 'invite' }],
    [{ token_hash: 'a'.repeat(56), type: null }],
    [{ token_hash: '../../etc/passwd/xxxxxxxxxx', type: 'email' }],
    [{ token_hash: `${'a'.repeat(56)}&x=1`, type: 'email' }],
  ])('rifiuta %j', (v) => {
    expect(linkAccessoSchema.safeParse(v).success).toBe(false)
  })
})

describe('la risposta alla richiesta del codice non dice se l’indirizzo ha un account', () => {
  // what Supabase answers for an address with no account, a deactivated one, a pause between two emails…
  const SENZA_ACCOUNT = { code: 'otp_disabled', status: 422 }
  const NON_TROVATO = { code: 'user_not_found', status: 400 }
  const NON_INVITATO = { code: 'signup_disabled', status: 422 }
  const PAUSA_FRA_DUE_MAIL = { code: 'over_email_send_rate_limit', status: 429 }
  const SENZA_CODICE = { code: undefined, status: 400 }

  it('stessa frase con o senza account, e anche per la pausa fra due email', () => {
    const messaggi = new Set(
      [null, SENZA_ACCOUNT, NON_TROVATO, NON_INVITATO, PAUSA_FRA_DUE_MAIL, SENZA_CODICE].map((e) =>
        messaggioRichiesta(esitoRichiestaCodice(e)),
      ),
    )
    expect([...messaggi]).toEqual(['Se l’indirizzo è registrato, ti abbiamo scritto: apri il link o inserisci il codice.'])
  })

  it('solo quello che non dipende dall’indirizzo si dice', () => {
    expect(esitoRichiestaCodice({ code: 'over_request_rate_limit', status: 429 })).toBe('troppe-richieste')
    expect(messaggioRichiesta('troppe-richieste')).toBe('Troppi tentativi ravvicinati. Aspetta qualche minuto e riprova.')
    expect(esitoRichiestaCodice({ code: 'unexpected_failure', status: 500 })).toBe('non-disponibile')
    expect(esitoRichiestaCodice({ code: undefined, status: undefined })).toBe('non-disponibile')
    expect(esitoRichiestaCodice({ code: undefined, status: 0 })).toBe('non-disponibile')
  })
})

describe('il codice digitato', () => {
  it('sbagliato o scaduto: un solo messaggio, senza dettagli tecnici', () => {
    for (const e of [
      { code: 'otp_expired', status: 403 },
      { code: undefined, status: 403 },
      { code: 'validation_failed', status: 422 },
      { code: 'bad_json', status: 400 },
    ]) {
      expect(messaggioCodice(esitoVerificaCodice(e))).toBe(
        'Il codice non è valido o è scaduto. Controlla le cifre o chiedine uno nuovo.',
      )
    }
  })

  it('troppi tentativi e servizio che non risponde hanno le loro parole', () => {
    expect(messaggioCodice(esitoVerificaCodice({ code: 'over_request_rate_limit', status: 429 }))).toBe(
      PAROLE_ACCESSO.troppeRichieste,
    )
    expect(messaggioCodice(esitoVerificaCodice({ code: undefined, status: 429 }))).toBe(PAROLE_ACCESSO.troppeRichieste)
    expect(messaggioCodice(esitoVerificaCodice({ code: 'unexpected_failure', status: 502 }))).toBe(
      PAROLE_ACCESSO.nonDisponibile,
    )
  })
})

describe('il link aperto dalla email', () => {
  it('usato o scaduto: «il link è scaduto», con le parole del login', () => {
    expect(motivoLoginPerLink({ code: 'otp_expired', status: 403 })).toBe('link-scaduto')
    expect(motivoLoginPerLink({ code: undefined, status: 403 })).toBe('link-scaduto')
    expect(PAROLE_ACCESSO.linkScaduto).toBe('Il link è scaduto o è già stato usato: chiedine uno nuovo.')
  })

  it('se è Supabase a non rispondere non si accusa il link', () => {
    expect(motivoLoginPerLink({ code: 'unexpected_failure', status: 500 })).toBe('callback')
    expect(motivoLoginPerLink({ code: undefined, status: undefined })).toBe('callback')
    expect(motivoLoginPerLink({ code: 'over_request_rate_limit', status: 429 })).toBe('callback')
  })
})

describe('le parole della pagina', () => {
  it('il conto alla rovescia', () => {
    expect(ATTESA_NUOVO_CODICE_S).toBe(60)
    expect(testoAttesa(60)).toBe('Invia di nuovo tra 60 secondi')
    expect(testoAttesa(1)).toBe('Invia di nuovo tra 1 secondo')
  })

  it('la validità dichiarata è quella di supabase/config.toml', () => {
    const config = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8')
    const scadenza = Number(config.match(/^otp_expiry\s*=\s*(\d+)/m)?.[1])
    const cifre = Number(config.match(/^otp_length\s*=\s*(\d+)/m)?.[1])
    expect(PAROLE_ACCESSO.validita).toContain(`${scadenza / 60} minuti`)
    expect(PAROLE_ACCESSO.introduzione).toContain(`${cifre} cifre`)
  })

  it('il template della mail usa il flusso della route e ha codice, link e durata giusti', () => {
    const html = readFileSync(join(process.cwd(), 'supabase/templates/accesso-con-codice.html'), 'utf8')
    expect(html).toContain('{{ .Token }}')
    expect(html).toContain('{{ .SiteURL }}/auth/conferma?token_hash={{ .TokenHash }}&amp;type=email')
    expect(html).not.toContain('{{ .ConfirmationURL }}')
    expect(html).toContain('valgono 60 minuti')
    const config = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8')
    expect(config).toMatch(
      /\[auth\.email\.template\.magic_link\][^[]*content_path = "\.\/supabase\/templates\/accesso-con-codice\.html"/,
    )
  })

  it('niente trattini lunghi ed emoji nelle parole', () => {
    const tutto = JSON.stringify(PAROLE_ACCESSO)
    expect(tutto).not.toMatch(/[—–]/)
    expect(tutto).not.toMatch(/\p{Extended_Pictographic}/u)
  })
})
