import { describe, expect, it } from 'vitest'

import { isDevLoginEnabled } from '@/lib/auth/dev-login'

describe('login di sviluppo', () => {
  it('è attivo solo in locale con la variabile esplicita', () => {
    expect(
      isDevLoginEnabled({ ENABLE_DEV_LOGIN: 'true', NODE_ENV: 'development' }),
    ).toBe(true)
  })

  it('non esiste in una build di produzione, nemmeno con la variabile a true', () => {
    expect(
      isDevLoginEnabled({ ENABLE_DEV_LOGIN: 'true', NODE_ENV: 'production' }),
    ).toBe(false)
  })

  it('resta spento senza la variabile', () => {
    expect(isDevLoginEnabled({ NODE_ENV: 'development' })).toBe(false)
    expect(
      isDevLoginEnabled({ ENABLE_DEV_LOGIN: 'false', NODE_ENV: 'development' }),
    ).toBe(false)
  })
})
