-- Analyses of the calls, demo data (1.37.0): invented, without health words, figures of
-- money or real names. After 50_fathom.sql. The analysis of the first three recorded calls
-- is ready; a fourth waits in the queue (the tests drive the step). Idempotent.
--   1st  closed       · in target · objection: prezzo_cassa
--   2nd  follow-up    · in target · objections: tempo, decisione_condivisa
--   3rd  lost         · not in target · objection: condizioni_personali (no summary)
-- The closer's valuation and the suggestions for the setter exist only for these three.

do $$
declare
  r record;
  n integer := 0;
  v_setter uuid := '22222222-2222-4222-8222-222222222222';
  v_closer uuid := '33333333-3333-4333-8333-333333333333';
begin
  for r in
    select c.id, c.esito from public.calls c
    join public.call_registrazioni x on x.call_id = c.id and x.recording_id is not null
    where c.closer_id = v_closer
    order by x.recording_id
    limit 3
  loop
    n := n + 1;
    update public.call_analisi a
    set stato = 'pronta', riassunto = case n
          when 1 then 'Il lead cerca di tornare in forma dopo anni di lavoro pieno. Ha già provato la palestra e ha mollato. Ha chiuso senza esitare sul percorso a casa.'
          when 2 then 'Il lead è interessato ma ha poco tempo la sera e deve parlarne con la compagna. Chiede come si organizzano gli allenamenti in 40 minuti.'
          else 'Il lead cerca risultati molto rapidi e non ritaglia il tempo richiesto. La call si chiude con una pausa.' end,
        esito_letto = r.esito, in_target = case n when 3 then 'no' else 'si' end,
        lead = jsonb_build_object(
          'in_target', case n when 3 then 'no' else 'si' end,
          'segnali', jsonb_build_array(jsonb_build_object('testo', case n when 3 then 'Cerca il risultato in poche settimane' else 'Racconta un passato sportivo e cosa è andato storto' end,
                                                           'verso', case n when 3 then 'non_in_target' else 'in_target' end)),
          'punto_a', 'Si vede lontano dalla forma di un tempo e lo dice con fastidio.',
          'punto_b', 'Tornare a sentirsi sicuro con se stesso, fit e non grosso.',
          'pain', jsonb_build_array('maglia'), 'desideri', jsonb_build_array('fit_non_grosso'), 'gia_provato', jsonb_build_array('palestra'),
          'frasi', jsonb_build_array('Ho dato priorità assoluta al lavoro'), 'minorenne', false),
        obiezioni = case n
          when 1 then jsonb_build_array(jsonb_build_object('categoria', 'prezzo_cassa', 'sintesi', 'Le spese del momento pesano.', 'gestita', 'si', 'risposta', 'Si è guardato il flusso mese per mese.', 'minuto', '21:10', 'momento', 'chiusura'))
          when 2 then jsonb_build_array(jsonb_build_object('categoria', 'tempo', 'sintesi', 'La sera ha poco tempo.', 'gestita', 'in_parte', 'risposta', 'Sessioni di 40 minuti.', 'minuto', '12:30', 'momento', 'durante'),
                                        jsonb_build_object('categoria', 'decisione_condivisa', 'sintesi', 'Ne deve parlare con la compagna.', 'gestita', 'no', 'risposta', null, 'minuto', '30:05', 'momento', 'chiusura'))
          else jsonb_build_array(jsonb_build_object('categoria', 'condizioni_personali', 'sintesi', null, 'gestita', 'no', 'risposta', null, 'minuto', '09:40', 'momento', 'subito')) end,
        categorie_obiezioni = case n when 1 then array['prezzo_cassa'] when 2 then array['tempo', 'decisione_condivisa'] else array['condizioni_personali'] end,
        pain = array['maglia'], desideri = array['fit_non_grosso'],
        domande = jsonb_build_array('Quanto tempo serve ogni sera?', 'Come ci si organizza senza attrezzi?'),
        convinto_da = case n when 1 then jsonb_build_array('La storia di Dany e i tempi onesti') else null end,
        motivo_proposto = case n when 1 then null when 2 then 'Deve decidere insieme alla compagna e ha poco tempo la sera.' else 'Cerca risultati più rapidi dei tempi onesti del percorso.' end,
        prossimi_passi = jsonb_build_array(jsonb_build_object('cosa', 'Sentire la compagna e rispondere', 'quando', 'giovedì', 'chi', 'lead')),
        momenti = jsonb_build_array(jsonb_build_object('minuto', '12:30', 'etichetta', 'obiezione')),
        spunti_contenuto = jsonb_build_array(jsonb_build_object('idea', 'Allenarsi la sera in 40 minuti dopo una giornata piena', 'perche', 'Il tempo è l''obiezione che torna.')),
        versione_prompt = 'seed', analizzata_il = now() - make_interval(hours => n)
    where a.call_id = r.id;

    insert into public.call_analisi_setter (call_id, in_target, segnali, sapeva, sorprese, obiezioni, analizzata_il)
    values (r.id, case n when 3 then 'no' else 'si' end,
            jsonb_build_array(jsonb_build_object('testo', 'Racconta cosa è andato storto prima', 'verso', 'in_target')),
            array['percorso_a_casa', 'chi_e_dany'],
            jsonb_build_array('Non sapeva che il percorso si fa a casa'),
            case n when 1 then jsonb_build_array(jsonb_build_object('categoria', 'prezzo_cassa', 'sintesi', 'Le spese del momento pesano.'))
                   when 2 then jsonb_build_array(jsonb_build_object('categoria', 'tempo', 'sintesi', 'La sera ha poco tempo.'))
                   else jsonb_build_array(jsonb_build_object('categoria', 'condizioni_personali', 'sintesi', null)) end,
            now() - make_interval(hours => n))
    on conflict (call_id) do nothing;

    insert into public.call_spunti_setter (call_id, setter_id, spunti)
    values (r.id, v_setter, jsonb_build_array('Chiedi in DM quante sere a settimana ha davvero libere.', 'Anticipa che il percorso si fa a casa, senza attrezzi.'))
    on conflict (call_id) do nothing;

    insert into public.call_valutazioni (call_id, closer_id, criteri, livello_proposto, perche, funzionato, da_provare, quota_parlato)
    values (r.id, v_closer,
            jsonb_build_object('scoperta', 'si', 'obiettivo', 'si', 'presentazione', 'in_parte', 'obiezioni', 'si', 'chiusura', case n when 1 then 'si' else 'no' end),
            case n when 1 then 'buona' when 2 then 'discreta' else 'media' end::public.call_performance,
            jsonb_build_array('Ha fatto parlare il lead del suo punto di partenza.', 'La chiusura è arrivata dopo le obiezioni.'),
            jsonb_build_array('Le domande aperte iniziali.'), jsonb_build_array('Fissare subito il giorno del prossimo passo.'), 0.42 + n * 0.03)
    on conflict (call_id) do nothing;
  end loop;
end;
$$;

-- origin of some leads: the seed's reels
insert into public.lead_contenuto (lead_id, shortcode, come, certo, giorno)
select c.lead_id, 'SeedDemo01', 'condivisione', true, (c.programmata_il at time zone 'Europe/Rome')::date - 2
from public.call_analisi a join public.calls c on c.id = a.call_id
on conflict (lead_id) do nothing;
