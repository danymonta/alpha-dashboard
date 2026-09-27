import { describe, expect, it } from 'vitest'

import { emailInvito } from '@/lib/email/invito'

const dati = {
  email: 'loris@example.com',
  ruolo: 'Setter',
  invitatoDa: 'Dany Montagnolo',
  urlLogin: 'https://alpha.example.com/login',
  urlLogo: 'https://alpha.example.com/brand/percorso-alpha-email.png',
}

describe('email di invito', () => {
  it('porta il logo, il ruolo e il bottone per entrare', () => {
    const { oggetto, html } = emailInvito(dati)
    expect(oggetto).toContain('Percorso Alpha')
    expect(html).toContain(`src="${dati.urlLogo}"`)
    expect(html).toContain(`href="${dati.urlLogin}"`)
    expect(html).toContain('Entra con Google')
    expect(html).toContain('Setter')
  })

  it('ha la versione solo testo con il link', () => {
    const { testo } = emailInvito(dati)
    expect(testo).toContain(dati.urlLogin)
    expect(testo).toContain(dati.email)
    expect(testo).not.toContain('<')
  })

  it('non lascia passare HTML dai dati', () => {
    const { html } = emailInvito({ ...dati, invitatoDa: '<script>x</script> Rossi' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
