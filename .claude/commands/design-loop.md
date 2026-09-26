Esegui il ciclo di design su: $ARGUMENTS (se vuoto, tutte le pagine).
1. Verifica che l'app giri in locale su http://localhost:3000, altrimenti avviala in background.
2. Lancia il subagent ui-critic sulle pagine indicate.
3. Mostrami l'elenco dei punti e chiedimi quali approvare.
4. Lancia il subagent ui-refiner con i soli punti approvati.
5. Rilancia ui-critic una seconda volta. Massimo 2 giri, poi fermati e riassumi cosa resta aperto.
