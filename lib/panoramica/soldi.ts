/**
 * The money eye of the Panoramica (Dany, 27/10/2026: «con un occhietto di nascondere tutta la tab
 * relativa ai soldi e farla riapparire quando voglio io»): a cookie of the interface, per device,
 * read by the server so the page never flashes the numbers before hiding them.
 */
export const COOKIE_SOLDI = 'alpha_soldi'
export const SOLDI_NASCOSTI = 'nascosti'

export function soldiNascosti(valore: string | undefined): boolean {
  return valore === SOLDI_NASCOSTI
}
