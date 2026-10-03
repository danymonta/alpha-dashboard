import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { AZIONI, STRUMENTI } from '@/lib/alfire/permessi'
import { motivoAlModello, motivoPerLaPersona } from '@/lib/alfire/riassunto'
import { SPOSTA } from '@/lib/call/spostamento'

// What a stopped card shows («Non l’ho fatto: …») and what a failed write says
// is for the person: plain Italian, never a tool or a field name (03/10/2026).
// The hint for the model goes apart, in per_alfire.

const RADICE = join(process.cwd(), 'lib/alfire')

function fileTs(cartella: string): string[] {
  return readdirSync(cartella, { withFileTypes: true }).flatMap((f) =>
    f.isDirectory() ? fileTs(join(cartella, f.name)) : f.name.endsWith('.ts') ? [join(cartella, f.name)] : [],
  )
}

type Testo = { dove: string; testo: string }

/**
 * The words of every errore(…) first argument and of unico's `nessuno` and
 * `piu` (its `come` is the model's), as written in the code: the literal
 * parts of strings and templates, and the string constants of the same file
 * they name. What a template fills in (names, dates) is data, not words.
 */
function testiPerLaPersona(): Testo[] {
  const testi: Testo[] = []
  for (const file of fileTs(RADICE)) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const costanti = new Map<string, string>()
    for (const s of src.statements) {
      if (!ts.isVariableStatement(s)) continue
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isStringLiteral(d.initializer) || ts.isNoSubstitutionTemplateLiteral(d.initializer))) {
          costanti.set(d.name.text, d.initializer.text)
        }
      }
    }
    const parole = (nodo: ts.Node): string[] => {
      const r: string[] = []
      const visita = (x: ts.Node) => {
        if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) r.push(x.text)
        else if (ts.isTemplateExpression(x)) {
          r.push(x.head.text)
          for (const s of x.templateSpans) {
            visita(s.expression)
            r.push(s.literal.text)
          }
        } else if (ts.isIdentifier(x) && costanti.has(x.text)) r.push(costanti.get(x.text)!)
        else ts.forEachChild(x, visita)
      }
      visita(nodo)
      return r
    }
    const dove = (n: ts.Node) => `${file.slice(RADICE.length + 1)}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`
    const visita = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'errore' && n.arguments[0]) {
        for (const testo of parole(n.arguments[0])) testi.push({ dove: dove(n), testo })
      }
      if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && ['nessuno', 'piu'].includes(n.name.text)) {
        for (const testo of parole(n.initializer)) testi.push({ dove: dove(n), testo })
      }
      ts.forEachChild(n, visita)
    }
    visita(src)
  }
  return testi
}

const NOMI_STRUMENTI = Object.keys(STRUMENTI)
const AZIONI_STRUMENTI = [...new Set(Object.values(AZIONI).flatMap((perChi) => Object.values(perChi).flat()))]

/** Why a text is the model's and not the person's; null when it reads fine. */
function tecnico(testo: string): string | null {
  const snake = /\b[a-z]+(?:_[a-z]+)+\b/.exec(testo)
  if (snake) return `nome tecnico «${snake[0]}»`
  const azione = new RegExp(`\\bazione (${AZIONI_STRUMENTI.join('|')})\\b`).exec(testo)
  if (azione) return `azione di uno strumento «${azione[0]}»`
  const usa = new RegExp(`\\b(usa|passa) (?:il |lo |la |l’|l')?(${[...NOMI_STRUMENTI, ...AZIONI_STRUMENTI].join('|')})\\b`).exec(testo)
  if (usa) return `istruzione al modello «${usa[0]}»`
  const strumento = new RegExp(`\\((${NOMI_STRUMENTI.join('|')}),`).exec(testo)
  if (strumento) return `strumento tra parentesi «${strumento[0]}»`
  const alModello = /\bChiedi (quale|se)\b|\bNel testo\b|\bl[’']utente\b|\bi bottoni\b/.exec(testo)
  if (alModello) return `frase per il modello «${alModello[0]}»`
  return null
}

describe('i motivi per la persona non hanno nomi tecnici', () => {
  it('il controllo riconosce le frasi per il modello', () => {
    for (const frase of [
      'per spostarla usa nuovo_progetto.',
      'Fermalo (tempo, azione ferma), poi correggi la voce.',
      'Chiedi quale (o passa il voce_id da mio_tempo).',
      'Se sono sbagliati solo il giorno o l’ora, usa modifica',
      'per spostare la call usa azione sposta con data e ora.',
      ' Nel testo elencali tutti: i bottoni ne mostrano 4, l’utente può scrivere il nome.',
      'Indica alla_data.',
    ]) {
      expect(tecnico(frase), frase).not.toBeNull()
    }
    for (const frase of [
      'Puoi lavorare solo i task assegnati a te o creati da te: chiedi a chi gestisce il progetto.',
      'Dimmi la durata, ad esempio 1h30 o 45 min, o la fascia (dalle, alle).',
      'Non hai un timer acceso.',
      'Azione non disponibile.',
    ]) {
      expect(tecnico(frase), frase).toBeNull()
    }
  })

  it('ogni errore di Alfire e ogni elenco di candidati, in parole semplici', () => {
    const testi = testiPerLaPersona()
    // the scan reads the real code: the resolvers' and the tools' messages are there
    expect(testi.length).toBeGreaterThan(150)
    expect(testi.map((t) => t.testo)).toEqual(expect.arrayContaining(['Più task possibili: ', 'Non hai un timer acceso.']))
    const tecnici = testi.flatMap(({ dove, testo }) => {
      const motivo = tecnico(testo)
      return motivo ? [`${dove}: ${motivo}`] : []
    })
    expect(tecnici).toEqual([])
  })

  it('le frasi di «Sposta» che Alfire riporta sono della persona; l’azione resta al modello', () => {
    const frasi = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : frasi(v as object)))
    for (const frase of frasi({ ...SPOSTA, soloLaDataPerAlfire: '' })) expect(tecnico(frase), frase).toBeNull()
    expect(SPOSTA.soloLaDataPerAlfire).toContain('azione modifica')
  })

  it('la scheda fermata manda al modello anche l’indicazione, e mostra solo le parole della persona', () => {
    const fermata = { errore: 'Più clienti possibili: Mario Rossi, Luca Rossi.', per_alfire: 'Chiedi quale, con nome e cognome.' }
    const motivo = motivoAlModello(fermata)
    expect(motivo).toContain('Chiedi quale, con nome e cognome.')
    expect(motivoPerLaPersona(motivo)).toBe('Più clienti possibili: Mario Rossi, Luca Rossi.')
    // without a hint the reason is the person's words as they are
    expect(motivoAlModello({ errore: 'Non hai un timer acceso.' })).toBe('Non hai un timer acceso.')
    expect(motivoPerLaPersona('Non hai un timer acceso.')).toBe('Non hai un timer acceso.')
  })
})
