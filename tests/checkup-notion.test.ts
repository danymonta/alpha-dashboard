import { describe, expect, it } from 'vitest'

import {
  dataDaCifre,
  leggiData,
  lineeRicorrenti,
  normalizzaNome,
  pulisci,
  separa,
  sqlImportCheckup,
  vociDaPagina,
  type PaginaCheckup,
} from '@/lib/percorso/da-notion-checkup'

// Invented pages only: never a real student, never a real link.
const FATHOM = 'https://fathom.video/share/AbcInventato_123'

function pagina(contenuto: string, allievo = 'Mario Rossi'): PaginaCheckup {
  return { notion_id: 'aaaabbbbccccddddeeeeffff00001111', allievo, contenuto }
}

const INTESTAZIONE = `MAPPARE IN QUESTO DOCUMENTO tutte le informazioni impattanti sul percorso divisi per data come:

- reclami e lamentele cliente

---
`

describe('dates of the titles', () => {
  it('reads the three forms', () => {
    expect(leggiData('230326 [Checkpoint](https://fathom.video/share/x1)')).toBe('2026-03-23')
    expect(leggiData('17062026 Checkpoint')).toBe('2026-06-17')
    expect(leggiData('<b>20/01/2026</b> CALL CON DANY')).toBe('2026-01-20')
    expect(leggiData('Kickoff 31082026 [Call](https://fathom.video/share/x2)')).toBe('2026-08-31')
  })

  it('forgives the typos of the real pages', () => {
    expect(dataDaCifre('1407226')).toBe('2026-07-14')
    expect(dataDaCifre('030920126')).toBe('2026-09-03')
    expect(dataDaCifre('140714072026')).toBe('2026-07-14')
  })

  it('never reads a date from a link or a placeholder', () => {
    expect(leggiData('[https://fathom.video/share/12345678](https://fathom.video/share/12345678)')).toBeNull()
    expect(leggiData('nn/NN/2026 Checkpoint call con Il Coach')).toBeNull()
    expect(leggiData('xx/03/2026')).toBeNull()
    expect(leggiData('ONBOARDING CALL #2')).toBeNull()
    expect(leggiData('31/02/2026')).toBeNull()
  })
})

describe('recap and tasks', () => {
  it('splits the recap, the tasks and the notes', () => {
    const corpo = `Note prima della call

Mario, grazie della call, oggi abbiamo parlato di questo topic principale: alzare le calorie.

I tuoi compiti entro la nostra prossima call:

- Traccia il peso ogni lunedì
- Carica le foto
- X

Altre note dopo`
    const s = separa(corpo)
    expect(s.resoconto).toBe('Mario, grazie della call, oggi abbiamo parlato di questo topic principale: alzare le calorie.')
    expect(s.argomento).toBe('alzare le calorie')
    expect(s.compiti).toEqual(['Traccia il peso ogni lunedì', 'Carica le foto'])
    expect(s.resto).toContain('Note prima della call')
    expect(s.resto).toContain('Altre note dopo')
    expect(s.resto).not.toContain('Traccia il peso')
  })

  it('reads an HTML list and a recap after other notes on the same line', () => {
    const corpo = `<ul>
<li>
domanda finale?<br /><br />Luca, grazie della call, oggi abbiamo parlato di questo topic principale: la dieta.
</li>
</ul>

I tuoi compiti entro la nostra prossima call:

<ul>
<li>
Compila i questionari<br />ogni sera
</li>
<li></li>
</ul>`
    const s = separa(corpo)
    expect(s.argomento).toBe('la dieta')
    expect(s.compiti).toEqual(['Compila i questionari ogni sera'])
    expect(s.resto).toContain('domanda finale?')
  })

  it('treats the template recap as no recap', () => {
    const s = separa('Nome, grazie della call, oggi abbiamo parlato di questo topic principale: x.\n\nI tuoi compiti entro la nostra prossima call:\n\n- X\n- Y\n- La prossima call sarà il X alle yy.zz.')
    expect(s.resoconto).toBeNull()
    expect(s.argomento).toBeNull()
    expect(s.compiti).toEqual([])
  })
})

describe('entries of a page', () => {
  const contenuto = `${INTESTAZIONE}
<toggle heading="h3">
17062026 [Checkpoint Periodico Con Il Coach (Mario Rossi)](${FATHOM})

Peso da 70 a 71

Mario, grazie della call, oggi abbiamo parlato di questo topic principale: progressi del mese.

I tuoi compiti entro la nostra prossima call:

- Alza a 2600 kcal
</toggle>

<toggle heading="h3">
110226 Rinnovo Dani

<toggle heading="h3">
230126 [Call](https://fathom.video/share/Annidata_1)

dentro
</toggle>
appunti del rinnovo
</toggle>

<toggle heading="h2">
01/01/2025 Template checkpoint call con Il Coach

Nome, grazie della call, oggi abbiamo parlato di questo topic principale: x.
</toggle>

<toggle heading="h2">
<b>NEPQ MOD V2: ESEMPI DI DOMANDE</b>

domande
</toggle>

<toggle>
Info sales call

note di vendita
</toggle>

<toggle heading="h3">
08122026

<p />
</toggle>

## <b>12/06/2025 CHECK UP 9 MESI</b>

testo della sezione con un'immagine <image source="notion-file-block://x" />
`

  it('finds the dated toggles, the nested ones and the sections, skips guides and empty templates', () => {
    const { voci, scartate } = vociDaPagina(pagina(contenuto))
    expect(voci.map((v) => v.giorno)).toEqual(['2025-06-12', '2026-01-23', '2026-02-11', '2026-06-17'])

    const giugno = voci.find((v) => v.giorno === '2026-06-17')!
    expect(giugno.fathomUrl).toBe(FATHOM)
    expect(giugno.argomento).toBe('progressi del mese')
    expect(giugno.compiti).toEqual(['Alza a 2600 kcal'])
    expect(giugno.appunti).toContain('Peso da 70 a 71')
    expect(giugno.rif).toBe('aaaabbbbccccddddeeeeffff00001111:2026-06-17')

    const rinnovo = voci.find((v) => v.giorno === '2026-02-11')!
    expect(rinnovo.conDany).toBe(true)
    expect(rinnovo.appunti).toContain('appunti del rinnovo')
    expect(rinnovo.appunti).not.toContain('dentro')

    const sezione = voci.find((v) => v.giorno === '2025-06-12')!
    expect(sezione.appunti).toContain('[Immagine: è nella pagina su Notion]')

    const motivi = scartate.map((s) => s.motivo).sort()
    expect(motivi).toEqual(['guida', 'guida', 'guida', 'vuota'])
  })

  it('numbers two check-ups of the same day', () => {
    const doppia = `<toggle>\n050526 prima\n\nappunti uno\n</toggle>\n<toggle>\n050526 seconda\n\nappunti due\n</toggle>`
    const { voci } = vociDaPagina(pagina(doppia))
    expect(voci.map((v) => v.rif)).toEqual(['aaaabbbbccccddddeeeeffff00001111:2026-05-05', 'aaaabbbbccccddddeeeeffff00001111:2026-05-05:2'])
  })

  it('a template with only the coach’s repeated lines is empty', () => {
    const modello = '<toggle>\n200826\n\nSu quale esercizio senti di stare avendo più difficoltà?\n</toggle>'
    const pagine = [1, 2, 3, 4].map((n) => ({ ...pagina(modello), notion_id: `${n}`.padStart(32, '0') }))
    const ricorrenti = lineeRicorrenti(pagine)
    const { voci, scartate } = vociDaPagina(pagine[0]!, { ricorrenti })
    expect(voci).toEqual([])
    expect(scartate).toEqual([{ motivo: 'vuota', titolo: '200826' }])
  })
})

describe('text and names', () => {
  it('cleans Notion markup', () => {
    expect(pulisci('<b>Peso</b><br />70 \\_kg\\_ <span color="blue">ok</span>\n- ..\n<p />')).toBe('**Peso**\n70 _kg_ ok')
  })

  it('compares names as the SQL does', () => {
    expect(normalizzaNome('  Nicolò   D’Ambra ')).toBe("nicolo d'ambra")
    expect(normalizzaNome('Gianluigi Madè')).toBe('gianluigi made')
  })
})

describe('SQL', () => {
  it('is one idempotent transaction that matches by name and writes as the first admin', () => {
    const { voci } = vociDaPagina(
      pagina(`<toggle>\n230326 [Call](${FATHOM})\n\nMario, grazie della call, oggi abbiamo parlato di questo topic principale: test.\n</toggle>`),
    )
    const sql = sqlImportCheckup([{ allievo: "Mario D'Rossi", voci }])
    expect(sql.startsWith('-- Import')).toBe(true)
    expect(sql).toContain('begin;')
    expect(sql.trim().endsWith('commit;')).toBe(true)
    expect(sql).toContain("p.ruolo = 'admin' and p.attivo")
    expect(sql).toContain("= 'mario d''rossi'")
    expect(sql).toContain('on conflict (notion_rif) do nothing')
    expect(sql).toContain(FATHOM)
  })

  it('refuses a text that would close its own quote', () => {
    const { voci } = vociDaPagina(pagina('<toggle>\n230326\n\nnote $alpha_checkup$ fuori\n</toggle>'))
    expect(() => sqlImportCheckup([{ allievo: 'Mario Rossi', voci }])).toThrow()
  })
})
