/**
 * What a deletion takes with it, in words. The numbers come from
 * public.anteprima_eliminazione (SQL); this file only phrases them, in Italian
 * or, with the flag on English (1.62.0), in English. The amount cashed comes
 * formatted by the SQL, in Italian: it is shown as it is.
 */
import type { Lingua } from '@/lib/i18n/lingua'

export type TipoEliminazione = 'persona' | 'cliente' | 'vendita' | 'lead' | 'prodotto' | 'reparto' | 'onboarding'

// the SQL sends counts, the cashed amount as text and, for the onboarding, a boolean
type Dati = Record<string, number | string | boolean | null | undefined>

function n(dati: Dati, chiave: string): number {
  return Number(dati[chiave] ?? 0)
}

/** The SQL sends the cashed amount already formatted ("0,00 €" when nothing came in). */
function incassato(dati: Dati) {
  return typeof dati.incassato === 'string' && !/^0,00\s/.test(dati.incassato)
}

function conta(quanti: number, uno: string, tanti: string) {
  return `${quanti} ${quanti === 1 ? uno : tanti}`
}

export function frasiAnteprima(tipo: TipoEliminazione, dati: Dati, lingua: Lingua = 'it'): string[] {
  if (lingua === 'en') return frasiInglese(tipo, dati)
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
            (incassato(dati) ? `, con ${dati.incassato} già incassati.` : '.'),
        )
      }
      frasi.push('I numeri dei mesi passati cambiano di conseguenza.')
      if (n(dati, 'cartella_drive') > 0) frasi.push('Si toglie anche il link alla sua cartella Drive: la cartella su Drive resta.')
      if (n(dati, 'progetti') > 0) frasi.push('Il suo progetto in Progetti resta, senza il collegamento al cliente.')
      // 1.77.0: the invite, the path, the steps, the log and Telegram go with the client
      if (n(dati, 'onboarding') > 0) frasi.push('Si elimina anche il suo onboarding: link, passi e registro.')
      // 1.79.0: the client's access to the path (its user goes too)
      if (n(dati, 'accesso_cliente') > 0 && n(dati, 'questionario') > 0) {
        // 1.80.0: the questionnaire and its files, with the access
        frasi.push('Si perdono anche il suo accesso al percorso, il questionario e i file caricati.')
      } else if (n(dati, 'accesso_cliente') > 0) frasi.push('Si perde anche il suo accesso al percorso.')
      else if (n(dati, 'questionario') > 0) frasi.push('Si perdono anche il questionario e i file caricati.')
      break
    case 'onboarding':
      // «Elimina onboarding» (1.79.0): only before the client registers
      {
        const task = n(dati, 'task_onboarding')
        frasi.push(
          task === 0
            ? 'Si tolgono il link, gli step, il team incaricato e il registro.'
            : `Si tolgono il link, gli step, il team incaricato, il registro e ${task === 1 ? 'il task' : `i ${task} task`} della lista «Onboarding».`,
        )
      }
      frasi.push('Cliente, vendita, rate e progetto restano.')
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

function contaEn(quanti: number, uno: string, tanti: string) {
  return `${quanti} ${quanti === 1 ? uno : tanti}`
}

/** The same sentences in English. */
function frasiInglese(tipo: TipoEliminazione, dati: Dati): string[] {
  const frasi: string[] = []
  switch (tipo) {
    case 'persona': {
      const propri = [
        n(dati, 'report') && contaEn(n(dati, 'report'), 'daily report', 'daily reports'),
        n(dati, 'regole') && contaEn(n(dati, 'regole'), 'commission rule', 'commission rules'),
        n(dati, 'pagamenti_provvigioni') &&
          contaEn(n(dati, 'pagamenti_provvigioni'), 'commission payment', 'commission payments'),
        n(dati, 'voci_tempo') && contaEn(n(dati, 'voci_tempo'), 'time entry', 'time entries'),
        n(dati, 'note') && contaEn(n(dati, 'note'), 'project note', 'project notes'),
      ].filter(Boolean)
      if (propri.length > 0) frasi.push(`Also deleted: ${propri.join(', ')}.`)
      const collegati = [
        n(dati, 'vendite') && contaEn(n(dati, 'vendite'), 'sale', 'sales'),
        n(dati, 'call') && contaEn(n(dati, 'call'), 'call', 'calls'),
        n(dati, 'lead') && contaEn(n(dati, 'lead'), 'lead', 'leads'),
      ].filter(Boolean)
      if (collegati.length > 0) frasi.push(`These stay, without their name as setter or closer: ${collegati.join(', ')}.`)
      if (n(dati, 'progetti') > 0) frasi.push(`They leave ${contaEn(n(dati, 'progetti'), 'project', 'projects')}.`)
      frasi.push('They will not be able to log in again, unless invited again.')
      break
    }
    case 'cliente':
      if (n(dati, 'vendite') > 0) {
        frasi.push(
          `Also deleted: ${contaEn(n(dati, 'vendite'), 'sale', 'sales')} and ${contaEn(n(dati, 'rate'), 'instalment', 'instalments')}` +
            (incassato(dati) ? `, with ${dati.incassato} already cashed.` : '.'),
        )
      }
      frasi.push('The numbers of past months change accordingly.')
      if (n(dati, 'cartella_drive') > 0) frasi.push('The link to their Drive folder goes too: the folder on Drive stays.')
      if (n(dati, 'progetti') > 0) frasi.push('Their project in Projects stays, without the link to the client.')
      if (n(dati, 'onboarding') > 0) frasi.push('Their onboarding goes too: link, steps and log.')
      if (n(dati, 'accesso_cliente') > 0 && n(dati, 'questionario') > 0) {
        frasi.push('Their access to the path, the questionnaire and the uploaded files go too.')
      } else if (n(dati, 'accesso_cliente') > 0) frasi.push('Their access to the path goes too.')
      else if (n(dati, 'questionario') > 0) frasi.push('The questionnaire and the uploaded files go too.')
      break
    case 'onboarding':
      {
        const task = n(dati, 'task_onboarding')
        frasi.push(
          task === 0
            ? 'The link, the steps, the team in charge and the log go.'
            : `The link, the steps, the team in charge, the log and ${task === 1 ? 'the task' : `the ${task} tasks`} of the «Onboarding» list go.`,
        )
      }
      frasi.push('Client, sale, instalments and project stay.')
      break
    case 'vendita':
      frasi.push(
        `Also deleted: ${contaEn(n(dati, 'rate'), 'instalment', 'instalments')}` +
          (n(dati, 'rate_incassate') > 0
            ? `, of which ${n(dati, 'rate_incassate')} cashed (${dati.incassato ?? '0,00 €'}).`
            : '.'),
      )
      frasi.push('Cash, revenue and commissions of the months involved change accordingly.')
      break
    case 'lead':
      if (n(dati, 'call') > 0) frasi.push(`Also deleted: ${contaEn(n(dati, 'call'), 'call', 'calls')}.`)
      if (n(dati, 'clienti_collegati') > 0) frasi.push('The client born from this lead stays, with their sales.')
      break
    case 'prodotto':
      if (n(dati, 'vendite') > 0) {
        frasi.push(`${contaEn(n(dati, 'vendite'), 'sale keeps', 'sales keep')} the product's name.`)
      }
      if (n(dati, 'call') > 0) frasi.push(`${contaEn(n(dati, 'call'), 'call loses', 'calls lose')} the proposed product.`)
      break
    case 'reparto':
      if (n(dati, 'progetti') > 0) {
        frasi.push(`It still has ${contaEn(n(dati, 'progetti'), 'project', 'projects')}: move them to another department or delete them first.`)
      }
      if (n(dati, 'modelli') > 0) frasi.push(`Also deleted: ${contaEn(n(dati, 'modelli'), 'template', 'templates')}.`)
      break
  }
  return frasi
}

/** A department with projects cannot be deleted: the preview says so before trying. */
export function eliminazioneBloccata(tipo: TipoEliminazione, dati: Dati): boolean {
  // an onboarding whose client has registered stops with «Revoca», never with a tap (1.79.0)
  return (tipo === 'reparto' && n(dati, 'progetti') > 0) || (tipo === 'onboarding' && n(dati, 'accesso_cliente') > 0)
}
