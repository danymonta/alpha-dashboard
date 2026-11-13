'use client'

import { AccessoCliente } from '@/components/percorso/accesso-cliente'
import { ContinuaInvito } from '@/components/percorso/continua-invito'
import { CorniceAccesso } from '@/components/percorso/cornice-accesso'
import { useProva } from '@/components/percorso/prova/prova-provider'
import { TESTI_JOIN, TESTI_REGISTRAZIONE } from '@/lib/percorso/testi'

/**
 * «Come lo vede il cliente dal link»: the page of an active personal link and the registration
 * with the email and the code, the same components of /join and /join/registrati. «Continua»
 * opens nothing, no email leaves: the code of the test is on the bar.
 */
export default function LinkProva() {
  const { dati, fase } = useProva()
  const nome = dati.nomeCompleto.split(' ')[0] ?? ''
  if (fase === 'registrazione') {
    return (
      <CorniceAccesso>
        <AccessoCliente
          modo="registrazione"
          emailIniziale={dati.email}
          titoli={{ email: TESTI_REGISTRAZIONE.titolo, sottoEmail: TESTI_REGISTRAZIONE.sotto, codice: TESTI_REGISTRAZIONE.titoloCodice }}
        />
      </CorniceAccesso>
    )
  }
  return (
    <CorniceAccesso titolo={TESTI_JOIN.attivo.saluto(nome)} sotto={TESTI_JOIN.attivo.sotto}>
      <ContinuaInvito segmento="prova" />
    </CorniceAccesso>
  )
}
