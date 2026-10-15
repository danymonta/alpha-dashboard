import type { InsightsMedia, MediaLetto } from '@/lib/instagram/contenuti'
import type {
  Archivio,
  BloccoArchiviato,
  CampiBlocco,
  IdentitaChat,
  ProfiloSalvato,
  RigaChatDaSalvare,
  RigaEsecuzione,
  SchedaArchiviata,
} from '@/lib/insight/archivio'
import type {
  CanaleInsight,
  ChatSalvata,
  ContatoriPasso,
  ContestoApp,
  PassoInsight,
  PostInsight,
  ProgressoEsecuzione,
  RigaContenutiDm,
  StatoLeadApp,
  VoceAgendaApp,
} from '@/lib/insight/contratti'
import type { RecapCanale } from '@/lib/insight/recap'

// An archive of the Insight in memory (lib/insight/archivio.ts's interface),
// for the tests of the state machine and of the reading: it behaves like the
// database functions it stands for (insight_passo_finito's merge and
// counters, insight_fallita emptying the messages a failed run read,
// instagram_contenuti_dm_salva's window). Invented data only.

export type EsecuzioneFinta = RigaEsecuzione & {
  passo: PassoInsight
  progresso: ProgressoEsecuzione
  avvisi: string[]
  errore: string | null
  contatori: Record<string, unknown>
  invocazioni: number
}

let progressivo = 0
const nuovoId = () => `00000000-0000-4000-9000-${String(++progressivo).padStart(12, '0')}`

const TOKEN_CONTATORI = ['token_input', 'token_cache_scritti', 'token_cache_letti', 'token_output'] as const

export class ArchivioFinto implements Archivio {
  esecuzioni = new Map<string, EsecuzioneFinta>()
  chat = new Map<string, ChatSalvata>()
  profiliSalvati = new Map<string, ProfiloSalvato>()
  posts: PostInsight[] = []
  mediaIds = new Map<string, string>()
  schede: (SchedaArchiviata & { id: string; ordine: number })[] = []
  blocchiSalvati: (BloccoArchiviato & { usage?: unknown })[] = []
  recap = new Map<string, { esecuzione: string; generatoIl: string; documento: Omit<RecapCanale, 'avvisi' | 'generato_con'>; dettagli: Pick<RecapCanale, 'avvisi' | 'generato_con'> }>()
  conteggi: RigaContenutiDm[] = []
  agendaApp: VoceAgendaApp[] = []
  statiLead: StatoLeadApp[] = []
  instagramToken: string | null = 'IGAAe2eFintoTokenDiProvaPerVitest000000000000'
  messengerToken: string | null = null
  esclusiIg = new Set<string>()
  esclusiFb = new Set<string>()
  storico: string | null = null
  /** what the tests check */
  registro = {
    salvaElenco: [] as MediaLetto[][],
    statistiche: [] as { mediaId: string; statistiche: InsightsMedia }[],
    erroriInstagram: [] as string[],
    erroriMessenger: [] as string[],
    fallite: [] as string[],
    passi: [] as { prossimo: PassoInsight | null; avvisi: string[] }[],
  }
  /** a failure to inject: the name of a method that throws */
  guasti = new Set<keyof Archivio>()
  private ordine = 0

  private controlla(metodo: keyof Archivio) {
    if (this.guasti.has(metodo)) throw new Error(`guasto finto: ${metodo}`)
  }

  /** A run in queue, as insight_richiedi leaves it. */
  creaEsecuzione(giorno: string, creataIl = new Date().toISOString()): string {
    const id = nuovoId()
    this.esecuzioni.set(id, {
      id,
      giorno,
      stato: 'in_coda',
      creata_il: creataIl,
      iniziata_il: null,
      contesto_app: null,
      modello: null,
      token_input: null,
      token_cache_scritti: null,
      token_cache_letti: null,
      token_output: null,
      servito_da_fallback: 0,
      passo: 'lettura',
      progresso: {},
      avvisi: [],
      errore: null,
      contatori: {},
      invocazioni: 0,
    })
    return id
  }

  /** insight_prendi_passo: the step, or null when the run is over. */
  prendiPasso(id: string, adesso = new Date()) {
    const e = this.esecuzioni.get(id)
    if (!e || (e.stato !== 'in_coda' && e.stato !== 'in_corso') || e.invocazioni >= 40) return null
    e.stato = 'in_corso'
    e.invocazioni++
    e.iniziata_il ??= adesso.toISOString()
    for (const b of this.blocchiSalvati) {
      if (b.esecuzione_id !== id || b.stato !== 'in_corso') continue
      b.tentativi++
      b.stato = b.tentativi >= 3 ? 'fallito' : 'da_fare'
      if (b.stato === 'fallito') b.errore = 'interrotto'
    }
    return { passo: e.passo, giorno: e.giorno, motivo: 'manuale', progresso: structuredClone(e.progresso) }
  }

  chatDi(canale: CanaleInsight, conversazioneId: string): ChatSalvata | undefined {
    return this.chat.get(`${canale}|${conversazioneId}`)
  }

  metti(chat: ChatSalvata) {
    this.chat.set(`${chat.canale}|${chat.conversazione_id}`, structuredClone(chat))
  }

  // ---------- the interface ----------

  async esecuzione(id: string) {
    this.controlla('esecuzione')
    const e = this.esecuzioni.get(id)
    return e ? structuredClone(e) : null
  }

  async salvaContesto(id: string, contesto: ContestoApp) {
    this.controlla('salvaContesto')
    const e = this.esecuzioni.get(id)
    if (e) e.contesto_app = structuredClone(contesto)
  }

  async passoFinito(id: string, prossimo: PassoInsight | null, progresso: ProgressoEsecuzione, avvisi: readonly string[], contatori: ContatoriPasso) {
    this.controlla('passoFinito')
    const e = this.esecuzioni.get(id)
    if (!e || (e.stato !== 'in_coda' && e.stato !== 'in_corso')) return false
    e.progresso = { ...e.progresso, ...structuredClone(progresso) }
    for (const a of avvisi) if (!e.avvisi.includes(a)) e.avvisi.push(a)
    for (const [k, v] of Object.entries(contatori)) {
      if ((TOKEN_CONTATORI as readonly string[]).includes(k)) {
        const chiave = k as (typeof TOKEN_CONTATORI)[number]
        e[chiave] = (e[chiave] ?? 0) + Number(v)
      } else if (k === 'servito_da_fallback') e.servito_da_fallback += Number(v)
      else if (k === 'modello') e.modello = String(v)
      else if (k === 'storico_dal') this.storico ??= String(v)
      else e.contatori[k] = v
    }
    if (prossimo === null) e.stato = 'pronta'
    else e.passo = prossimo
    this.registro.passi.push({ prossimo, avvisi: [...avvisi] })
    return true
  }

  async fallita(id: string, errore: string, contatori?: ContatoriPasso) {
    this.controlla('fallita')
    const e = this.esecuzioni.get(id)
    this.registro.fallite.push(errore)
    if (!e || (e.stato !== 'in_coda' && e.stato !== 'in_corso')) return false
    // insight_fallita: the tokens the failed step had spent
    for (const k of TOKEN_CONTATORI) {
      const v = contatori?.[k]
      if (v !== undefined) e[k] = (e[k] ?? 0) + Number(v)
    }
    if (contatori?.servito_da_fallback) e.servito_da_fallback += Number(contatori.servito_da_fallback)
    e.stato = 'fallita'
    e.errore = errore
    // insight_scarta_letture
    for (const c of this.chat.values()) {
      if (c.letta_da !== id) continue
      c.messaggi = []
      c.codici_condivisi = []
      c.aggiornata_il = null
    }
    return true
  }

  async ultimaLetturaRiuscita(escludi: string) {
    const pronte = [...this.esecuzioni.values()].filter((e) => e.stato === 'pronta' && e.id !== escludi && e.iniziata_il)
    return pronte.map((e) => e.iniziata_il as string).sort().at(-1) ?? null
  }

  async storicoDal() {
    return this.storico
  }

  async tokenInstagram() {
    this.controlla('tokenInstagram')
    return this.instagramToken
  }

  async erroreInstagram(messaggio: string) {
    this.registro.erroriInstagram.push(messaggio)
  }

  async tokenMessenger() {
    return this.messengerToken
  }

  async erroreMessenger(messaggio: string) {
    this.registro.erroriMessenger.push(messaggio)
  }

  async esclusi() {
    return { instagram: new Set(this.esclusiIg), messenger: new Set(this.esclusiFb) }
  }

  async chatVuota() {
    return this.chat.size === 0
  }

  async statoChat(canale: CanaleInsight, ids: readonly string[]) {
    const out = new Map<string, { aggiornata_il: string | null; non_lead: boolean; minore_14: boolean }>()
    for (const id of ids) {
      const c = this.chatDi(canale, id)
      if (c) out.set(id, { aggiornata_il: c.aggiornata_il, non_lead: c.non_lead, minore_14: c.minore_14 })
    }
    return out
  }

  async salvaChat(righe: readonly RigaChatDaSalvare[]) {
    this.controlla('salvaChat')
    for (const r of righe) {
      if (r.messaggi.length > 25) throw new Error('messaggi oltre 25')
      const prima = this.chatDi(r.canale, r.conversazione_id)
      const dopo: ChatSalvata = {
        id: prima?.id ?? nuovoId(),
        nome: prima?.nome ?? null,
        origine_tipo: null,
        origine_shortcode: null,
        origine_il: null,
        origine_giorno: null,
        ultimo_target: null,
        minore_14: false,
        ...prima,
        ...structuredClone(r),
      }
      if (dopo.minore_14 && (dopo.messaggi.length > 0 || dopo.codici_condivisi.length > 0)) throw new Error('minore con messaggi')
      if (dopo.non_lead && dopo.messaggi.length > 0) throw new Error('non lead con messaggi')
      this.metti(dopo)
    }
  }

  async identitaChat(canale: CanaleInsight, ids: readonly string[]): Promise<IdentitaChat[]> {
    return ids.flatMap((id) => {
      const c = this.chatDi(canale, id)
      return c ? [{ canale, conversazione_id: id, username: c.username, utente_id: c.utente_id, nome: c.nome }] : []
    })
  }

  async chiaviRecenti(dal: string): Promise<IdentitaChat[]> {
    return [...this.chat.values()]
      .filter((c) => c.ultimo_il !== null && c.ultimo_il >= dal)
      .map((c) => ({ canale: c.canale, conversazione_id: c.conversazione_id, username: c.username, utente_id: c.utente_id, nome: c.nome }))
  }

  async chatLetteSenzaOrigine(esecuzione: string) {
    return [...this.chat.values()]
      .filter((c) => c.letta_da === esecuzione && c.origine_tipo === null && c.completa && !c.non_lead && !c.minore_14)
      .map((c) => structuredClone(c))
  }

  async chatDellEsecuzione({ ids, dal }: { ids: Record<CanaleInsight, readonly string[]>; dal: string }) {
    this.controlla('chatDellEsecuzione')
    return [...this.chat.values()]
      .filter((c) => (c.ultimo_il !== null && Date.parse(c.ultimo_il) >= Date.parse(dal)) || ids[c.canale].includes(c.conversazione_id))
      .map((c) => structuredClone(c))
  }

  async chatPerConteggi(dalGiorno: string) {
    return [...this.chat.values()]
      .filter((c) => c.origine_giorno !== null && c.origine_giorno >= dalGiorno && c.origine_shortcode !== null)
      .map((c) => ({ ...structuredClone(c), messaggi: [] }))
  }

  async aggiornaChat(canale: CanaleInsight, conversazioneId: string, campi: Partial<ChatSalvata>) {
    const c = this.chatDi(canale, conversazioneId)
    if (!c) return
    const dopo = { ...c, ...structuredClone(campi) }
    if (dopo.minore_14 && (dopo.messaggi.length > 0 || dopo.codici_condivisi.length > 0)) throw new Error('minore con messaggi')
    if (dopo.non_lead && dopo.messaggi.length > 0) throw new Error('non lead con messaggi')
    this.metti(dopo)
  }

  async salvaOrigine(canale: CanaleInsight, conversazioneId: string, origine: { tipo: ChatSalvata['origine_tipo']; shortcode: string | null; il: string; giorno: string }) {
    const c = this.chatDi(canale, conversazioneId)
    if (!c || c.origine_tipo !== null) return
    this.metti({ ...c, origine_tipo: origine.tipo, origine_shortcode: origine.shortcode, origine_il: origine.il, origine_giorno: origine.giorno })
  }

  async profili(usernames: readonly string[]) {
    return usernames.flatMap((u) => {
      const p = this.profiliSalvati.get(u)
      return p ? [structuredClone(p)] : []
    })
  }

  async salvaProfili(righe: readonly ProfiloSalvato[]) {
    for (const r of righe) this.profiliSalvati.set(r.username, structuredClone(r))
  }

  async salvaElenco(media: readonly MediaLetto[]) {
    this.registro.salvaElenco.push(structuredClone([...media]))
    for (const m of media) {
      const prima = this.posts.find((p) => p.shortcode === m.shortcode)
      const post: PostInsight = {
        shortcode: m.shortcode,
        permalink: m.permalink,
        pubblicato_il: m.pubblicato_il,
        media_type: m.media_type,
        reel: m.reel,
        didascalia: m.didascalia ?? prima?.didascalia ?? null,
        views: prima?.views ?? null,
        saved: prima?.saved ?? null,
        shares: prima?.shares ?? null,
      }
      this.posts = [...this.posts.filter((p) => p.shortcode !== m.shortcode), post]
    }
    for (const m of media) this.mediaIds.set(m.media_id, m.shortcode)
    return media.length
  }

  async salvaStatistiche(mediaId: string, statistiche: InsightsMedia) {
    this.registro.statistiche.push({ mediaId, statistiche: structuredClone(statistiche) })
    const shortcode = this.mediaIds.get(mediaId)
    const post = this.posts.find((p) => p.shortcode === shortcode)
    if (post) {
      if (statistiche.valori.views !== undefined) post.views = statistiche.valori.views
      if (statistiche.valori.saved !== undefined) post.saved = statistiche.valori.saved
      if (statistiche.valori.shares !== undefined) post.shares = statistiche.valori.shares
    }
  }

  async post(dal: string) {
    return this.posts
      .filter((p) => Date.parse(p.pubblicato_il) >= Date.parse(dal))
      .sort((a, b) => b.pubblicato_il.localeCompare(a.pubblicato_il))
      .map((p) => structuredClone(p))
  }

  async agenda() {
    return structuredClone(this.agendaApp)
  }

  async statoLead(username: readonly string[], nomi: readonly string[]) {
    return this.statiLead.filter((s) => (s.per === 'username' ? username.includes(s.chiave) : nomi.includes(s.chiave))).map((s) => structuredClone(s))
  }

  async schedePrecedenti({ esecuzione, dalGiorno, chiavi }: { esecuzione: string; dalGiorno: string; chiavi: readonly string[] }) {
    return this.schede
      .filter((s) => s.esecuzione_id !== esecuzione && s.giorno >= dalGiorno && chiavi.includes(s.chiave))
      .sort((a, b) => a.ordine - b.ordine)
      .map(({ id, ordine, ...s }) => {
        void id
        void ordine
        return structuredClone(s)
      })
  }

  async schedeUguali({ esecuzione, giorno, canale, impronte, tipi }: { esecuzione: string; giorno: string; canale: CanaleInsight; impronte: readonly string[]; tipi: readonly string[] }) {
    const out = new Map<string, { tipo: SchedaArchiviata['tipo']; dati: unknown }>()
    for (const s of [...this.schede].sort((a, b) => a.ordine - b.ordine)) {
      if (s.esecuzione_id === esecuzione || s.giorno !== giorno || s.canale !== canale || !tipi.includes(s.tipo) || !impronte.includes(s.impronta)) continue
      out.set(s.impronta, { tipo: s.tipo, dati: structuredClone(s.dati) })
    }
    return out
  }

  async salvaSchede(esecuzione: string, giorno: string, canale: CanaleInsight, schede: readonly { tipo: SchedaArchiviata['tipo']; chiave: string; impronta: string; dati: unknown }[]) {
    this.controlla('salvaSchede')
    for (const s of schede) {
      if (!/^[0-9a-f]{64}$/.test(s.impronta)) throw new Error('impronta non valida')
      const i = this.schede.findIndex((x) => x.esecuzione_id === esecuzione && x.canale === canale && x.tipo === s.tipo && x.chiave === s.chiave)
      const riga = { ...structuredClone(s), esecuzione_id: esecuzione, giorno, canale, id: nuovoId(), ordine: ++this.ordine }
      if (i >= 0) this.schede[i] = { ...riga, id: this.schede[i].id, ordine: this.schede[i].ordine }
      else this.schede.push(riga)
    }
  }

  async schedeDellEsecuzione(esecuzione: string) {
    return this.schede
      .filter((s) => s.esecuzione_id === esecuzione)
      .sort((a, b) => a.ordine - b.ordine)
      .map(({ id, ordine, ...s }) => {
        void id
        void ordine
        return structuredClone(s)
      })
  }

  async blocchi(esecuzione: string) {
    return this.blocchiSalvati.filter((b) => b.esecuzione_id === esecuzione).map((b) => structuredClone(b))
  }

  async ripianifica(esecuzione: string) {
    this.blocchiSalvati = this.blocchiSalvati.filter((b) => b.esecuzione_id !== esecuzione)
    this.schede = this.schede.filter((s) => s.esecuzione_id !== esecuzione)
  }

  async inserisciBlocchi(esecuzione: string, blocchi: readonly { canale: CanaleInsight; tipo: BloccoArchiviato['tipo']; indice: number; chiavi: string[] }[]) {
    this.controlla('inserisciBlocchi')
    for (const b of blocchi) {
      if (this.blocchiSalvati.some((x) => x.esecuzione_id === esecuzione && x.canale === b.canale && x.tipo === b.tipo && x.indice === b.indice)) {
        throw new Error('blocco doppio')
      }
      this.blocchiSalvati.push({
        id: nuovoId(),
        esecuzione_id: esecuzione,
        canale: b.canale,
        tipo: b.tipo,
        indice: b.indice,
        chiavi: [...b.chiavi],
        stato: 'da_fare',
        tentativi: 0,
        risultato: null,
        servito_da_fallback: false,
        errore: null,
      })
    }
  }

  async aggiornaBlocco(id: string, campi: CampiBlocco) {
    const b = this.blocchiSalvati.find((x) => x.id === id)
    if (b) Object.assign(b, structuredClone(campi))
  }

  async salvaRecap({ giorno, canale, esecuzione, generatoIl, documento }: { giorno: string; canale: CanaleInsight; esecuzione: string; generatoIl: string; documento: RecapCanale }) {
    this.controlla('salvaRecap')
    if (new TextEncoder().encode(JSON.stringify(documento)).length > 400_000) throw new Error('recap oltre 400 KB')
    // as the real archive: what the setter must not read goes apart (insight_esecuzioni.dettagli_recap, the admin's)
    const { avvisi, generato_con: generatoCon, ...pubblico } = structuredClone(documento)
    this.recap.set(`${giorno}|${canale}`, { esecuzione, generatoIl, documento: pubblico, dettagli: { avvisi, generato_con: generatoCon } })
  }

  /** what the tests check: every call of salvaConteggi, with whether it marked the days */
  chiamateConteggi: { righe: number; segnaGiorni: boolean }[] = []
  /** insight_scarta_minore, as the tests see it */
  minoriScartati: { canale: CanaleInsight; conversazioneId: string; esecuzione: string }[] = []

  /** insight_scarta_minore: the earlier recaps and cards lose what they kept of the chat */
  async scartaMinore(canale: CanaleInsight, conversazioneId: string, esecuzione: string) {
    this.controlla('scartaMinore')
    this.minoriScartati.push({ canale, conversazioneId, esecuzione })
    const chat = this.chatDi(canale, conversazioneId)
    for (const [chiave, r] of this.recap) {
      if (!chiave.endsWith(`|${canale}`)) continue
      r.documento.leads = r.documento.leads.map((l) =>
        l.conversation_id === conversazioneId && l.minore_14 !== true
          ? {
              ...l,
              age: '',
              priority: 'alta' as const,
              target: 'no' as const,
              stage: 'uscita',
              status: 'minore sotto i 14 anni',
              situation: 'Minore sotto i 14 anni.',
              pain: '',
              next_action: 'Chiusura calorosa verso i contenuti gratuiti, nessun altro contatto.',
              suggested_message: '',
              suggested_message_alt: '',
              alt_condition: '',
              source: '',
              topics: [],
              messages: [],
              minore_14: true as const,
              origine: undefined,
              da_ricontrollare: undefined,
            }
          : l,
      )
      r.documento.reactivate = r.documento.reactivate.filter((l) => l.conversation_id !== conversazioneId)
      r.documento.objections = r.documento.objections.filter(
        (o) => !((chat?.username && o.username === chat.username) || (chat?.utente_id && o.user_id === chat.utente_id)),
      )
    }
    for (const s of this.schede) {
      if (s.canale !== canale || s.chiave !== conversazioneId || (s.tipo !== 'lead' && s.tipo !== 'riattivazione')) continue
      const d = (s.dati ?? {}) as { minore_14?: unknown; ultima_chiusura?: unknown; suggested_message?: unknown }
      if (d.minore_14 === true) continue
      const chiusura =
        typeof d.ultima_chiusura === 'string' && d.ultima_chiusura !== ''
          ? d.ultima_chiusura
          : s.esecuzione_id === esecuzione && s.tipo === 'lead' && typeof d.suggested_message === 'string'
            ? d.suggested_message
            : ''
      s.dati = { tipo: 'lead', minore_14: true, ultima_chiusura: chiusura }
    }
  }

  async salvaConteggi(righe: readonly RigaContenutiDm[], opzioni?: { segnaGiorni?: boolean }) {
    this.controlla('salvaConteggi')
    for (const r of righe) if (r.dm <= 0) throw new Error('dm a zero')
    this.chiamateConteggi.push({ righe: righe.length, segnaGiorni: opzioni?.segnaGiorni !== false })
    this.conteggi = structuredClone([...righe])
    return righe.length
  }
}
