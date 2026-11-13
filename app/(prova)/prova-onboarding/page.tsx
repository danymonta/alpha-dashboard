'use client'

import { CorniceCliente } from './cornice-cliente'
import { useProva } from '@/components/percorso/prova/prova-provider'
import { VistaPercorso } from '@/components/percorso/vista-percorso'

/** The client's path, from the memory of the test: the same VistaPercorso of /percorso. */
export default function PaginaProva() {
  const { percorso } = useProva()
  return (
    <CorniceCliente>
      <VistaPercorso percorso={percorso} />
    </CorniceCliente>
  )
}
