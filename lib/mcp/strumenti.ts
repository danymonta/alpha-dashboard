import 'server-only'

import type { ToolAnnotations } from '@modelcontextprotocol/server'
import type { z } from 'zod'

import { ETICHETTA_MODELLO, SEZIONI } from '@/lib/marketing/etichette'

import {
  cambiaStatus,
  creaContenuti,
  elencoContenuti,
  eliminaContenutoPerClaude,
  etichetteContenuti,
  guidaContenuti,
  leggiContenutoPerClaude,
  modificaContenutoPerClaude,
  profiloClienteIdeale,
  scriviSezione,
  type EsitoStrumento,
} from './contenuti'
import { isRuoloMcp, type ContestoMcp, type RuoloMcp } from './contesto'
import { ETICHETTE, TESTO_GRUPPI, elencoEtichette } from './etichette'
import {
  cambiaStatusSchema,
  creaContenutiSchema,
  elencoContenutiSchema,
  eliminaContenutoSchema,
  etichetteContenutiSchema,
  guidaContenutiSchema,
  icpSchema,
  leggiContenutoSchema,
  modificaContenutoSchema,
  scriviSezioneSchema,
  spuntiSchema,
} from './schemi'
import { spuntiPerClaude } from './spunti'

/**
 * The MCP tools (Claude connected to the content calendar, 09/10/2026): name,
 * title, description, input, annotations, roles and handler. Descriptions are
 * in Italian with the exact Notion labels (built from lib/marketing/etichette.ts)
 * and say what a tool does; how Claude behaves is in the server instructions.
 *
 * Annotations are honest: a tool that writes is never read-only, and an update
 * replaces values, so it is destructive (Claude asks before each call). The
 * creation is additive: it can be allowed once for all.
 */

export type Strumento = {
  nome: string
  titolo: string
  descrizione: string
  input: z.ZodTypeAny
  annotazioni: ToolAnnotations
  /** a write tool: counted by the write limit */
  scrive: boolean
  ruoli: readonly RuoloMcp[]
  esegui: (args: unknown, ctx: ContestoMcp) => Promise<EsitoStrumento>
}

const TUTTI: readonly RuoloMcp[] = ['admin', 'editor', 'marketing']

function strumento<S extends z.ZodTypeAny>(definizione: {
  nome: string
  titolo: string
  descrizione: string
  input: S
  lettura: boolean
  distruttivo?: boolean
  idempotente: boolean
  ruoli?: readonly RuoloMcp[]
  esegui: (args: z.output<S>, ctx: ContestoMcp) => Promise<EsitoStrumento>
}): Strumento {
  const annotazioni: ToolAnnotations = definizione.lettura
    ? { title: definizione.titolo, readOnlyHint: true, idempotentHint: true, openWorldHint: false }
    : {
        title: definizione.titolo,
        readOnlyHint: false,
        destructiveHint: definizione.distruttivo ?? true,
        idempotentHint: definizione.idempotente,
        openWorldHint: false,
      }
  return {
    nome: definizione.nome,
    titolo: definizione.titolo,
    descrizione: definizione.descrizione,
    input: definizione.input,
    annotazioni,
    scrive: !definizione.lettura,
    ruoli: definizione.ruoli ?? TUTTI,
    // the SDK hands over what the schema's validate returned: z.output<S>
    esegui: (args, ctx) => definizione.esegui(args as z.output<S>, ctx),
  }
}

const STATUS = elencoEtichette(ETICHETTE.status)
const REEL = ETICHETTA_MODELLO.reel
const CAROUSEL = ETICHETTA_MODELLO.carousel

/** «messaggio = Topic / Main Message (Reel Topic) o Idea/Message (Carousel Topic); …» */
const CHIAVI_SEZIONI = [
  `messaggio = ${SEZIONI.reel.messaggio} (${REEL}) o ${SEZIONI.carousel.messaggio} (${CAROUSEL})`,
  `bozza = ${SEZIONI.reel.bozza} o ${SEZIONI.carousel.bozza}`,
  `commenti = ${SEZIONI.reel.commenti}`,
  `finale = ${SEZIONI.reel.finale} o ${SEZIONI.carousel.finale}`,
].join('; ')

export const STRUMENTI: readonly Strumento[] = [
  strumento({
    nome: 'etichette_contenuti',
    titolo: 'Etichette del calendario',
    descrizione: `Le etichette del calendario: Reel Type e Format come sono adesso nell’app (la persona li crea e li colora: nome, codice e colore di ognuno; tu non ne crei), Status (${STATUS}) nei gruppi ${TESTO_GRUPPI}, i modelli ${REEL} e ${CAROUSEL} con i nomi delle loro sezioni, lo scheletro della bozza di un reel e i limiti dei campi. Usala prima di scrivere un Reel Type o un Format, e quando non sei sicuro di un’etichetta o di un limite.`,
    input: etichetteContenutiSchema,
    lettura: true,
    idempotente: true,
    esegui: (_args, ctx) => etichetteContenuti(ctx),
  }),
  strumento({
    nome: 'elenco_contenuti',
    titolo: 'Elenco dei contenuti',
    descrizione:
      'Cerca i contenuti del calendario, dalla Post Date più recente; quelli senza Post Date vengono per ultimi. Filtri facoltativi: mese (AAAA-MM) o da/a (AAAA-MM-GG, sulla Post Date), senza_data, Status, gruppo di Status, Reel Type, Format, modello, cerca (un pezzo del Name così com’è, maiuscole e minuscole a parte: più parole valgono solo se nel Name sono di seguito). Restituisce solo le proprietà, mai i testi delle sezioni: per quelli usa leggi_contenuto. Al massimo 100 contenuti (50 se non dici altro), con il totale e i numeri per gruppo di Status.',
    input: elencoContenutiSchema,
    lettura: true,
    idempotente: true,
    esegui: elencoContenuti,
  }),
  strumento({
    nome: 'leggi_contenuto',
    titolo: 'Leggi un contenuto',
    descrizione: `Un contenuto con le proprietà e i testi (Markdown) delle sezioni del suo modello: ${CHIAVI_SEZIONI}. Per ogni sezione dà l’impronta, che serve a scrivi_sezione per non sovrascrivere un testo cambiato da qualcun altro, e la versione delle proprietà, che serve a modifica_contenuto. Una sezione non si taglia mai: se i testi insieme superano 45.000 caratteri, quelle che non entrano vanno lette a parte con il parametro sezioni.`,
    input: leggiContenutoSchema,
    lettura: true,
    idempotente: true,
    esegui: leggiContenutoPerClaude,
  }),
  strumento({
    nome: 'icp',
    titolo: 'Profilo del cliente ideale',
    descrizione:
      'Il profilo del cliente ideale di Percorso Alpha (ICP), in Markdown, con il giorno in cui è stato scritto: chi è, da dove parte, cosa lo blocca e cosa vuole, cosa ha già provato e perché ha mollato, perché sceglie Dany, le obiezioni, le frasi con cui parla di sé, i segnali che è in target e le indicazioni per i contenuti di attrazione (TOF), consapevolezza (MOF) e conversione (BOF). Anonimo: solo pattern e frasi, mai nomi.',
    input: icpSchema,
    lettura: true,
    idempotente: true,
    esegui: () => profiloClienteIdeale(),
  }),
  strumento({
    nome: 'guida_contenuti',
    titolo: 'Guida di Dany ai contenuti',
    descrizione:
      'La guida di Dany ai contenuti di Percorso Alpha, in Markdown, con il giorno in cui è stata scritta: il contesto del brand, il tono di voce e le frasi vietate, il formato degli script (prosa, indicazioni visive tra parentesi, nessun elenco), il funnel (attrazione, consapevolezza, conversione), le regole di ogni fase, la libreria degli hook, le regole delle CTA, della caption e delle stories, i template e le regole su proof e specificità. Con parte punteggio anche come si valuta un reel (pesi, criteri, penalità, fasce) e come si rifà. Senza prezzi: il cliente ideale resta quello di icp. Senza parte dà le linee guida.',
    input: guidaContenutiSchema,
    lettura: true,
    idempotente: true,
    esegui: guidaContenuti,
  }),
  strumento({
    nome: 'spunti_contenuti',
    titolo: 'Spunti per i contenuti',
    descrizione:
      'Gli ultimi spunti che Claude ha scritto per chi fa i contenuti (gli stessi della scheda Spunti dell’app, che si chiedono dall’app), in sola lettura: in breve, cosa funziona, cosa chiedono i lead, le obiezioni da anticipare, le domande da trasformare in contenuti, cosa mantenere, cambiare e potenziare, e le idee pronte per il calendario (anche caroselli), con il perché di ognuna. Sono temi a parole, senza nomi né cifre di persone: nascono da reel, DM, note del setting e call, e dicono da dove vengono, mai quanti. Senza parametri dà i più recenti; con settimana (AAAA-MM-GG) quelli che coprono quel giorno. Per creare un contenuto da un’idea usa crea_contenuti.',
    input: spuntiSchema,
    lettura: true,
    idempotente: true,
    esegui: spuntiPerClaude,
  }),
  strumento({
    nome: 'crea_contenuti',
    titolo: 'Crea contenuti',
    descrizione: `Crea da 1 a 20 contenuti nel calendario, ognuno con le proprietà di Notion e, se vuoi, i testi delle sezioni. Modello: ${REEL} (predefinito) o ${CAROUSEL}; un ${REEL} senza bozza nasce con lo scheletro Hook / Line / Line / … / CTA. Status predefinito Not started. Name obbligatorio, al massimo 300 caratteri; Post Date facoltativa (AAAA-MM-GG, anche nel futuro); Reel Type e Format sono il nome (o il codice) di un’etichetta che c’è già nell’app, quelle valide le dà etichette_contenuti (se non c’è, l’errore le elenca; da qui non se ne creano); Inspiration e URL sono link interi (https://…), URL è il link del post pubblicato (instagram.com/reel/… o /p/…) e mai un link di condivisione (instagram.com/share/…); Audio al massimo 200 caratteri; View Count un intero. Ogni sezione al massimo 30.000 caratteri, in Markdown (${CHIAVI_SEZIONI}). Restituisce l’esito di ogni contenuto, con le sue proprietà e la versione: uno che non va non ferma gli altri.`,
    input: creaContenutiSchema,
    lettura: false,
    // it only adds contents: the person can allow it once for all
    distruttivo: false,
    idempotente: false,
    esegui: creaContenuti,
  }),
  strumento({
    nome: 'modifica_contenuto',
    titolo: 'Modifica le proprietà',
    descrizione:
      'Cambia una o più proprietà di un contenuto: Name, Modello, Reel Type, Format, Status, Post Date, Inspiration, Audio, URL, View Count. Passa solo quelle da cambiare; null svuota un campo (Name, Modello e Status non si svuotano). Serve l’ultima versione che hai: da leggi_contenuto, elenco_contenuti o dalla risposta dell’ultima scrittura su quel contenuto (crea_contenuti, cambia_status, scrivi_sezione, modifica_contenuto), che la dà insieme ai valori attuali: ogni scrittura la cambia. Se nel frattempo qualcun altro l’ha cambiato non salva niente e restituisce i valori attuali con la loro versione. Salvato, restituisce le proprietà con la versione nuova. Per i testi usa scrivi_sezione; per lo Status da solo basta cambia_status.',
    input: modificaContenutoSchema,
    lettura: false,
    idempotente: true,
    esegui: modificaContenutoPerClaude,
  }),
  strumento({
    nome: 'cambia_status',
    titolo: 'Cambia lo Status',
    descrizione: `Mette lo Status di un contenuto: ${STATUS}, nei gruppi ${TESTO_GRUPPI}. Come il tocco sullo Status nell’app: vale l’ultimo, senza versione. Restituisce le proprietà con la versione nuova.`,
    input: cambiaStatusSchema,
    lettura: false,
    idempotente: true,
    esegui: cambiaStatus,
  }),
  strumento({
    nome: 'scrivi_sezione',
    titolo: 'Scrivi una sezione',
    descrizione: `Scrive il testo, in Markdown, di una sezione di un contenuto al posto di quello che c’è: ${CHIAVI_SEZIONI}. Serve l’impronta più recente che hai di quella sezione, da leggi_contenuto o dalla risposta dell’ultimo scrivi_sezione su quella sezione («salvata» o «cambiata»): ogni scrittura la cambia. Se nel frattempo qualcun altro ha cambiato il testo non salva niente e restituisce il testo attuale con la sua impronta. Salvata, restituisce la nuova impronta e le proprietà con la versione nuova. Un testo vuoto svuota la sezione. Al massimo 30.000 caratteri; righe vuote in cima e spazi in fondo si tolgono.`,
    input: scriviSezioneSchema,
    lettura: false,
    idempotente: true,
    esegui: scriviSezione,
  }),
  strumento({
    nome: 'elimina_contenuto',
    titolo: 'Elimina un contenuto',
    descrizione:
      'Elimina per sempre un contenuto con i suoi testi (solo admin). Per toglierlo dal lavoro senza eliminarlo c’è lo Status Canceled. Vuole l’id e il Name esatto letto con leggi_contenuto: se il Name non coincide non elimina niente. Su Instagram e su Notion non cambia niente.',
    input: eliminaContenutoSchema,
    lettura: false,
    idempotente: true,
    ruoli: ['admin'],
    esegui: eliminaContenutoPerClaude,
  }),
]

/**
 * The tools of a role. Only the admin, the video editor and marketing get
 * this far (the route answers 403 to anyone else): any other role here is a
 * bug, never an empty server.
 */
export function strumentiPer(ruolo: string): Strumento[] {
  if (!isRuoloMcp(ruolo)) throw new Error('ruolo non ammesso al server MCP')
  return STRUMENTI.filter((s) => s.ruoli.includes(ruolo))
}
