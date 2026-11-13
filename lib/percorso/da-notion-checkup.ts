/**
 * The check-ups written in Notion («Checkup mensile | Nome» of every student of «Allievi Alpha»)
 * become rows of clienti_checkup and clienti_checkup_appunti (1.83.0, CLAUDE.md section 34).
 * Pure functions: the script (scripts/import-checkup-notion.ts) reads the pages Claude fetched,
 * this file turns them into entries and into an idempotent SQL file. Never a database, never a log
 * with the text of a page.
 *
 * A check-up is a dated block of the page: a toggle whose title starts with a date (230326,
 * 17062026, 17/06/2026, with the typos of the real pages), or a «## <b>date …</b>» section outside the
 * toggles. Inside: the Fathom link (title first), the recap («…, grazie della call, oggi abbiamo
 * parlato di…»), the tasks (the list under «I tuoi compiti entro…»), and everything else is notes.
 * The coach's guides (NEPQ, sales call, the templates) and the empty templates are skipped.
 */

export type PaginaCheckup = {
  notion_id: string
  allievo: string | null
  contenuto: string
}

export type VoceCheckup = {
  rif: string
  giorno: string
  titolo: string
  fathomUrl: string | null
  argomento: string | null
  resoconto: string | null
  compiti: string[]
  appunti: string | null
  /** the call was held by Dany (the title says so): the import gives it to the admin */
  conDany: boolean
}

export type MotivoScarto = 'senza_data' | 'data_segnaposto' | 'vuota' | 'guida'

export type Scartata = { motivo: MotivoScarto; titolo: string }

export const LIMITI = {
  argomento: 200,
  resoconto: 8000,
  compiti: 20,
  compito: 300,
  appunti: 30000,
  fathom: 500,
} as const

/** The fake date of the Notion templates («01/01/2025 Template …»): not a real call. */
export const DATA_SEGNAPOSTO = '2025-01-01'
const DATA_MIN = '2024-01-01'
const DATA_MAX = '2027-12-31'

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Notion's escapes (\[ \] \| \_ \~ \< \: …) back to the character. */
export function togliEscape(t: string): string {
  return t.replace(/\\([[\]|_~<>:*#`()\\\-.!{}+=])/g, '$1')
}

/** Notion's tags to plain Markdown, the images to a placeholder. */
export function pulisci(raw: string): string {
  let t = raw
    .replace(/<page url="[^"]*">[\s\S]*?<\/page>/g, '')
    .replace(/<database [^>]*>[\s\S]*?<\/database>/g, '')
    .replace(/<image [^>]*\/>/g, '[Immagine: è nella pagina su Notion]')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?b>/g, '**')
    .replace(/<\/?i>/g, '*')
    .replace(/<\/?u>/g, '')
    .replace(/<span[^>]*>|<\/span>/g, '')
    .replace(/<callout[^>]*>|<\/callout>/g, '')
    .replace(/<\/?quote>/g, '')
    .replace(/<toggle[^>]*>|<\/toggle>/g, '')
    .replace(/<\/?(ul|ol)>/g, '')
    .replace(/<li>/g, '- ')
    .replace(/<\/li>/g, '')
    .replace(/<p\s*\/>|<\/?p>/g, '')
  t = togliEscape(t)
  const righe = t
    .split('\n')
    .map((r) => r.replace(/\s+$/, ''))
    .map((r) => r.replace(/\*\*\s*\*\*/g, ''))
    .filter((r) => !/^\s*(---|\*\*|-|\.\.|- \.\.)\s*$/.test(r))
  return righe
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** One line of text: tags out, Markdown links to their text (the address when the text is the address). */
function inRiga(raw: string): string {
  return pulisci(raw)
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, testo: string, url: string) => {
      const pulito = testo.replace(/\*/g, '').trim()
      return pulito === '' || pulito === url || url.startsWith(pulito) ? url : pulito
    })
    .replace(/\*\*/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function taglia(t: string, max: number): string {
  if ([...t].length <= max) return t
  const pezzo = [...t].slice(0, max - 1).join('')
  const spazio = pezzo.lastIndexOf(' ')
  return `${(spazio > max * 0.6 ? pezzo.slice(0, spazio) : pezzo).trimEnd()}…`
}

/** A name compared without accents, case, apostrophe kind or extra spaces (the same as the SQL). */
export function normalizzaNome(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function iso(g: number, m: number, a: number): string | null {
  if (a < 100) a += 2000
  if (m < 1 || m > 12 || g < 1 || g > 31) return null
  const d = new Date(Date.UTC(a, m - 1, g))
  if (d.getUTCDate() !== g || d.getUTCMonth() !== m - 1) return null
  const s = `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`
  return s >= DATA_MIN && s <= DATA_MAX ? s : null
}

function daCifre(c: string): string | null {
  if (c.length === 6) return iso(+c.slice(0, 2), +c.slice(2, 4), +c.slice(4, 6))
  if (c.length === 8) return iso(+c.slice(0, 2), +c.slice(2, 4), +c.slice(4, 8))
  return null
}

/** The digits as written, typos included: 1407226 → 14/07/2026, 030920126 → 03/09/2026. */
export function dataDaCifre(c: string): string | null {
  const diretta = daCifre(c)
  if (diretta) return diretta
  if (c.length === 7 || c.length === 9) {
    // one digit too many: a doubled digit first (1407226), then any
    const indici = [...c].map((_, i) => i)
    const ordine = [...indici.filter((i) => c[i] === c[i + 1]), ...indici]
    for (const i of ordine) {
      const d = daCifre(c.slice(0, i) + c.slice(i + 1))
      if (d) return d
    }
  }
  if (c.length > 8) return daCifre(c.slice(-8)) ?? daCifre(c.slice(0, 8)) ?? daCifre(c.slice(0, 6))
  return null
}

/** The first date of a title (links and addresses out), or null. */
export function leggiData(titolo: string): string | null {
  const t = togliEscape(titolo)
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{6,12})/g
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const d = m[4] ? dataDaCifre(m[4]) : iso(+m[1]!, +m[2]!, +m[3]!)
    if (d) return d
  }
  return null
}

// ---------------------------------------------------------------------------
// Blocks of a page
// ---------------------------------------------------------------------------

type Nodo = { titolo: string; righe: string[]; figli: Nodo[] }

/** The toggles of a page as a tree; the lines outside them stay in the root. */
function albero(contenuto: string): Nodo {
  const righe = contenuto.split('\n')
  const radice: Nodo = { titolo: '', righe: [], figli: [] }
  const pila: Nodo[] = [radice]
  for (let i = 0; i < righe.length; i++) {
    const riga = righe[i]!
    const s = riga.trim()
    if (s.startsWith('<toggle')) {
      const nodo: Nodo = { titolo: (righe[i + 1] ?? '').trim(), righe: [], figli: [] }
      pila[pila.length - 1]!.figli.push(nodo)
      // a placeholder so a nested toggle that is not a check-up keeps its place in the notes
      pila[pila.length - 1]!.righe.push(`\u0000${pila[pila.length - 1]!.figli.length - 1}`)
      pila.push(nodo)
      i++
      continue
    }
    if (s === '</toggle>' && pila.length > 1) {
      pila.pop()
      continue
    }
    pila[pila.length - 1]!.righe.push(riga)
  }
  return radice
}

const GUIDE = [/nepq/i, /sales call/i, /template video analisi/i, /template checkpoint call/i, /template kickoff/i]

function eGuida(titolo: string): boolean {
  const t = inRiga(titolo)
  return GUIDE.some((r) => r.test(t))
}

/** The text of a node with its nested toggles that are not check-ups (title in bold). */
function testoNodo(nodo: Nodo, eVoce: (n: Nodo) => boolean): string {
  const fuori: string[] = []
  for (const riga of nodo.righe) {
    if (riga.startsWith('\u0000')) {
      const figlio = nodo.figli[Number(riga.slice(1))]!
      if (eVoce(figlio) || eGuida(figlio.titolo)) continue
      const titolo = inRiga(figlio.titolo)
      if (titolo) fuori.push(`**${titolo}**`)
      fuori.push(testoNodo(figlio, eVoce))
      continue
    }
    fuori.push(riga)
  }
  return fuori.join('\n')
}

function fathomDa(t: string): string | null {
  const s = togliEscape(t)
  const nelLink = /\]\((https:\/\/fathom\.video\/[^)\s]+)\)/.exec(s)
  const nudo = /https:\/\/fathom\.video\/[^\s)\]<>"*]+/.exec(s)
  const url = nelLink?.[1] ?? nudo?.[0] ?? null
  return url && url.length <= LIMITI.fathom ? url : null
}

const SEGNAPOSTO_COMPITO = /^(x|y|z|a|b|c|\.\.|…)$/i

/** The recap and the tasks of a block, and the text without them (the notes). */
export function separa(raw: string): { resoconto: string | null; argomento: string | null; compiti: string[]; resto: string } {
  const righe = raw.split('\n')
  const iRecap = righe.findIndex((r) => /oggi abbiamo parlato/i.test(r))
  if (iRecap < 0) return { resoconto: null, argomento: null, compiti: [], resto: raw }

  // the recap is the piece of its line that holds the sentence (a line can carry other notes before a <br />)
  const pezzi = righe[iRecap]!.split(/<br\s*\/?>/)
  const iPezzo = pezzi.findIndex((p) => /oggi abbiamo parlato/i.test(p))
  const frase = inRiga(pezzi[iPezzo]!).replace(/^[-\d.\s]+/, '').trim()
  const prima = pezzi.slice(0, iPezzo).join('<br />')
  const dopo = pezzi.slice(iPezzo + 1).join('<br />')

  const topic = /topic principale\s*:\s*(.+)$/i.exec(frase) ?? /oggi abbiamo parlato di\s*(.+)$/i.exec(frase)
  let argomento = topic ? topic[1]!.replace(/\.+$/, '').trim() : null
  const segnaposto = argomento !== null && /^x$/i.test(argomento)
  if (segnaposto || argomento === '') argomento = null
  const resoconto = segnaposto ? null : taglia(frase.replace(/\.{2,}$/, '.'), LIMITI.resoconto)

  // the tasks: the list right under «I tuoi compiti …», a few lines after the recap at most
  let iCompiti = -1
  for (let k = iRecap + 1; k < Math.min(righe.length, iRecap + 8); k++) {
    if (/i tuoi compiti|compiti entro/i.test(righe[k]!)) {
      iCompiti = k
      break
    }
  }
  const compiti: string[] = []
  let fineCompiti = iRecap + 1
  if (iCompiti >= 0) {
    let j = iCompiti + 1
    while (j < righe.length && /^\s*(<p>|<\/p>|<p \/>)?\s*$/.test(righe[j]!)) j++
    const voci: string[] = []
    let html = 0
    for (; j < righe.length; j++) {
      const r = righe[j]!
      const s = r.trim()
      if (html > 0 || /^<(ul|ol)>/.test(s)) {
        html += (s.match(/<(ul|ol)>/g) ?? []).length - (s.match(/<\/(ul|ol)>/g) ?? []).length
        if (s.startsWith('<li>')) voci.push('')
        else if (!/^<\/?(ul|ol|li)>$/.test(s) && voci.length > 0) voci[voci.length - 1] += ` ${r}`
        if (html <= 0) {
          j++
          break
        }
        continue
      }
      if (/^(-|\d+\.)\s/.test(s)) voci.push(s.replace(/^(-|\d+\.)\s+/, ''))
      else if (s !== '' && /^\s{2,}/.test(r) && voci.length > 0) voci[voci.length - 1] += ` ${s}`
      else break
    }
    fineCompiti = j
    for (const v of voci) {
      const testo = inRiga(v)
        .replace(/Fuso orario:\s*[\w/]+/gi, '')
        .replace(/Informazioni per partecipare di Google Meet/gi, '')
        .replace(/Link alla videochiamata:\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (!testo || SEGNAPOSTO_COMPITO.test(testo) || /\balle (yy\.zz|n)\.?$/i.test(testo)) continue
      if (compiti.length < LIMITI.compiti) compiti.push(taglia(testo, LIMITI.compito))
    }
  }

  const resto = [
    ...righe.slice(0, iRecap),
    prima,
    dopo,
    ...(iCompiti >= 0 ? [...righe.slice(iRecap + 1, iCompiti), ...righe.slice(fineCompiti)] : righe.slice(iRecap + 1)),
  ].join('\n')
  return { resoconto, argomento: argomento ? taglia(argomento, LIMITI.argomento) : null, compiti, resto }
}

function normaRiga(r: string): string {
  return inRiga(r).toLowerCase()
}

/** The lines that repeat across many pages: the coach's templates, not notes of a client. */
export function lineeRicorrenti(pagine: PaginaCheckup[], minimo = 4): Set<string> {
  const conteggi = new Map<string, number>()
  for (const p of pagine) {
    const viste = new Set(p.contenuto.split('\n').map(normaRiga).filter((r) => r.length > 0))
    for (const r of viste) conteggi.set(r, (conteggi.get(r) ?? 0) + 1)
  }
  return new Set([...conteggi].filter(([, n]) => n >= minimo).map(([r]) => r))
}

/** Notes that say something of their own: a line that is not a template line nor a placeholder. */
function sostanziale(appunti: string, ricorrenti: Set<string>): boolean {
  return appunti
    .split('\n')
    .map(normaRiga)
    .some((r) => {
      const nudo = r.replace(/[*\-:>.\s→…]/g, '')
      return nudo.length > 2 && !ricorrenti.has(r) && !/^(test|update|coach.*|notedipercorso|scalettacall)$/.test(nudo)
    })
}

type Grezza = { titolo: string; corpo: string }

/** The check-up entries of one page, and what was skipped with the reason. */
export function vociDaPagina(
  pagina: PaginaCheckup,
  opzioni: { ricorrenti?: Set<string> } = {},
): { voci: VoceCheckup[]; scartate: Scartata[] } {
  const ricorrenti = opzioni.ricorrenti ?? new Set<string>()
  const radice = albero(pagina.contenuto)
  const eVoce = (n: Nodo) => !eGuida(n.titolo) && leggiData(n.titolo) !== null
  const grezze: Grezza[] = []
  const scartate: Scartata[] = []

  // the toggles, at any depth: a dated one is a check-up, its nested non-dated toggles are its notes
  const visita = (n: Nodo, radiceDiPagina: boolean) => {
    for (const figlio of n.figli) {
      const titolo = inRiga(figlio.titolo)
      if (eGuida(figlio.titolo)) {
        scartate.push({ motivo: 'guida', titolo })
        continue
      }
      if (leggiData(figlio.titolo) !== null) grezze.push({ titolo: figlio.titolo, corpo: testoNodo(figlio, eVoce) })
      else if (radiceDiPagina && figlio.righe.some((r) => r.trim() !== '')) scartate.push({ motivo: 'senza_data', titolo })
      visita(figlio, false)
    }
  }
  visita(radice, true)

  // the «## <b>date …</b>» sections outside the toggles
  let sezione: Grezza | null = null
  for (const riga of radice.righe) {
    if (riga.startsWith('\u0000')) continue
    if (/^#{1,2}\s/.test(riga)) {
      if (sezione) grezze.push(sezione)
      const titolo = riga.replace(/^#+\s*/, '')
      sezione = leggiData(titolo) && !eGuida(titolo) ? { titolo, corpo: '' } : null
      continue
    }
    if (sezione) sezione.corpo += `${riga}\n`
  }
  if (sezione) grezze.push(sezione)

  const voci: VoceCheckup[] = []
  const usati = new Map<string, number>()
  for (const g of grezze) {
    const giorno = leggiData(g.titolo)!
    const titolo = inRiga(g.titolo)
    if (giorno === DATA_SEGNAPOSTO) {
      scartate.push({ motivo: 'data_segnaposto', titolo })
      continue
    }
    const { resoconto, argomento, compiti, resto } = separa(g.corpo)
    const fathomUrl = fathomDa(g.titolo) ?? fathomDa(g.corpo)
    const note = pulisci(resto)
    const appunti = note && sostanziale(note, ricorrenti) ? taglia(note, LIMITI.appunti) : null
    if (!fathomUrl && !resoconto && compiti.length === 0 && !appunti) {
      scartate.push({ motivo: 'vuota', titolo })
      continue
    }
    const n = (usati.get(giorno) ?? 0) + 1
    usati.set(giorno, n)
    voci.push({
      rif: `${pagina.notion_id}:${giorno}${n > 1 ? `:${n}` : ''}`,
      giorno,
      titolo,
      fathomUrl,
      argomento,
      resoconto,
      compiti,
      appunti,
      conDany: /\bdan[iy]\b/i.test(titolo),
    })
  }
  voci.sort((a, b) => (a.giorno < b.giorno ? -1 : a.giorno > b.giorno ? 1 : 0))
  return { voci, scartate }
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const TAG = '$alpha_checkup$'

function letterale(t: string | null): string {
  if (t === null) return 'null'
  if (t.includes(TAG)) throw new Error('Il testo contiene il delimitatore del file SQL')
  return `${TAG}${t}${TAG}`
}

export type GruppoAllievo = { allievo: string; voci: VoceCheckup[] }

/**
 * One idempotent transaction: every student is matched to one client by name and surname
 * (accents, case and apostrophes aside); none or more than one, the student is skipped and named in
 * a notice. A check-up already imported (same notion_rif) is left as it is.
 */
export function sqlImportCheckup(gruppi: GruppoAllievo[]): string {
  const righe: string[] = []
  righe.push('-- Import of the check-ups from Notion (scripts/import-checkup-notion.ts). Real data: never on GitHub.')
  righe.push('-- Run once in the Supabase SQL Editor; running it again creates nothing twice.')
  righe.push('begin;')
  righe.push(`create or replace function pg_temp.alpha_nome(t text) returns text language sql immutable as $f$
  select btrim(regexp_replace(lower(translate(coalesce(t, ''),
    'àáâäèéêëìíîïòóôöùúûüçñÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜÇÑ’‘\`´',
    'aaaaeeeeiiiioooouuuucnaaaaeeeeiiiioooouuuucn''''''''')), '\\s+', ' ', 'g'))
$f$;`)
  righe.push(`do $import$
declare
  v_admin uuid;
  v_cliente uuid;
  v_coach uuid;
  v_n integer;
  v_id uuid;
  v_creati integer := 0;
  v_gia integer := 0;
  v_allievi_saltati integer := 0;
  v_voci_saltate integer := 0;
begin
  select p.id into v_admin from public.profiles p
  where p.ruolo = 'admin' and p.attivo order by p.created_at limit 1;
  if v_admin is null then
    raise exception 'Nessun admin attivo: l''import scrive come il primo admin.';
  end if;`)
  for (const g of gruppi) {
    const nome = normalizzaNome(g.allievo).replace(/'/g, "''")
    righe.push(`
  -- ${g.voci.length} check-up
  select count(*), (array_agg(c.id))[1] into v_n, v_cliente
  from public.clients c
  where pg_temp.alpha_nome(c.nome || ' ' || coalesce(c.cognome, '')) = '${nome}';
  if v_n <> 1 then
    raise notice 'Saltato: % (% clienti con questo nome)', '${g.allievo.replace(/'/g, "''")}', v_n;
    v_allievi_saltati := v_allievi_saltati + 1;
    v_voci_saltate := v_voci_saltate + ${g.voci.length};
  else
    select pr.coach_id into v_coach from public.pm_progetti pr where pr.client_id = v_cliente limit 1;`)
    for (const v of g.voci) {
      righe.push(`    v_id := null;
    insert into public.clienti_checkup (client_id, giorno, coach_id, fathom_url, argomento, resoconto, compiti, notion_rif, created_by)
    values (v_cliente, '${v.giorno}', ${v.conDany ? 'v_admin' : 'v_coach'}, ${letterale(v.fathomUrl)}, ${letterale(v.argomento)},
      ${letterale(v.resoconto)}, ${letterale(JSON.stringify(v.compiti))}::jsonb, '${v.rif}', v_admin)
    on conflict (notion_rif) do nothing
    returning id into v_id;
    if v_id is null then
      v_gia := v_gia + 1;
    else
      v_creati := v_creati + 1;${
        v.appunti === null
          ? ''
          : `
      insert into public.clienti_checkup_appunti (checkup_id, testo, updated_by) values (v_id, ${letterale(v.appunti)}, v_admin);`
      }
    end if;`)
    }
    righe.push('  end if;')
  }
  righe.push(`
  raise notice 'Check-up creati: %, già importati: %, allievi saltati: % (con % check-up).',
    v_creati, v_gia, v_allievi_saltati, v_voci_saltate;
end;
$import$;`)
  righe.push('commit;')
  return `${righe.join('\n')}\n`
}
