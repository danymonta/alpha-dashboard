import { APICallError, RetryError } from 'ai'
import { describe, expect, it } from 'vitest'

import { attesa, messaggioErroreAlfire } from '@/lib/alfire/errori'

function groq(stato: number, messaggio: string) {
  return new APICallError({
    message: messaggio,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    requestBodyValues: {},
    statusCode: stato,
    responseBody: JSON.stringify({ error: { message: messaggio, type: 'tokens', code: 'rate_limit_exceeded' } }),
    isRetryable: stato === 429,
  })
}

// what the SDK throws after its last retry
function dopoITentativi(errore: unknown) {
  return new RetryError({ message: 'Failed after 3 attempts', reason: 'maxRetriesExceeded', errors: [errore, errore, errore] })
}

const MINUTO =
  'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01abc` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 6100, Requested 3120. Please try again in 9.15s.'
const GIORNO =
  'Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01abc` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199100, Requested 5230. Please try again in 31m22.4s.'

describe('Alfire dice perché non ha risposto', () => {
  it('limite del minuto, anche dopo i tentativi automatici', () => {
    expect(messaggioErroreAlfire(dopoITentativi(groq(429, MINUTO)), { admin: false })).toBe(
      'Alfire ha raggiunto il limite gratuito di questo minuto. Riprova tra 10 secondi.',
    )
  })

  it('limite del giorno, con quando torna', () => {
    expect(messaggioErroreAlfire(dopoITentativi(groq(429, GIORNO)), { admin: true })).toBe(
      'Alfire ha finito i messaggi gratuiti di oggi (limite giornaliero di Groq). Torna disponibile tra 32 minuti.',
    )
  })

  it('richiesta troppo lunga, chiave sbagliata, modello sparito, Groq giù', () => {
    expect(messaggioErroreAlfire(groq(413, 'Request too large'), { admin: false })).toContain('Nuova chat')
    expect(messaggioErroreAlfire(groq(401, 'Invalid API Key'), { admin: false })).toContain('ALFIRE_API_KEY')
    expect(messaggioErroreAlfire(groq(404, 'The model `x` does not exist'), { admin: true })).toContain('non è disponibile su Groq')
    expect(messaggioErroreAlfire(groq(503, 'Service unavailable'), { admin: false })).toBe('Groq non risponde in questo momento. Riprova tra poco.')
  })

  it('l’admin vede le parole del fornitore, mai l’organizzazione; gli altri un messaggio semplice', () => {
    const strano = groq(400, 'Something odd in organization org_01abc')
    expect(messaggioErroreAlfire(strano, { admin: true })).toBe('Alfire non ha risposto: Something odd in organization org_…')
    expect(messaggioErroreAlfire(strano, { admin: false })).toBe('Alfire non ha risposto. Riprova.')
  })

  it('le attese in parole', () => {
    expect(attesa('Please try again in 7.5s.')).toBe('tra 8 secondi')
    expect(attesa('Please try again in 12m30.4s.')).toBe('tra 13 minuti')
    expect(attesa('Please try again in 2h1m3s.')).toBe('tra circa 2 ore')
    expect(attesa('niente')).toBeNull()
  })
})
