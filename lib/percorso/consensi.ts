// I testi dei consensi del cliente (rilascio B1a, docs/onboarding/rilascio-b.md). Ogni versione ha il suo
// sha256 nel seme di clienti_consensi_testi (supabase/migrations/20261109090100_percorso_base.sql): un test
// controlla che coincidano. Un testo nuovo è una versione nuova, con la sua migration.

export type TipoConsenso = 'salute'

export type TestoConsenso = {
  tipo: TipoConsenso
  versione: string
  titolo: string
  testo: string
}

export const CONSENSO_SALUTE: TestoConsenso = {
  tipo: 'salute',
  versione: '2026-11-13',
  titolo: 'Consenso al trattamento dei dati sulla salute',
  testo:
    'Acconsento al trattamento dei dati sulla mia salute che scrivo nel questionario iniziale e nei file che carico, ' +
    'per esempio infortuni, problemi fisici, sonno e alimentazione, da parte di Percorso Alpha. ' +
    'Servono solo a preparare e seguire il mio percorso di allenamento. ' +
    'Li leggono soltanto l’amministratore e i coach di Percorso Alpha, non vanno a nessuna intelligenza artificiale ' +
    'e restano finché sono cliente del percorso. ' +
    'Una copia delle risposte del questionario, senza i file, è conservata anche in un foglio Google di Percorso Alpha, come archivio. ' +
    'Posso revocare il consenso quando voglio scrivendo al mio coach: in quel caso le risposte e i file vengono cancellati, anche dal foglio.',
}

export const CONSENSI_IN_VIGORE: Record<TipoConsenso, TestoConsenso> = {
  salute: CONSENSO_SALUTE,
}

/** Where a client writes to withdraw a consent (the address of the owner in /privacy). */
export const EMAIL_TITOLARE = 'join@percorsoalpha.com'
