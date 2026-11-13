'use client'

import { CorniceCliente } from '../cornice-cliente'
import { ConsensiCliente } from '@/components/percorso/consensi-cliente'
import { useProva } from '@/components/percorso/prova/prova-provider'
import { EMAIL_TITOLARE } from '@/lib/percorso/consensi'

/** «I tuoi consensi» of the fake client: the same page of /percorso/consensi. */
export default function ConsensiProva() {
  const { percorso } = useProva()
  return (
    <CorniceCliente>
      <ConsensiCliente consensi={percorso.consensi} emailTitolare={EMAIL_TITOLARE} />
    </CorniceCliente>
  )
}
