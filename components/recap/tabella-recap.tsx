import { formato, VUOTO } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { RECAP } from '@/lib/i18n/testi/recap'
import {
  CHIAVI_EURO,
  COLONNE_CLOSING,
  COLONNE_SETTING,
  giornoVuoto,
  type ChiaveGiorno,
  type GiornoRecap,
  type NumeriGiorno,
} from '@/lib/recap/recap'
import { cn } from '@/lib/utils'

/**
 * The month of the sales recap as the Excel sheet (1.59.0): one row per day, every day of
 * the month (the empty ones muted, the future with «–»), a SETTING and a CLOSING group of
 * columns, the month's total sticking at the bottom. The table scrolls inside its own frame,
 * never the page: on a phone the day column stays on the left. Numbers from recap_mese().
 */
export function TabellaRecap({
  giorni,
  totali,
  oggi,
  lingua,
}: {
  giorni: GiornoRecap[]
  totali: NumeriGiorno
  oggi: string
  lingua: Lingua
}) {
  const t = RECAP[lingua]
  const f = formato(lingua)
  // a zero is a plain muted 0, in euro columns too: the sheet stays readable at a glance
  const valore = (k: ChiaveGiorno, n: NumeriGiorno) =>
    CHIAVI_EURO.has(k) && n[k] !== 0 ? f.formatEuro(n[k], { compatto: true }) : f.formatNumero(n[k])
  const bordoGruppo = (k: ChiaveGiorno) => (k === COLONNE_SETTING[0] || k === COLONNE_CLOSING[0] ? 'border-l border-border' : '')
  const colonne = [...COLONNE_SETTING, ...COLONNE_CLOSING]

  return (
    <section aria-labelledby="titolo-tabella" className="min-w-0 space-y-3 rounded-xl bg-card p-4" data-testid="recap-tabella">
      <div className="min-w-0">
        <h2 id="titolo-tabella" className="text-sm font-medium">
          {t.tabellaTitolo}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.tabellaDescrizione}</p>
      </div>
      {/* the frame scrolls both ways: the header sticks on top, the total at the bottom, the day on the left */}
      <div className="max-h-[75dvh] overflow-auto rounded-lg border border-border" tabIndex={0} role="region" aria-labelledby="titolo-tabella">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t.tabellaTitolo}</caption>
          <thead className="sticky top-0 z-20 bg-card text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="sticky left-0 z-30 bg-card" />
              <th scope="colgroup" colSpan={COLONNE_SETTING.length} className="border-l border-border px-1.5 pt-2 text-left font-semibold text-foreground">
                {t.gruppi.setting}
              </th>
              <th scope="colgroup" colSpan={COLONNE_CLOSING.length} className="border-l border-border px-1.5 pt-2 text-left font-semibold text-foreground">
                {t.gruppi.closing}
              </th>
            </tr>
            <tr>
              <th scope="col" className="sticky left-0 z-30 border-b border-border bg-card px-1.5 py-2 text-left font-normal">
                {t.tabellaGiorno}
              </th>
              {colonne.map((k) => (
                <th
                  key={k}
                  scope="col"
                  className={cn('border-b border-border px-1.5 py-2 text-right font-normal whitespace-nowrap', bordoGruppo(k))}
                >
                  {t.colonne[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {giorni.map((g) => {
              const futuro = g.giorno > oggi
              const vuoto = !futuro && giornoVuoto(g)
              const eOggi = g.giorno === oggi
              return (
                <tr key={g.giorno} className={cn(futuro || vuoto ? 'text-muted-foreground' : '', eOggi && 'font-medium')} data-giorno={g.giorno}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-border bg-card px-1.5 py-1.5 text-left font-normal whitespace-nowrap"
                  >
                    <span className="num">{t.dataCorta(g.giorno)}</span>
                    {eOggi ? <span className="ml-1.5 text-xs font-medium text-rosso-testo">{t.oggi}</span> : null}
                  </th>
                  {colonne.map((k) => (
                    <td
                      key={k}
                      className={cn(
                        'num border-b border-border px-1.5 py-1.5 text-right whitespace-nowrap',
                        bordoGruppo(k),
                        !futuro && g[k] === 0 && 'text-muted-foreground/50',
                        k === 'dm_totali' || k === 'chiuse' ? 'font-medium' : '',
                      )}
                    >
                      {futuro ? VUOTO : valore(k, g)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-card font-semibold">
            <tr>
              <th scope="row" className="sticky left-0 z-30 border-t border-border bg-card px-1.5 py-2 text-left whitespace-nowrap">
                {t.tabellaTotale}
              </th>
              {colonne.map((k) => (
                <td key={k} className={cn('num border-t border-border px-1.5 py-2 text-right whitespace-nowrap', bordoGruppo(k))}>
                  {valore(k, totali)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t.notaCash}</p>
    </section>
  )
}
