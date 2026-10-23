import {
  Scheletro,
  ScheletroChip,
  ScheletroIntestazione,
  ScheletroNumeri,
  ScheletroRighe,
} from '@/components/stati/scheletri'
import { getLingua } from '@/lib/i18n/server'
import { INCASSI } from '@/lib/i18n/testi/incassi'

/** Incassi: what is still to collect, the cash forecast, the views, the instalments. */
export default async function Loading() {
  const t = INCASSI[await getLingua()]
  return (
    <Scheletro etichetta={t.caricamento}>
      <ScheletroIntestazione />
      <ScheletroNumeri titolo={false} quanti={3} grande />
      <ScheletroNumeri quanti={3} />
      <ScheletroChip quanti={4} />
      <ScheletroRighe quante={6} />
    </Scheletro>
  )
}
