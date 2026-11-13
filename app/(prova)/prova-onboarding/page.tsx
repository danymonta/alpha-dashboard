'use client'

import { CorniceCliente } from './cornice-cliente'
import { useProva } from '@/components/percorso/prova/prova-provider'
import { CampoBaseCliente } from '@/components/percorso/campo-base/campo-base'

/** The client's home base, from the memory of the test: the same CampoBaseCliente of /percorso (1.83.0). */
export default function PaginaProva() {
  const { percorso, campo } = useProva()
  return (
    <CorniceCliente>
      <CampoBaseCliente percorso={percorso} campo={campo} />
    </CorniceCliente>
  )
}
