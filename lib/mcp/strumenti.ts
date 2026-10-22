import 'server-only'

import type { ToolAnnotations } from '@modelcontextprotocol/server'
import type { z } from 'zod'

import { RUOLI_MARKETING, TUTTI_I_RUOLI, type LivelloPm } from '@/lib/auth/roles'

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
import * as progetti from './progetti'
import * as sp from './schemi-progetti'
import { spuntiPerClaude } from './spunti'

/**
 * The MCP tools: the content calendar (09/10/2026, admin, video editor and
 * marketing) and, since 22/10/2026 (Claude a 360 gradi, phase 1), projects,
 * lists, tasks, notes and time for every role, each with the person's own
 * permissions in the app. Name, title, description, input, annotations,
 * roles, project levels and handler. Descriptions are
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
  /** The project levels that see the tool (who manages projects), when it depends on them. */
  livelli?: readonly LivelloPm[]
  esegui: (args: unknown, ctx: ContestoMcp) => Promise<EsitoStrumento>
}

/** The calendar is the Marketing area's, from Claude too. */
const MARKETING: readonly RuoloMcp[] = RUOLI_MARKETING
/** Projects and time: every role has the Projects area. */
const TUTTI: readonly RuoloMcp[] = TUTTI_I_RUOLI
/** Who creates and manages projects (pm_crea_progetto, pm_puo_gestire). */
const GESTISCE: readonly LivelloPm[] = ['admin', 'manager']

function strumento<S extends z.ZodTypeAny>(definizione: {
  nome: string
  titolo: string
  descrizione: string
  input: S
  lettura: boolean
  distruttivo?: boolean
  idempotente: boolean
  ruoli?: readonly RuoloMcp[]
  livelli?: readonly LivelloPm[]
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
    ruoli: definizione.ruoli ?? MARKETING,
    ...(definizione.livelli ? { livelli: definizione.livelli } : {}),
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
  ...strumentiProgetti(),
]

/**
 * The tools of a role and of its project level. Every active role gets this
 * far (the route answers 403 to a deactivated account): an unknown role here
 * is a bug, never an empty server. Without a level only the tools that do not
 * depend on it.
 */
export function strumentiPer(ruolo: string, livello?: LivelloPm | null): Strumento[] {
  if (!isRuoloMcp(ruolo)) throw new Error('ruolo non ammesso al server MCP')
  const effettivo: LivelloPm | null = ruolo === 'admin' ? 'admin' : (livello ?? null)
  return STRUMENTI.filter(
    (s) => s.ruoli.includes(ruolo) && (!s.livelli || (effettivo !== null && s.livelli.includes(effettivo))),
  )
}

/**
 * Projects, lists, tasks, notes and time (Claude a 360 gradi, phase 1,
 * 22/10/2026), every role, with the person's own permissions in the app.
 * Nothing here deletes: no task, project, note or time entry is removed from
 * Claude. Ids come from the reads; Claude works by name through them.
 */
function strumentiProgetti(): Strumento[] {
  return [
    strumento({
      nome: 'elenco_progetti',
      titolo: 'Elenco dei progetti',
      descrizione:
        'I progetti che la persona vede nell’app (l’admin dei progetti tutti, gli altri quelli di cui sono membri), per nome, con id, stato, reparto, date, avanzamento dei task e se li gestisce. Quello di un cliente porta il suo nome. Filtri facoltativi: cerca (un pezzo del nome) e stato. Al massimo 100 (50 se non dici altro).',
      input: sp.elencoProgettiSchema,
      lettura: true,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.elencoProgetti,
    }),
    strumento({
      nome: 'leggi_progetto',
      titolo: 'Leggi un progetto',
      descrizione:
        'Un progetto nel dettaglio: stato, date, responsabile, coach (progetti dei clienti), le liste (tappe) con i loro id, i task aperti con id, lista, scadenza, priorità e assegnatari (con completati anche gli ultimi completati), i membri con id e ruolo, e le ultime note. Serve per gli id dei task, delle liste e delle persone del progetto.',
      input: sp.leggiProgettoSchema,
      lettura: true,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.leggiProgetto,
    }),
    strumento({
      nome: 'persone_del_team',
      titolo: 'Persone del team',
      descrizione: 'Le persone attive del team, con id, nome e ruolo: per aggiungere un membro a un progetto, scegliere il coach o assegnare un task.',
      input: sp.senzaInputSchema,
      lettura: true,
      idempotente: true,
      ruoli: TUTTI,
      esegui: (_args, ctx) => progetti.personeDelTeam(ctx),
    }),
    strumento({
      nome: 'reparti_e_modelli',
      titolo: 'Reparti e modelli',
      descrizione: 'I reparti attivi e i modelli di progetto, con i loro id: servono a crea_progetto.',
      input: sp.senzaInputSchema,
      lettura: true,
      idempotente: true,
      ruoli: TUTTI,
      livelli: GESTISCE,
      esegui: (_args, ctx) => progetti.repartiEModelli(ctx),
    }),
    strumento({
      nome: 'miei_task',
      titolo: 'I miei task',
      descrizione:
        'I task aperti assegnati alla persona che ha collegato Claude, in tutti i suoi progetti, per scadenza, con id, progetto, stato, priorità e ritardo; con completati anche gli ultimi 30 completati. Solo i suoi.',
      input: sp.mieiTaskSchema,
      lettura: true,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.mieiTask,
    }),
    strumento({
      nome: 'mio_tempo',
      titolo: 'Il mio tempo',
      descrizione:
        'Il tempo registrato dalla persona che ha collegato Claude nel periodo (di base il mese in corso; ultimi_giorni o da e a): totale, per giorno, per progetto e per task, contati dall’app, le voci più recenti con voce_id (per modifica_tempo) e il timer acceso, se c’è. Con progetto_id o task_id solo il tempo lì. Solo il suo tempo: i totali sono già sommati.',
      input: sp.mioTempoSchema,
      lettura: true,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.mioTempo,
    }),
    strumento({
      nome: 'tempo_team',
      titolo: 'Tempo del team',
      descrizione:
        'Il tempo già dichiarato dal team nel periodo, come Tempo › Team: per persona, in ordine alfabetico, il totale, i progetti e i task con più tempo e le ultime voci. Facoltativi persona_id (da persone_del_team) e progetto_id. Mai i timer accesi; compare solo chi ha registrato qualcosa.',
      input: sp.tempoTeamSchema,
      lettura: true,
      idempotente: true,
      ruoli: ['admin'],
      esegui: progetti.tempoTeam,
    }),
    strumento({
      nome: 'crea_progetto',
      titolo: 'Crea un progetto',
      descrizione:
        'Crea un progetto in un reparto (id da reparti_e_modelli), con nome, descrizione e date facoltative; da un modello nascono le sue liste e i suoi task, datati dall’inizio. Membri: chi crea più le persone dette. Mai il progetto di un cliente: nasce da solo quando il cliente paga. Restituisce il progetto_id.',
      input: sp.creaProgettoSchema,
      lettura: false,
      distruttivo: false,
      idempotente: false,
      ruoli: TUTTI,
      livelli: GESTISCE,
      esegui: progetti.creaProgetto,
    }),
    strumento({
      nome: 'modifica_progetto',
      titolo: 'Modifica un progetto',
      descrizione:
        'Cambia nome, descrizione, stato (attivo, in_pausa, completato, archiviato), reparto, date o responsabile di un progetto che la persona gestisce. Passa solo quello che cambia. Il cliente di un progetto non si cambia da qui.',
      input: sp.modificaProgettoSchema,
      lettura: false,
      idempotente: true,
      ruoli: TUTTI,
      livelli: GESTISCE,
      esegui: progetti.modificaProgetto,
    }),
    strumento({
      nome: 'aggiungi_membro',
      titolo: 'Aggiungi un membro',
      descrizione: 'Aggiunge una persona del team (id da persone_del_team) a un progetto che la persona gestisce. Da qui non si toglie nessuno.',
      input: sp.membroProgettoSchema,
      lettura: false,
      distruttivo: false,
      idempotente: true,
      ruoli: TUTTI,
      livelli: GESTISCE,
      esegui: progetti.aggiungiMembro,
    }),
    strumento({
      nome: 'scegli_coach',
      titolo: 'Scegli il coach',
      descrizione:
        'Sceglie il coach del progetto di un cliente, come «Scegli il coach» nell’app: il coach entra nel progetto e prende i task principali senza nessuno e quelli del coach di prima; i task di un ruolo (la parte alimentare) vanno a una persona attiva con quel ruolo.',
      input: sp.membroProgettoSchema,
      lettura: false,
      idempotente: true,
      ruoli: TUTTI,
      livelli: GESTISCE,
      esegui: progetti.scegliCoach,
    }),
    strumento({
      nome: 'crea_lista',
      titolo: 'Crea una lista',
      descrizione: 'Aggiunge una lista (tappa) in fondo a un progetto che la persona gestisce, con nome e date facoltative. Restituisce il lista_id.',
      input: sp.creaListaSchema,
      lettura: false,
      distruttivo: false,
      idempotente: false,
      ruoli: TUTTI,
      livelli: GESTISCE,
      esegui: progetti.creaLista,
    }),
    strumento({
      nome: 'modifica_lista',
      titolo: 'Modifica una lista',
      descrizione: 'Cambia nome, descrizione o date di una lista di un progetto che la persona gestisce. Passa solo quello che cambia.',
      input: sp.modificaListaSchema,
      lettura: false,
      idempotente: true,
      ruoli: TUTTI,
      livelli: GESTISCE,
      esegui: progetti.modificaLista,
    }),
    strumento({
      nome: 'crea_task',
      titolo: 'Crea un task',
      descrizione:
        'Aggiunge un task a un progetto di cui la persona fa parte, in una lista o fuori, o come sotto-task, con assegnatari (membri del progetto) e, se vuoi, descrizione, priorità (bassa, media, alta, urgente), inizio, scadenza e stima. Restituisce il task con il suo id.',
      input: sp.creaTaskSchema,
      lettura: false,
      distruttivo: false,
      idempotente: false,
      ruoli: TUTTI,
      esegui: progetti.creaTask,
    }),
    strumento({
      nome: 'modifica_task',
      titolo: 'Modifica un task',
      descrizione:
        'Cambia titolo, stato (da_fare, in_corso, in_revisione, completato), priorità, descrizione, date, stima, lista o assegnatari di un task: chi gestisce il progetto ogni task, gli altri quelli creati da loro o assegnati a loro. Passa solo quello che cambia; assegnatari è l’elenco intero.',
      input: sp.modificaTaskSchema,
      lettura: false,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.modificaTask,
    }),
    strumento({
      nome: 'completa_task',
      titolo: 'Completa un task',
      descrizione: 'Segna completato un task (con completato false lo riapre), come la spunta nell’app. I task del percorso di un cliente raccolgono il tempo: si completano solo quando la persona lo chiede.',
      input: sp.completaTaskSchema,
      lettura: false,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.completaTask,
    }),
    strumento({
      nome: 'aggiungi_nota',
      titolo: 'Aggiungi una nota',
      descrizione: 'Scrive una nota in un progetto di cui la persona fa parte, per un giorno (di base oggi). Le note lette sono in leggi_progetto. Da qui si aggiungono soltanto.',
      input: sp.aggiungiNotaSchema,
      lettura: false,
      distruttivo: false,
      idempotente: false,
      ruoli: TUTTI,
      esegui: progetti.aggiungiNota,
    }),
    strumento({
      nome: 'registra_tempo',
      titolo: 'Registra il tempo',
      descrizione:
        'Registra il tempo della persona che ha collegato Claude su un progetto (e un task) di cui fa parte, per oggi o un giorno passato: una durata, o la fascia dalle–alle nel suo giorno. Solo il suo tempo. Restituisce il voce_id.',
      input: sp.registraTempoSchema,
      lettura: false,
      distruttivo: false,
      idempotente: false,
      ruoli: TUTTI,
      esegui: progetti.registraTempo,
    }),
    strumento({
      nome: 'modifica_tempo',
      titolo: 'Correggi il tempo',
      descrizione:
        'Corregge una voce del proprio tempo (voce_id da mio_tempo o dalla risposta di registra_tempo): progetto, task, giorno, durata o fascia, nota. Passa solo quello che cambia: una durata toglie la fascia, una fascia dà i minuti. Mai il tempo di un altro.',
      input: sp.modificaTempoSchema,
      lettura: false,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.modificaTempo,
    }),
    strumento({
      nome: 'avvia_timer',
      titolo: 'Avvia il timer',
      descrizione: 'Avvia il timer della persona su un progetto (e un task) di cui fa parte, da adesso; un timer già acceso si ferma prima.',
      input: sp.avviaTimerSchema,
      lettura: false,
      idempotente: false,
      ruoli: TUTTI,
      esegui: progetti.avviaTimer,
    }),
    strumento({
      nome: 'ferma_timer',
      titolo: 'Ferma il timer',
      descrizione: 'Ferma adesso il timer acceso della persona, con una nota facoltativa, e dice quanti minuti ha registrato.',
      input: sp.fermaTimerSchema,
      lettura: false,
      idempotente: true,
      ruoli: TUTTI,
      esegui: progetti.fermaTimer,
    }),
  ]
}
