/**
 * How the dashboard works, in short sections Alfire reads only when asked
 * (the free tier counts every token: the guide stays out of the system prompt).
 */
export const GUIDA = {
  panoramica:
    'Panoramica (/, solo admin): selettore di mese o periodo con confronto col precedente. KPI: cash incassato, revenue firmata, nuovi clienti, rinnovi, margine operativo (cash - provvigioni - costi, tasse escluse). Grafico del cash per mese diviso in nuovo, rinnovo, upsell. Funnel DM → conversazioni → call prenotate → svolte → chiuse. Box "Da incassare" (in ritardo, prossimi 30 giorni) e "In scadenza".',
  vendite:
    'Vendite (/sales): i contratti firmati, cioè chi ha comprato cosa, per quanto e in quante rate. Nuova vendita da Vendite › Nuova vendita (/sales/new); per un cliente già in anagrafica, dalla sua scheda: "Registra la prima vendita" se non ne ha, altrimenti "Registra rinnovo" o "Upsell". Prodotto del catalogo o "Personalizzato" (nome e fine a mano), piano a rate uguali o scritto a mano rata per rata. La somma delle rate deve coincidere col contratto. Dal dettaglio si modificano vendita e rate, si aggiungono o tolgono rate, si elimina la vendita.',
  incassi:
    'Incassi (/payments): i soldi, rata per rata. Una rata è in ritardo se è prevista e la scadenza è passata. "Segna incassata" con la data di oggi già messa; si può annullare, correggere, registrare un rimborso (provvigione negativa nel mese del rimborso).',
  clienti:
    'Clienti (/clients): stato derivato dalle vendite: attivo, in scadenza (finisce entro 30 giorni senza rinnovo), scaduto (finito da meno di 90 giorni), ex cliente, mai attivato. La scheda mostra storico vendite, rate e valore totale nel tempo; "Modifica" corregge contatti, fonte, setter, closer e note.',
  setting:
    'Setting: il setter compila ogni giorno "Oggi" (/today) con i numeri dei DM, salvataggio automatico. Crea un lead solo quando fissa una call ("Nuova call"). Pipeline (/leads): Call fissata → Follow-up → Cliente / Perso, aggiornata a mano. Metriche in /setting: tasso di conversazione, di prenotazione, DM per call, show rate, close rate.',
  call:
    'Call (/calls): il closer registra l’esito (svolta, no show, cancellata, riprogrammata; se svolta: qualificata, chiusa / follow-up / persa). Se chiusa, si apre la nuova vendita precompilata.',
  provvigioni:
    'Provvigioni (/commissions): maturano sull’incasso, non sulla firma: importo incassato × percentuale della regola valida alla data d’incasso e applicabile al tipo di vendita. Le regole si gestiscono in Impostazioni › Regole provvigioni. Si registra il pagamento al setter; il saldo è maturato meno pagato.',
  costi: 'Costi (/expenses): data, categoria (team, software, ads, formazione, altro), importo, ricorrente. Entrano nel margine operativo del mese.',
  progetti:
    'Progetti (/progetti): reparto → progetto → liste con date → task e sotto-task. Livelli: admin, manager (crea e gestisce i suoi progetti), employee (lavora i task suoi). Tempo dichiarato: la sveglia accanto a ogni task avvia il timer, che resta in alto a destra su ogni pagina accanto ad Alfire; fermandolo chiede una nota. Oppure minuti caricati dopo in Il mio tempo (/tempo). Note datate e Gantt per progetto. Reparti e modelli in Impostazioni › Progetti.',
  impostazioni:
    'Impostazioni (admin): Team (inviti via email, ruoli, livelli progetti, disattiva, elimina, unisci profili), Prodotti (prezzo, durata, piano rate abituale), Regole provvigioni, Progetti (reparti e modelli), Esporta CSV per la commercialista, Registro modifiche. Il profilo personale (nome, foto) si apre dalla foto in fondo alla sidebar.',
  permessi:
    'Permessi: l’admin vede tutto. Il setter vede i suoi report, i suoi lead e call, e delle provvigioni solo i suoi totali: mai quanto paga un cliente. Il closer vede le call assegnate a lui e le vendite chiuse da lui. Nessun collaboratore vede costi, margine o compensi altrui.',
} as const

export type ArgomentoGuida = keyof typeof GUIDA

export const ARGOMENTI_GUIDA = Object.keys(GUIDA) as ArgomentoGuida[]
