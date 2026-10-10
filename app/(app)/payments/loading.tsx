import {
  Scheletro,
  ScheletroChip,
  ScheletroIntestazione,
  ScheletroNumeri,
  ScheletroRighe,
} from '@/components/stati/scheletri'

/** Incassi: what is still to collect, the cash forecast, the views, the instalments. */
export default function Loading() {
  return (
    <Scheletro etichetta="Caricamento degli incassi">
      <ScheletroIntestazione />
      <ScheletroNumeri titolo={false} quanti={3} grande />
      <ScheletroNumeri quanti={3} />
      <ScheletroChip quanti={4} />
      <ScheletroRighe quante={6} />
    </Scheletro>
  )
}
