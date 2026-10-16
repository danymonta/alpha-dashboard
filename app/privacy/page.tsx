import { Hash, Mail } from 'lucide-react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { LogoFuoco } from '@/components/brand/logo-fuoco'

/*
 * Public privacy policy (Dany, 08/10/2026): the Privacy Policy URL and, with
 * #cancellazione-dati, the Data deletion instructions URL of the Meta app.
 * Outside the (app) group: no shell, no login, no database. The proxy lists
 * /privacy among its public paths, so Meta's crawler reads it without cookies.
 */

/**
 * The data controller, in one place. VAT number and registered address are
 * shown only when filled in: never invent them.
 */
const TITOLARE: {
  nome: string
  marchio: string
  attivita: string
  email: string
  partitaIva: string
  sede: string
} = {
  nome: 'Daniele Montagnolo',
  marchio: 'Percorso Alpha',
  attivita: 'coaching online di trasformazione fisica',
  email: 'join@percorsoalpha.com',
  partitaIva: '',
  sede: '',
}

/** Change both together when the text changes. */
const ULTIMO_AGGIORNAMENTO = { iso: '2026-10-16', testo: '16 ottobre 2026' }

const TITOLO = 'Informativa privacy · Percorso Alpha'
const DESCRIZIONE =
  'Come Percorso Alpha tratta i dati di chi scrive o interagisce su Instagram e Facebook e dei clienti, e come chiederne la cancellazione.'

export const metadata: Metadata = {
  title: TITOLO,
  description: DESCRIZIONE,
  alternates: { canonical: '/privacy' },
  // the rest of the app stays out of search results; this page must be found
  robots: { index: true, follow: true },
  openGraph: {
    title: TITOLO,
    description: DESCRIZIONE,
    url: '/privacy',
    siteName: TITOLARE.marchio,
    locale: 'it_IT',
    type: 'website',
  },
}

const LINK =
  'rounded-sm font-medium text-foreground underline decoration-primary-light underline-offset-4 [overflow-wrap:anywhere] hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const MAILTO = `mailto:${TITOLARE.email}`
const MAILTO_CANCELLAZIONE = `${MAILTO}?subject=${encodeURIComponent('Cancellazione dati')}`

function Email() {
  return (
    <a href={MAILTO} className={LINK}>
      {TITOLARE.email}
    </a>
  )
}

function Elenco({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-3 pl-5 marker:text-muted-foreground">{children}</ul>
}

type Sezione = { id: string; titolo: string; contenuto: ReactNode }

const SEZIONI: Sezione[] = [
  {
    id: 'titolare',
    titolo: 'Chi è il titolare del trattamento',
    contenuto: (
      <>
        <p>
          Il titolare del trattamento è {TITOLARE.nome}, che opera con il marchio {TITOLARE.marchio}, un servizio di{' '}
          {TITOLARE.attivita}.
        </p>
        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Titolare</dt>
          <dd>{TITOLARE.nome}</dd>
          <dt className="text-muted-foreground">Marchio</dt>
          <dd>{TITOLARE.marchio}</dd>
          {TITOLARE.partitaIva ? (
            <>
              <dt className="text-muted-foreground">Partita IVA</dt>
              <dd className="num">{TITOLARE.partitaIva}</dd>
            </>
          ) : null}
          {TITOLARE.sede ? (
            <>
              <dt className="text-muted-foreground">Sede</dt>
              <dd>{TITOLARE.sede}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Email per la privacy</dt>
          <dd>
            <Email />
          </dd>
        </dl>
      </>
    ),
  },
  {
    id: 'dati',
    titolo: 'Quali dati trattiamo',
    contenuto: (
      <>
        <p>Trattiamo solo i dati che servono agli scopi descritti in questa pagina.</p>
        <Elenco>
          <li>
            <strong className="font-semibold">Dati di profilo e di contatto</strong> di chi ci scrive o interagisce con
            Percorso Alpha su Instagram e Facebook: nome, username, foto profilo pubblica, l’identificativo che la
            piattaforma assegna al tuo account e, per chi ci scrive in privato, il numero di follower e se ci seguiamo a
            vicenda.
          </li>
          <li>
            <strong className="font-semibold">Messaggi e interazioni</strong>: il contenuto dei messaggi diretti che ci
            mandi, i commenti e le altre interazioni con i nostri contenuti.
          </li>
          <li>
            <strong className="font-semibold">Call conoscitive</strong>: giorno e ora della call, le note di chi la fa e,
            quando la call si fa in video, la sua registrazione e trascrizione, per ricordare cosa ci hai chiesto e
            migliorare il nostro lavoro.
          </li>
          <li>
            <strong className="font-semibold">Statistiche dei contenuti</strong>: i dati aggregati che Meta fornisce su
            pagine e contenuti, come copertura, visualizzazioni e interazioni. Sono numeri complessivi, non riferiti a
            una singola persona.
          </li>
          <li>
            <strong className="font-semibold">Dati dei clienti</strong>: per chi inizia un percorso, quelli necessari a
            seguirlo e a gestire il rapporto: nome, contatti, dati del contratto e dei pagamenti. Li gestiamo nel nostro
            gestionale interno.
          </li>
        </Elenco>
        <p>
          I dati di profilo, i messaggi, le interazioni e le statistiche ci arrivano dalle piattaforme di Meta quando ci
          scrivi o interagisci con i nostri contenuti. I dati dei clienti ce li dai tu.
        </p>
      </>
    ),
  },
  {
    id: 'finalita',
    titolo: 'Perché li trattiamo e su quale base',
    contenuto: (
      <>
        <Elenco>
          <li>
            <strong className="font-semibold">
              Rispondere ai messaggi e alle richieste di informazioni, gestire le conversazioni con chi è interessato e
              con i clienti, organizzare le call.
            </strong>{' '}
            Base giuridica: misure precontrattuali adottate su tua richiesta ed esecuzione del contratto (art. 6, par. 1,
            lett. b del GDPR).
          </li>
          <li>
            <strong className="font-semibold">Gestire il rapporto con i clienti</strong>: contratto, piano dei
            pagamenti, incassi, comunicazioni sul percorso. Base giuridica: esecuzione del contratto (art. 6, par. 1,
            lett. b).
          </li>
          <li>
            <strong className="font-semibold">Adempiere agli obblighi fiscali e contabili.</strong> Base giuridica:
            obbligo di legge (art. 6, par. 1, lett. c).
          </li>
          <li>
            <strong className="font-semibold">
              Analizzare le prestazioni dei contenuti e organizzare il lavoro interno del team.
            </strong>{' '}
            Base giuridica: il legittimo interesse di Percorso Alpha a capire quali contenuti sono utili, a migliorarli
            e a organizzare la propria attività (art. 6, par. 1, lett. f). Puoi opporti in qualsiasi momento.
          </li>
        </Elenco>
        <p>
          Darci i dati è facoltativo, ma senza quelli necessari non possiamo rispondere alle tue richieste né seguire il
          tuo percorso. I dati fiscali li richiede la legge.
        </p>
      </>
    ),
  },
  {
    id: 'meta-e-ai',
    titolo: 'Meta e l’intelligenza artificiale',
    contenuto: (
      <>
        <p>
          Percorso Alpha usa le API di Meta (Instagram e Facebook), con le autorizzazioni concesse all’account di
          Percorso Alpha, collegate a un assistente di intelligenza artificiale, Claude di Anthropic. L’assistente ci
          aiuta a leggere e organizzare i messaggi e le statistiche e a preparare le risposte.
        </p>
        <p>
          Ogni notte il nostro gestionale conta anche i messaggi diretti del giorno prima dell’account di Percorso Alpha,
          per precompilare il report giornaliero di chi gestisce i messaggi: ne conserva solo i totali del giorno (per
          esempio quante conversazioni e quante call proposte), mai il testo, e non passa i messaggi a nessuna
          intelligenza artificiale. Per questo conteggio non conserviamo il tuo username, salvo quando escludiamo la tua
          chat (per esempio perché sei già un cliente). Il riepilogo descritto qui sotto, invece, usa il testo.
        </p>
        <p>
          Ogni notte il gestionale legge anche l’elenco dei post e dei reel pubblicati dall’account (didascalia, data,
          link e copertina, con il numero di mi piace e di commenti) per collegarli al calendario dei contenuti; non legge
          i commenti né chi ha messo mi piace. Le didascalie e i numeri dei post più recenti entrano anche nel riepilogo
          dei messaggi diretti descritto qui sotto.
        </p>
        <p>
          <strong className="font-semibold">Analisi dei reel.</strong> Per i reel pubblicati dall’account il gestionale
          legge anche i numeri del reel (visualizzazioni, salvataggi, condivisioni, tempo di visione) e, per i reel più
          recenti, ne scarica il video per il tempo della lettura e lo cancella subito: non lo conserva. Dal video ricava
          alcuni fotogrammi e la traccia audio. I fotogrammi, la didascalia e la trascrizione del parlato vengono inviati ad
          Anthropic PBC (Stati Uniti) per un’analisi che dice come è fatto il reel, gli dà un punteggio di qualità e dice
          cosa pubblicare dopo; l’analisi parte solo quando una persona del team la chiede su quel reel. La traccia audio
          viene inviata a Groq (Stati Uniti) per essere trascritta e non viene conservata. Il gestionale conserva il testo
          della trascrizione, la scheda scritta da Claude, il punteggio e i numeri del reel. In queste analisi non entrano messaggi né
          nomi: dei contatti arrivati dai messaggi diretti Claude riceve solo conteggi e, se il nostro team lo consente,
          il testo delle note interne del team sui contatti (cosa frenava i contatti, i motivi per cui una call non si è
          chiusa), ripulito dei nomi, dei recapiti e delle cifre, e mai i testi dei messaggi.
        </p>
        <p>
          <strong className="font-semibold">Analisi delle call.</strong> Quando una call con te si fa in video e viene
          registrata con Fathom (Stati Uniti), chi l’ha tenuta incolla nel gestionale il link della registrazione. Il
          gestionale trova la registrazione su Fathom e, per ogni call registrata, ne legge la trascrizione e la invia ad
          Anthropic PBC (Stati Uniti), fornitore del modello Claude, per un’analisi: com’è andata la call, se la persona
          era in linea con quella a cui ci rivolgiamo, quali dubbi ha espresso, una proposta del motivo per cui non ha
          deciso e un giudizio su come è stata condotta, che legge solo chi l’ha condotta. Prima dell’invio togliamo dal
          testo i nomi, i recapiti, le cifre e i link. Il gestionale non conserva la registrazione né la trascrizione: la
          trascrizione si rilegge da Fathom solo quando una persona del team la apre. Conserva l’analisi scritta da
          Claude, senza nomi, senza cifre e senza dati sulla salute. Se durante la call racconti qualcosa sulla tua
          salute, può essere presente nella trascrizione che Anthropic riceve per l’analisi: chiediamo a Claude di non
          riportarlo e il gestionale toglie dal testo salvato ogni frase che ne parla. Non vogliamo analizzare le
          conversazioni con i minorenni: se il testo lo fa capire, l’analisi si ferma e non viene salvata. Se non vuoi
          che una call venga registrata o analizzata, dillo all’inizio della call o scrivici: la call si segna come non
          registrata.
        </p>
        <p>
          <strong className="font-semibold">Spunti per i contenuti.</strong> Quando una persona del team lo chiede, Claude
          scrive, per il team dei contenuti, un riepilogo di temi, obiezioni e domande ricorrenti dei contatti, incrociando i nostri reel, i
          conteggi dei messaggi diretti, le note interne del team e i temi delle analisi delle call. Riceve solo testo già
          ripulito di nomi, recapiti e cifre, mai trascrizioni né messaggi, e gli spunti che scrive non contengono
          nomi né frasi di singole persone.
        </p>
        <p>
          <strong className="font-semibold">Riepilogo dei messaggi diretti.</strong> Ogni giorno il gestionale legge
          anche i messaggi diretti dell’account Instagram di Percorso Alpha e della sua Pagina Facebook (Messenger):
          le conversazioni delle ultime 24 ore e quelle ferme da qualche giorno (fino a 14) per cui può servire un
          messaggio di riattivazione, con gli ultimi messaggi di ciascuna (al massimo 25, degli ultimi 30 giorni); al
          primo avvio, o dopo giorni in cui non ha girato, rilegge anche le conversazioni dei 14 giorni precedenti. Legge
          il nome, lo username e il numero di follower di chi scrive, per preparare un riepilogo per il nostro team: chi
          aspetta una risposta, cosa chiede, quale messaggio scrivere, da quale nostro post o reel è arrivato. Per l’analisi il testo dei messaggi viene inviato ad Anthropic PBC (Stati Uniti),
          fornitore del modello di intelligenza artificiale Claude, che lo tratta per nostro conto secondo i suoi termini
          commerciali: non lo usa per addestrare i suoi modelli e lo conserva per un periodo limitato. Il gestionale
          conserva il riepilogo e i messaggi letti per al massimo 30 giorni e non tiene mai messaggi più vecchi di 30
          giorni; delle chat che non riguardano il nostro servizio non conserva i messaggi. Conserva inoltre, senza nomi
          né testi, quanti contatti arrivano da ciascun nostro post o reel, per capire quali contenuti funzionano. Non
          manda mai messaggi a nome tuo. Le chat che escludiamo (per esempio quelle con i nostri clienti) non vengono
          conservate né analizzate.
        </p>
        <p>
          Il team può collegare il proprio account Claude (Anthropic) al calendario dei contenuti del gestionale: Claude
          legge e scrive soltanto le idee, gli script e le didascalie dei post, a nome della persona che lo ha collegato,
          e non raggiunge i messaggi diretti, i dati dei clienti o dei pagamenti. Chi lo collega tiene spento in Claude
          l’uso delle chat per migliorare i modelli.
        </p>
        <Elenco>
          <li>
            Nessuna risposta, nessun messaggio e nessuna pubblicazione parte senza l’intervento di una persona del team.
          </li>
          <li>
            Non prendiamo decisioni basate solo su un trattamento automatizzato, compresa la profilazione, che producano
            effetti giuridici su di te o ti riguardino in modo analogo: l’assistente prepara, una persona decide.
          </li>
          <li>I dati non vengono usati per addestrare modelli di intelligenza artificiale.</li>
          <li>Non vendiamo i dati e non usiamo i dati ricevuti da Meta per fare pubblicità.</li>
        </Elenco>
        <p>
          Sulle sue piattaforme Meta tratta i dati come titolare autonomo, secondo la propria informativa:{' '}
          <a href="https://www.facebook.com/privacy/policy/" className={LINK}>
            facebook.com/privacy/policy
          </a>
          . Per le statistiche delle pagine, Meta e Percorso Alpha sono contitolari nei termini dell’accordo che Meta
          prevede per chi amministra una pagina.
        </p>
      </>
    ),
  },
  {
    id: 'destinatari',
    titolo: 'Con chi condividiamo i dati',
    contenuto: (
      <>
        <p>Non vendiamo i dati a nessuno. Li condividiamo solo con chi serve agli scopi descritti sopra:</p>
        <Elenco>
          <li>
            <strong className="font-semibold">il team di Percorso Alpha</strong>, con account personali: ogni persona
            vede solo i dati che servono al suo ruolo;
          </li>
          <li>
            <strong className="font-semibold">Meta</strong> (Meta Platforms Ireland Limited per chi si trova
            nell’Unione europea): Instagram e Facebook, dove avvengono le conversazioni;
          </li>
          <li>
            <strong className="font-semibold">Anthropic</strong> (Stati Uniti): l’assistente di intelligenza
            artificiale Claude, anche per l’analisi delle call registrate;
          </li>
          <li>
            <strong className="font-semibold">Groq</strong> (Stati Uniti): l’assistente interno del nostro gestionale e la
            trascrizione dell’audio dei nostri reel;
          </li>
          <li>
            <strong className="font-semibold">Vercel</strong>: l’hosting del gestionale;
          </li>
          <li>
            <strong className="font-semibold">Supabase</strong>: il database del gestionale, con i dati nell’Unione
            europea (Francoforte);
          </li>
          <li>
            <strong className="font-semibold">Resend</strong>: l’invio delle email;
          </li>
          <li>
            <strong className="font-semibold">Google</strong>: gli account di accesso del team, Google Calendar per le
            call e Google Drive;
          </li>
          <li>
            <strong className="font-semibold">Fathom</strong> (Stati Uniti): la registrazione e la trascrizione delle call
            con chi ci chiede informazioni, quando la call si fa in video; il gestionale le legge da Fathom con una
            chiave di sola lettura;
          </li>
          <li>
            <strong className="font-semibold">Coach Plus</strong>: la piattaforma in cui seguiamo il percorso dei
            clienti (allenamento, alimentazione, check);
          </li>
          <li>
            <strong className="font-semibold">commercialista e consulenti</strong>, solo per gli adempimenti fiscali e
            di legge;
          </li>
          <li>
            <strong className="font-semibold">banche e servizi di pagamento</strong>, per gli incassi dei clienti.
          </li>
        </Elenco>
        <p>
          I fornitori di servizi trattano i dati per nostro conto, come responsabili del trattamento, e solo per il
          servizio che ci danno. Meta, le banche e i servizi di pagamento li trattano come titolari autonomi.
        </p>
      </>
    ),
  },
  {
    id: 'trasferimenti',
    titolo: 'Trasferimenti fuori dall’Unione europea',
    contenuto: (
      <>
        <p>
          Alcuni fornitori, tra cui Anthropic, Groq, Vercel, Resend, Google, Fathom e Meta, hanno sede negli Stati Uniti o
          possono trattare i dati fuori dallo Spazio economico europeo. In questi casi il trasferimento avviene solo con
          le garanzie previste dal GDPR: una decisione di adeguatezza della Commissione europea, come quella per le
          società aderenti all’EU-U.S. Data Privacy Framework, oppure le clausole contrattuali standard approvate dalla
          Commissione (artt. 45 e 46 del GDPR).
        </p>
        <p>
          Per sapere quali garanzie si applicano puoi scrivere a <Email />.
        </p>
      </>
    ),
  },
  {
    id: 'conservazione',
    titolo: 'Per quanto tempo li conserviamo',
    contenuto: (
      <Elenco>
        <li>
          <strong className="font-semibold">Messaggi e dati di chi non è cliente</strong>: per il tempo necessario alla
          conversazione e al massimo 24 mesi dall’ultimo contatto. Poi li cancelliamo o li rendiamo anonimi.
        </li>
        <li>
          <strong className="font-semibold">Riepilogo dei messaggi diretti</strong>: il riepilogo e i messaggi letti per
          prepararlo, al massimo 30 giorni; poi si cancellano da soli.
        </li>
        <li>
          <strong className="font-semibold">Contatti per contenuto</strong>: solo numeri (quanti contatti al giorno
          arrivano da un nostro post o reel), senza nomi né testi: li conserviamo per l’analisi dei contenuti.
        </li>
        <li>
          <strong className="font-semibold">Analisi dei reel</strong>: il testo del parlato, la scheda e il punteggio di
          Claude e i numeri di ogni reel, finché il reel è nel nostro archivio dei contenuti; il video e l’audio non si conservano.
        </li>
        <li>
          <strong className="font-semibold">Analisi delle call</strong>: l’analisi scritta da Claude, senza nomi, cifre
          né dati sulla salute, al massimo 24 mesi dalla call; la registrazione e la trascrizione restano su Fathom,
          secondo le sue impostazioni, e il gestionale non le conserva.
        </li>
        <li>
          <strong className="font-semibold">Spunti per i contenuti</strong>: i riepiloghi, senza nomi, al
          massimo 26 settimane.
        </li>
        <li>
          <strong className="font-semibold">Dati dei clienti</strong>: per tutta la durata del rapporto. Dopo,
          conserviamo solo quelli necessari agli obblighi fiscali e contabili, per 10 anni come prevede la legge.
        </li>
        <li>
          <strong className="font-semibold">Statistiche dei contenuti</strong>: in forma aggregata, senza riferimenti a
          singole persone.
        </li>
      </Elenco>
    ),
  },
  {
    id: 'diritti',
    titolo: 'I tuoi diritti',
    contenuto: (
      <>
        <p>In qualsiasi momento puoi chiederci di:</p>
        <Elenco>
          <li>accedere ai tuoi dati e riceverne una copia;</li>
          <li>correggerli o completarli (rettifica);</li>
          <li>cancellarli;</li>
          <li>limitarne il trattamento;</li>
          <li>riceverli in un formato strutturato e di uso comune, o farli trasmettere a un altro titolare (portabilità);</li>
          <li>opporti al trattamento basato sul legittimo interesse;</li>
          <li>revocare il consenso, quando il trattamento si basa sul consenso, senza effetti su quanto fatto prima.</li>
        </Elenco>
        <p>
          Per esercitarli scrivi a <Email />. Rispondiamo entro 30 giorni; se la richiesta è complessa il termine può
          essere prorogato di altri due mesi al massimo, e in quel caso te lo diciamo entro i 30 giorni. Per proteggere i
          tuoi dati potremmo chiederti di confermare chi sei.
        </p>
        <p>
          Puoi anche proporre reclamo al Garante per la protezione dei dati personali (
          <a href="https://www.garanteprivacy.it" className={LINK}>
            garanteprivacy.it
          </a>
          ) o all’autorità di controllo del paese dell’Unione europea in cui vivi o lavori.
        </p>
      </>
    ),
  },
  {
    id: 'cancellazione-dati',
    titolo: 'Come chiedere la cancellazione dei dati',
    contenuto: (
      <div className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
        <p>
          Puoi chiedere in qualsiasi momento di cancellare i dati che abbiamo ricevuto tramite Instagram, Facebook o
          direttamente da te.
        </p>
        <ol className="list-decimal space-y-3 pl-5 marker:text-muted-foreground">
          <li>
            Scrivi a <Email /> con oggetto «Cancellazione dati».
          </li>
          <li>Indica il tuo username Instagram, o il nome che hai usato con noi, così troviamo i tuoi dati.</li>
          <li>
            Entro 30 giorni cancelliamo i dati ricevuti tramite Meta e quelli collegati, tranne quelli che la legge ci
            obbliga a conservare (per esempio i dati fiscali di un cliente), e ti confermiamo via email cosa abbiamo
            cancellato.
          </li>
        </ol>
        <p>
          Puoi chiederci di cancellare i tuoi messaggi dal riepilogo dei messaggi diretti scrivendoci come descritto qui
          sopra: escludiamo la tua chat e cancelliamo subito quello che è salvato; in ogni caso i messaggi si cancellano
          da soli dopo 30 giorni.
        </p>
        <a
          href={MAILTO_CANCELLAZIONE}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Mail className="size-4 shrink-0" aria-hidden="true" />
          Scrivi per la cancellazione
        </a>
        <div className="space-y-3 border-t border-border pt-5">
          <h3 className="font-semibold">Togliere l’accesso da Facebook o Instagram</h3>
          <p>
            Se hai autorizzato un’app di Percorso Alpha con il tuo account Facebook o Instagram, puoi togliere l’accesso
            quando vuoi dalle impostazioni dell’app di Meta, nella sezione sulle app e sui siti web collegati (per
            esempio Impostazioni › Sicurezza › App e siti web; i nomi dei menu possono cambiare). Togliere l’accesso
            blocca i nuovi dati; per cancellare quelli già ricevuti scrivici come descritto sopra.
          </p>
          <p className="text-muted-foreground">
            La cancellazione riguarda i dati che conserviamo noi: quello che resta su Instagram e Facebook segue le
            regole di Meta.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'minori',
    titolo: 'Minori',
    contenuto: (
      <p>
        Percorso Alpha si rivolge a persone maggiorenni. Se ci scrive un minore gli rispondiamo con attenzione. Sotto i 14
        anni chiudiamo la conversazione con gentilezza e non conserviamo i suoi messaggi: il gestionale li legge e li fa
        analizzare una sola volta, anche da Anthropic, per riconoscere l’età, poi li cancella, anche dai riepiloghi dei
        giorni prima. Di quella chat teniamo solo l’indicazione che è di un minore, senza alcun messaggio, perché non
        venga analizzata di nuovo. Tra i 14 e i 17 anni non
        proponiamo niente senza il coinvolgimento dei genitori, e i suoi messaggi seguono le regole di tutti: restano al
        massimo 30 giorni nel riepilogo e passano da Anthropic per l’analisi. Se pensi che un minore ci abbia dato i suoi
        dati, scrivici e li cancelliamo.
      </p>
    ),
  },
  {
    id: 'modifiche',
    titolo: 'Modifiche a questa informativa',
    contenuto: (
      <p>
        Possiamo aggiornare questa informativa, per esempio quando cambiano i servizi che usiamo. La data dell’ultimo
        aggiornamento è in cima alla pagina, e la versione valida è sempre quella pubblicata qui.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-prose px-4 py-10 text-base leading-7 md:py-16">
      <header>
        <div className="flex items-center gap-3">
          <LogoFuoco dimensione="compatto" decorativo />
          <p className="font-heading text-sm font-semibold tracking-tight">{TITOLARE.marchio}</p>
        </div>
        <h1 className="mt-8 font-heading text-3xl font-semibold tracking-tight">Informativa privacy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ultimo aggiornamento: <time dateTime={ULTIMO_AGGIORNAMENTO.iso}>{ULTIMO_AGGIORNAMENTO.testo}</time>
        </p>
        <p className="mt-6">
          Questa informativa spiega come {TITOLARE.marchio} tratta i dati personali di chi ci scrive o interagisce con i
          nostri contenuti su Instagram e Facebook, di chi ci chiede informazioni e dei nostri clienti, secondo il
          Regolamento (UE) 2016/679 (GDPR).
        </p>
      </header>

      <nav aria-label="Indice" className="mt-8 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Indice</p>
        {/* columns, not a grid: the index reads top to bottom, then the next column */}
        <ol className="mt-2 gap-x-6 sm:columns-2">
          {SEZIONI.map((sezione, i) => (
            <li key={sezione.id} className="break-inside-avoid">
              <a
                href={`#${sezione.id}`}
                className="flex min-h-11 items-center gap-2 rounded-sm text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
              >
                <span className="num w-5 shrink-0 text-right text-muted-foreground">{i + 1}.</span>
                <span>{sezione.titolo}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        {SEZIONI.map((sezione, i) => (
          <section key={sezione.id} aria-labelledby={sezione.id} className="space-y-4">
            {/* the anchor sits beside the heading, not inside: its label would
                otherwise become part of the heading's name */}
            <div className="flex items-start gap-1">
              <h2
                id={sezione.id}
                className="min-w-0 flex-1 scroll-mt-6 pt-2 font-heading text-xl font-semibold tracking-tight"
              >
                <span className="num mr-2 text-muted-foreground">{i + 1}.</span>
                {sezione.titolo}
              </h2>
              <a
                href={`#${sezione.id}`}
                aria-label={`Link alla sezione «${sezione.titolo}»`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Hash className="size-4" aria-hidden="true" />
              </a>
            </div>
            {sezione.contenuto}
          </section>
        ))}
      </div>

      <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>
          Per ogni domanda sulla privacy scrivi a <Email />.
        </p>
        <p className="mt-1">
          {TITOLARE.marchio} · {TITOLARE.nome}
        </p>
      </footer>
    </main>
  )
}
