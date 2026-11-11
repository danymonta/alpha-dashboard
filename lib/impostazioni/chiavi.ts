/**
 * The guides of Impostazioni › Chiavi e collegamenti (1.38.0, Dany
 * 16/10/2026): for each external connection, where to get or regenerate its
 * key, what to paste and where, how to tell it works, what happens when it
 * expires. Words only: no key, no value, no address of a person. A key is
 * never pasted in a chat (CLAUDE.md section 5): the guide of each says so.
 */
export type ChiaveId = 'instagram' | 'messenger' | 'fathom' | 'calendario' | 'anthropic' | 'groq'

export type GuidaChiave = {
  id: ChiaveId
  titolo: string
  /** What the key is for, in a sentence. */
  aCosaServe: string
  /** Where to go and what to do, in order. */
  passi: string[]
  /** What to paste and where: Vercel's variables are named by their name, never by a value. */
  doveIncollarla: string
  /** How to tell it works. */
  comeCapireCheFunziona: string
  /** What happens when it expires or stops working. */
  seScade: string
}

export const NON_IN_CHAT = 'Non incollare mai una chiave in chat: solo qui o su Vercel. Se è successo, ruotala.'

export const GUIDE_CHIAVI: Record<ChiaveId, GuidaChiave> = {
  instagram: {
    id: 'instagram',
    titolo: 'Instagram',
    aCosaServe: 'Legge i DM dell’account per il report del setter e per l’Insight, e i post e i reel per il calendario dei contenuti.',
    passi: [
      'Apri developers.facebook.com › Le mie app › Alpha DM Reader.',
      'Nel menu a sinistra vai su Instagram › Configurazione API con Business Login.',
      'Al punto «1. Genera token d’accesso» tocca «Genera token» accanto a @_danymonta. Se Instagram lo chiede, accedi con l’account e consenti.',
      'Copia il token che compare.',
      'I permessi devono essere tre: instagram_business_basic, instagram_business_manage_messages e instagram_business_manage_insights. Il terzo (le statistiche dei post) si abilita in Analisi dell’app › Autorizzazioni e funzionalità, con Standard access. Senza, i DM e i post funzionano lo stesso ma mancano views, salvati e condivisioni.',
    ],
    doveIncollarla: 'Nel campo «Token di accesso» qui sotto, poi «Salva il token». Va bene anche con spazi, a capo o virgolette: lo pulisce l’app.',
    comeCapireCheFunziona: 'Sotto compare «Salvato, scade il …» con la data. Poi, in Instagram e Messenger, «Ricalcola ieri» rilegge i DM di ieri e dice quante chat ha letto.',
    seScade: 'Il token dura 60 giorni e l’app lo rinnova da sola ogni settimana. Se non ci riesce, o se Meta lo rifiuta (per esempio dopo un cambio di password dell’account), da 7 giorni prima della scadenza vedi l’avviso qui e il giorno stesso compare in rosso: i DM, l’Insight e i post si fermano finché non incolli un token nuovo. Rifai i passi sopra.',
  },
  messenger: {
    id: 'messenger',
    titolo: 'Messenger',
    aCosaServe: 'Legge le chat Messenger della Pagina Facebook di Percorso Alpha per l’Insight. Non manda mai messaggi.',
    passi: [
      'Apri developers.facebook.com › Le mie app › Alpha DM Reader.',
      'Nel menu a sinistra vai su Messenger › Impostazioni dell’API.',
      'Nella parte dei token di accesso, accanto alla Pagina Facebook di Percorso Alpha, tocca «Genera token» e consenti.',
      'Copia il token della Pagina.',
    ],
    doveIncollarla: 'Nel campo «Token della Pagina» qui sotto, poi «Collega la Pagina»: l’app lo prova su Meta prima di salvarlo.',
    comeCapireCheFunziona: 'Sotto compare «Collegata: Pagina «…»» e la data in cui il token è stato salvato. Se Meta lo rifiuta, non salva niente e lo dice.',
    seScade: 'Se il token smette di funzionare, le chat Messenger non arrivano più nell’Insight e la sua scheda dice «Messenger non collegato». Genera un token nuovo come sopra e incollalo di nuovo.',
  },
  fathom: {
    id: 'fathom',
    titolo: 'Fathom',
    aCosaServe: 'Trova la registrazione di una call dal link incollato dal closer e ne legge trascrizione e riassunto, per l’analisi di Claude.',
    passi: [
      'Apri Fathom e vai su My Settings › API Access.',
      'Tocca «Generate Api Key».',
      'Copia la chiave. Non serve nessun webhook.',
      'Su Fathom, sempre in My Settings, spegni l’uso dei dati dell’account per migliorare i loro modelli; nella condivisione dei link scegli «Solo le persone aggiunte».',
    ],
    doveIncollarla: 'Nel campo «Chiave API» qui sotto, poi «Salva la chiave».',
    comeCapireCheFunziona: 'L’app prova la chiave subito e scrive «Fathom risponde con questa chiave.». Nello stato compare «Fathom è collegato» con il giorno in cui è stata salvata.',
    seScade: 'Se la chiave viene revocata o non vale più, lo stato mostra l’ultimo errore. Il link incollato nel foglio dell’esito si salva lo stesso, ma senza chiave non si trovano le registrazioni né si analizzano le call. Generane una nuova e incollala di nuovo.',
  },
  calendario: {
    id: 'calendario',
    titolo: 'Google Calendar (call di vendita)',
    aCosaServe: 'Conta le call di vendita prenotate ogni giorno dal calendario «Dany Discovery Call», con chi è in target (25+ anni e «Sì» al budget del modulo Calendly). Da lì vengono le call prenotate di tutta la dashboard.',
    passi: [
      'Apri Google Calendar dal computer e tocca l’ingranaggio › Impostazioni.',
      'A sinistra, in «Impostazioni dei miei calendari», scegli «Dany Discovery Call».',
      'In «Autorizzazioni di accesso agli eventi» controlla che «Rendi disponibile pubblicamente» sia spento: il calendario ha età, entrate e nomi dei lead.',
      'Scendi fino a «Integra il calendario» e copia l’«Indirizzo segreto in formato iCal» (finisce con basic.ics e contiene «private-»). Non l’indirizzo pubblico.',
    ],
    doveIncollarla: 'Nel campo «Indirizzo segreto iCal» qui sotto, poi «Salva l’indirizzo». Si salva nel Vault e non si mostra più.',
    comeCapireCheFunziona: 'L’app legge il calendario subito e dice quante call ha letto. In Setter › Contatti compare «Calendario letto» con l’ora; ogni mattina e ogni sera si rilegge da solo, e lì c’è «Aggiorna dal calendario».',
    seScade: 'L’indirizzo segreto non scade. Se lo reimposti in Google (o Google smette di darlo) la lettura fallisce e qui compare l’errore: le prenotate restano quelle già lette. Copia l’indirizzo nuovo e incollalo di nuovo.',
  },
  anthropic: {
    id: 'anthropic',
    titolo: 'Claude (Anthropic)',
    aCosaServe: 'Fa l’Insight delle ultime 24 ore, l’analisi dei reel, l’analisi delle call e gli Spunti del Marketing.',
    passi: [
      'Apri console.anthropic.com › API Keys e tocca «Create Key». La chiave si vede una volta sola: copiala subito.',
      'Apri Vercel › il progetto › Settings › Environment Variables.',
      'Cerca ANTHROPIC_API_KEY (Production): tocca Edit, incolla la chiave nuova e Save. Se non c’è, aggiungila con quel nome.',
      'Vai in Deployments, apri l’ultimo deploy e tocca Redeploy: le variabili nuove valgono dal deploy successivo.',
      'In console.anthropic.com › Settings › Limits controlla il limite di spesa mensile.',
    ],
    doveIncollarla: 'Solo su Vercel, nella variabile ANTHROPIC_API_KEY. L’app non ha un campo dove incollarla e non la mostra mai: qui vedi soltanto se c’è.',
    comeCapireCheFunziona: 'Qui sopra lo stato diventa «Presente su Vercel». Poi in Insight › «Aggiorna dati» il recap parte senza dire che manca la chiave.',
    seScade: 'Se la chiave manca o viene revocata, l’Insight, l’analisi dei reel, delle call e gli Spunti si fermano e lo dicono nelle loro pagine; i lavori restano in coda e ripartono dopo la chiave nuova.',
  },
  groq: {
    id: 'groq',
    titolo: 'Groq (Alfire e voce)',
    aCosaServe: 'Fa funzionare Alfire (la chat e i vocali, con Whisper) e trascrive il parlato dei reel per l’analisi.',
    passi: [
      'Apri console.groq.com › API Keys e tocca «Create API Key». Copiala subito: si vede una volta sola.',
      'Apri Vercel › il progetto › Settings › Environment Variables.',
      'Cerca ALFIRE_API_KEY (Production): tocca Edit, incolla la chiave nuova e Save. Se non c’è, aggiungila con quel nome.',
      'In Deployments apri l’ultimo deploy e tocca Redeploy.',
    ],
    doveIncollarla: 'Solo su Vercel, nella variabile ALFIRE_API_KEY. L’app non ha un campo dove incollarla e non la mostra mai: qui vedi soltanto se c’è.',
    comeCapireCheFunziona: 'Qui sopra lo stato diventa «Presente su Vercel»; Alfire risponde e il microfono trascrive. Per far lavorare Alfire da agente pieno serve il piano Developer su console.groq.com: non si cambia nulla su Vercel.',
    seScade: 'Senza la chiave Alfire è spenta e dice cosa manca; nell’analisi dei reel il parlato non si trascrive e Claude vede soltanto i fotogrammi.',
  },
}

export const ORDINE_CHIAVI: ChiaveId[] = ['instagram', 'messenger', 'fathom', 'calendario', 'anthropic', 'groq']
