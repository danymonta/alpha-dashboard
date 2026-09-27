/**
 * What a deletion takes with it, in words. The numbers come from
 * public.anteprima_eliminazione (SQL); this file only phrases them.
 */
export type TipoEliminazione = 'persona' | 'cliente' | 'vendita' | 'lead' | 'prodotto' | 'reparto'

type Dati = Record<string, number | string | null | undefined>

function n(dati: Dati, chiave: string): number {
  return Number(dati[chiave] ?? 0)
}

function conta(quanti: number, uno: string, tanti: string) {
  return `${quanti} ${quanti === 1 ? uno : tanti}`
}

export function frasiAnteprima(tipo: TipoEliminazione, dati: Dati): string[] {
  const frasi: string[] = []
  switch (tipo) {
    case 'persona': {
      const propri = [
        n(dati, 'report') && conta(n(dati, 'report'), 'report giornaliero', 'report giornalieri'),
        n(dati, 'regole') && conta(n(dati, 'regole'), 'regola provvigionale', 'regole provvigionali'),
        n(dati, 'pagamenti_provvigioni') &&
          conta(n(dati, 'pagamenti_provvigioni'), 'pagamento di provvigioni', 'pagamenti di provvigioni'),
        n(dati, 'voci_tempo') && conta(n(dati, 'voci_tempo'), 'voce di tempo', 'voci di tempo'),
        n(dati, 'note') && conta(n(dati, 'note'), 'nota nei progetti', 'note nei progetti'),
      ].filter(Boolean)
      if (propri.length > 0) frasi.push(`Si eliminano anche: ${propri.join(', ')}.`)
      const collegati = [
        n(dati, 'vendite') && conta(n(dati, 'vendite'), 'vendita', 'vendite'),
        n(dati, 'call') && conta(n(dati, 'call'), 'call', 'call'),
        n(dati, 'lead') && conta(n(dati, 'lead'), 'lead', 'lead'),
      ].filter(Boolean)
      if (collegati.length > 0) frasi.push(`Restano, senza il suo nome come setter o closer: ${collegati.join(', ')}.`)
      if (n(dati, 'progetti') > 0) frasi.push(`Esce da ${conta(n(dati, 'progetti'), 'progetto', 'progetti')}.`)
      frasi.push('Non potrà più entrare, a meno di un nuovo invito.')
      break
    }
    case 'cliente':
      if (n(dati, 'vendite') > 0) {
        frasi.push(
          `Si eliminano anche ${conta(n(dati, 'vendite'), 'vendita', 'vendite')} e ${conta(n(dati, 'rate'), 'rata', 'rate')}` +
            (n(dati, 'rate') > 0 ? `, con ${dati.incassato ?? '0,00 €'} già incassati.` : '.'),
        )
      }
      frasi.push('I numeri dei mesi passati cambiano di conseguenza.')
      break
    case 'vendita':
      frasi.push(
        `Si eliminano anche ${conta(n(dati, 'rate'), 'rata', 'rate')}` +
          (n(dati, 'rate_incassate') > 0
            ? `, di cui ${n(dati, 'rate_incassate')} incassate (${dati.incassato ?? '0,00 €'}).`
            : '.'),
      )
      frasi.push('Cash, revenue e provvigioni dei mesi coinvolti cambiano di conseguenza.')
      break
    case 'lead':
      if (n(dati, 'call') > 0) frasi.push(`Si eliminano anche ${conta(n(dati, 'call'), 'call', 'call')}.`)
      if (n(dati, 'clienti_collegati') > 0) frasi.push('Il cliente nato da questo lead resta, con le sue vendite.')
      break
    case 'prodotto':
      if (n(dati, 'vendite') > 0) {
        frasi.push(`${conta(n(dati, 'vendite'), 'vendita resta', 'vendite restano')} con il nome del prodotto.`)
      }
      if (n(dati, 'call') > 0) frasi.push(`${conta(n(dati, 'call'), 'call perde', 'call perdono')} il prodotto proposto.`)
      break
    case 'reparto':
      if (n(dati, 'progetti') > 0) {
        frasi.push(`Ha ancora ${conta(n(dati, 'progetti'), 'progetto', 'progetti')}: spostali in un altro reparto o eliminali prima.`)
      }
      if (n(dati, 'modelli') > 0) frasi.push(`Si eliminano anche ${conta(n(dati, 'modelli'), 'modello', 'modelli')}.`)
      break
  }
  return frasi
}

/** A department with projects cannot be deleted: the preview says so before trying. */
export function eliminazioneBloccata(tipo: TipoEliminazione, dati: Dati): boolean {
  return tipo === 'reparto' && n(dati, 'progetti') > 0
}
