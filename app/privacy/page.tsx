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
const ULTIMO_AGGIORNAMENTO = { iso: '2026-10-09', testo: '9 ottobre 2026' }

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
            Percorso Alpha su Instagram e Facebook: nome, username, foto profilo pubblica e l’identificativo che la
            piattaforma assegna al tuo account.
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
          chat (per esempio perché sei già un cliente).
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
            artificiale Claude;
          </li>
          <li>
            <strong className="font-semibold">Groq</strong> (Stati Uniti): l’assistente interno del nostro gestionale;
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
            con chi ci chiede informazioni, quando la call si fa in video;
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
        Percorso Alpha si rivolge a persone maggiorenni. Non raccogliamo consapevolmente dati di minori di 18 anni: se
        pensi che un minore ci abbia dato i suoi dati, scrivici e li cancelliamo.
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
