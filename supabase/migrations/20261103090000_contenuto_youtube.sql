-- Piano editoriale: i video di YouTube (Dany, 24/10/2026: «una sezione separata per i video di youtube senza
-- mischiarli con i reel»). Un terzo modello accanto a Reel Topic e Carousel Topic: «YouTube Video». Un video
-- YouTube non si collega mai a un post di Instagram (lo dicono il codice dell'abbinamento e «Collega») e non entra
-- nelle analisi dei reel. Migration a sé: un valore nuovo di un enum non si usa nella transazione che lo aggiunge.
alter type public.contenuto_tipo add value if not exists 'youtube';
