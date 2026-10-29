
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "azione": Database["public"]['Enums']["audit_action"],"created_at": string,"dati_dopo": Json | null,"dati_prima": Json | null,"id": string,"record_id": string | null,"tabella": string,"utente_id": string | null
                  }
                  Insert: {
                    "azione": Database["public"]['Enums']["audit_action"],"created_at"?: string,"dati_dopo"?: Json | null,"dati_prima"?: Json | null,"id"?: string,"record_id"?: string | null,"tabella": string,"utente_id"?: string | null
                  }
                  Update: {
                    "azione"?: Database["public"]['Enums']["audit_action"],"created_at"?: string,"dati_dopo"?: Json | null,"dati_prima"?: Json | null,"id"?: string,"record_id"?: string | null,"tabella"?: string,"utente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_utente_id_fkey"
      columns: ["utente_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"call_analisi": {
                  Row: {
                    "analizzata_il": string | null,"call_id": string,"categorie_obiezioni": (string)[],"convinto_da": Json | null,"created_at": string,"desideri": (string)[],"domande": Json | null,"errore": string | null,"esito_letto": string | null,"in_attesa_dal": string,"in_target": string | null,"iniziata_il": string | null,"lead": Json | null,"momenti": Json | null,"motivo": string,"motivo_proposto": string | null,"obiezioni": Json | null,"pain": (string)[],"prossimi_passi": Json | null,"prossimo_tentativo_il": string | null,"recording_id": number | null,"riassunto": string | null,"spunti_contenuto": Json | null,"stato": string,"tentativi": number,"updated_at": string,"versione_prompt": string | null
                  }
                  Insert: {
                    "analizzata_il"?: string | null,"call_id": string,"categorie_obiezioni"?: (string)[],"convinto_da"?: Json | null,"created_at"?: string,"desideri"?: (string)[],"domande"?: Json | null,"errore"?: string | null,"esito_letto"?: string | null,"in_attesa_dal"?: string,"in_target"?: string | null,"iniziata_il"?: string | null,"lead"?: Json | null,"momenti"?: Json | null,"motivo"?: string,"motivo_proposto"?: string | null,"obiezioni"?: Json | null,"pain"?: (string)[],"prossimi_passi"?: Json | null,"prossimo_tentativo_il"?: string | null,"recording_id"?: number | null,"riassunto"?: string | null,"spunti_contenuto"?: Json | null,"stato"?: string,"tentativi"?: number,"updated_at"?: string,"versione_prompt"?: string | null
                  }
                  Update: {
                    "analizzata_il"?: string | null,"call_id"?: string,"categorie_obiezioni"?: (string)[],"convinto_da"?: Json | null,"created_at"?: string,"desideri"?: (string)[],"domande"?: Json | null,"errore"?: string | null,"esito_letto"?: string | null,"in_attesa_dal"?: string,"in_target"?: string | null,"iniziata_il"?: string | null,"lead"?: Json | null,"momenti"?: Json | null,"motivo"?: string,"motivo_proposto"?: string | null,"obiezioni"?: Json | null,"pain"?: (string)[],"prossimi_passi"?: Json | null,"prossimo_tentativo_il"?: string | null,"recording_id"?: number | null,"riassunto"?: string | null,"spunti_contenuto"?: Json | null,"stato"?: string,"tentativi"?: number,"updated_at"?: string,"versione_prompt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "call_analisi_call_id_fkey"
      columns: ["call_id"]
isOneToOne: true
      referencedRelation: "calls"
      referencedColumns: ["id"]
    }
                  ]
                },"call_analisi_setter": {
                  Row: {
                    "analizzata_il": string,"call_id": string,"created_at": string,"in_target": string | null,"obiezioni": NonNullable<Json>,"sapeva": (string)[],"segnali": NonNullable<Json>,"sorprese": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "analizzata_il": string,"call_id": string,"created_at"?: string,"in_target"?: string | null,"obiezioni"?: NonNullable<Json>,"sapeva"?: (string)[],"segnali"?: NonNullable<Json>,"sorprese"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "analizzata_il"?: string,"call_id"?: string,"created_at"?: string,"in_target"?: string | null,"obiezioni"?: NonNullable<Json>,"sapeva"?: (string)[],"segnali"?: NonNullable<Json>,"sorprese"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "call_analisi_setter_call_id_fkey"
      columns: ["call_id"]
isOneToOne: true
      referencedRelation: "calls"
      referencedColumns: ["id"]
    }
                  ]
                },"call_lavori_stato": {
                  Row: {
                    "analisi_attive": boolean,"analisi_mese": number,"costo_max_mese": number,"costo_mese_usd": number,"created_at": string,"giorno_richieste": string | null,"id": boolean,"inviata_il": string | null,"lease_fino_al": string | null,"mese": string,"passo_cosa": string | null,"passo_id": string | null,"passo_rif": string | null,"richieste_oggi": number,"spunti_mese": number,"token_cache_letti": number,"token_cache_scritti": number,"token_input": number,"token_output": number,"ultimo_errore": string | null,"ultimo_esito": string | null,"ultimo_passo_il": string | null,"ultimo_tick_il": string | null,"updated_at": string,"url_passo": string | null
                  }
                  Insert: {
                    "analisi_attive"?: boolean,"analisi_mese"?: number,"costo_max_mese"?: number,"costo_mese_usd"?: number,"created_at"?: string,"giorno_richieste"?: string | null,"id"?: boolean,"inviata_il"?: string | null,"lease_fino_al"?: string | null,"mese"?: string,"passo_cosa"?: string | null,"passo_id"?: string | null,"passo_rif"?: string | null,"richieste_oggi"?: number,"spunti_mese"?: number,"token_cache_letti"?: number,"token_cache_scritti"?: number,"token_input"?: number,"token_output"?: number,"ultimo_errore"?: string | null,"ultimo_esito"?: string | null,"ultimo_passo_il"?: string | null,"ultimo_tick_il"?: string | null,"updated_at"?: string,"url_passo"?: string | null
                  }
                  Update: {
                    "analisi_attive"?: boolean,"analisi_mese"?: number,"costo_max_mese"?: number,"costo_mese_usd"?: number,"created_at"?: string,"giorno_richieste"?: string | null,"id"?: boolean,"inviata_il"?: string | null,"lease_fino_al"?: string | null,"mese"?: string,"passo_cosa"?: string | null,"passo_id"?: string | null,"passo_rif"?: string | null,"richieste_oggi"?: number,"spunti_mese"?: number,"token_cache_letti"?: number,"token_cache_scritti"?: number,"token_input"?: number,"token_output"?: number,"ultimo_errore"?: string | null,"ultimo_esito"?: string | null,"ultimo_passo_il"?: string | null,"ultimo_tick_il"?: string | null,"updated_at"?: string,"url_passo"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"call_pitch": {
                  Row: {
                    "call_id": string,"created_at": string,"created_by": string | null,"id": string,"importo_proposto": number,"updated_at": string
                  }
                  Insert: {
                    "call_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"importo_proposto": number,"updated_at"?: string
                  }
                  Update: {
                    "call_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"importo_proposto"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "call_pitch_call_id_fkey"
      columns: ["call_id"]
isOneToOne: true
      referencedRelation: "calls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "call_pitch_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"call_registrazioni": {
                  Row: {
                    "call_id": string,"created_at": string,"created_by": string | null,"durata_secondi": number | null,"inizio_registrazione": string | null,"link_verificato": string | null,"recording_id": number | null,"stato": string,"updated_at": string,"verificata_il": string | null
                  }
                  Insert: {
                    "call_id": string,"created_at"?: string,"created_by"?: string | null,"durata_secondi"?: number | null,"inizio_registrazione"?: string | null,"link_verificato"?: string | null,"recording_id"?: number | null,"stato": string,"updated_at"?: string,"verificata_il"?: string | null
                  }
                  Update: {
                    "call_id"?: string,"created_at"?: string,"created_by"?: string | null,"durata_secondi"?: number | null,"inizio_registrazione"?: string | null,"link_verificato"?: string | null,"recording_id"?: number | null,"stato"?: string,"updated_at"?: string,"verificata_il"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "call_registrazioni_call_id_fkey"
      columns: ["call_id"]
isOneToOne: true
      referencedRelation: "calls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "call_registrazioni_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"call_spunti_setter": {
                  Row: {
                    "call_id": string,"created_at": string,"setter_id": string,"spunti": NonNullable<Json>,"updated_at": string
                  }
                  Insert: {
                    "call_id": string,"created_at"?: string,"setter_id": string,"spunti"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Update: {
                    "call_id"?: string,"created_at"?: string,"setter_id"?: string,"spunti"?: NonNullable<Json>,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "call_spunti_setter_call_id_fkey"
      columns: ["call_id"]
isOneToOne: true
      referencedRelation: "calls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "call_spunti_setter_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"call_valutazioni": {
                  Row: {
                    "call_id": string,"closer_id": string,"created_at": string,"criteri": NonNullable<Json>,"da_provare": NonNullable<Json>,"decisa_il": string | null,"decisa_livello": Database["public"]['Enums']["call_performance"] | null,"funzionato": NonNullable<Json>,"livello_proposto": Database["public"]['Enums']["call_performance"] | null,"perche": NonNullable<Json>,"quota_parlato": number | null,"updated_at": string
                  }
                  Insert: {
                    "call_id": string,"closer_id": string,"created_at"?: string,"criteri": NonNullable<Json>,"da_provare"?: NonNullable<Json>,"decisa_il"?: string | null,"decisa_livello"?: Database["public"]['Enums']["call_performance"] | null,"funzionato"?: NonNullable<Json>,"livello_proposto"?: Database["public"]['Enums']["call_performance"] | null,"perche"?: NonNullable<Json>,"quota_parlato"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "call_id"?: string,"closer_id"?: string,"created_at"?: string,"criteri"?: NonNullable<Json>,"da_provare"?: NonNullable<Json>,"decisa_il"?: string | null,"decisa_livello"?: Database["public"]['Enums']["call_performance"] | null,"funzionato"?: NonNullable<Json>,"livello_proposto"?: Database["public"]['Enums']["call_performance"] | null,"perche"?: NonNullable<Json>,"quota_parlato"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "call_valutazioni_call_id_fkey"
      columns: ["call_id"]
isOneToOne: true
      referencedRelation: "calls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "call_valutazioni_closer_id_fkey"
      columns: ["closer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"calls": {
                  Row: {
                    "closer_id": string | null,"created_at": string,"created_by": string | null,"di_follow_up": boolean,"esito": Database["public"]['Enums']["call_outcome"] | null,"follow_up_di": string | null,"id": string,"importata": boolean,"lead_id": string,"link_registrazione": string | null,"note": string | null,"note_closer": string | null,"obiezione_principale": string | null,"performance": Database["public"]['Enums']["call_performance"] | null,"prodotto_proposto_id": string | null,"programmata_il": string,"qualificata": boolean | null,"setter_id": string | null,"spostata_dal": string | null,"stato": Database["public"]['Enums']["call_status"],"tipo": Database["public"]['Enums']["call_type"],"updated_at": string,"volte_spostata": number,"call_ha_follow_up": boolean | null,"call_ha_vendita": boolean | null
                  }
                  Insert: {
                    "closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"di_follow_up"?: boolean,"esito"?: Database["public"]['Enums']["call_outcome"] | null,"follow_up_di"?: string | null,"id"?: string,"importata"?: boolean,"lead_id": string,"link_registrazione"?: string | null,"note"?: string | null,"note_closer"?: string | null,"obiezione_principale"?: string | null,"performance"?: Database["public"]['Enums']["call_performance"] | null,"prodotto_proposto_id"?: string | null,"programmata_il": string,"qualificata"?: boolean | null,"setter_id"?: string | null,"spostata_dal"?: string | null,"stato"?: Database["public"]['Enums']["call_status"],"tipo": Database["public"]['Enums']["call_type"],"updated_at"?: string,"volte_spostata"?: number
                  }
                  Update: {
                    "closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"di_follow_up"?: boolean,"esito"?: Database["public"]['Enums']["call_outcome"] | null,"follow_up_di"?: string | null,"id"?: string,"importata"?: boolean,"lead_id"?: string,"link_registrazione"?: string | null,"note"?: string | null,"note_closer"?: string | null,"obiezione_principale"?: string | null,"performance"?: Database["public"]['Enums']["call_performance"] | null,"prodotto_proposto_id"?: string | null,"programmata_il"?: string,"qualificata"?: boolean | null,"setter_id"?: string | null,"spostata_dal"?: string | null,"stato"?: Database["public"]['Enums']["call_status"],"tipo"?: Database["public"]['Enums']["call_type"],"updated_at"?: string,"volte_spostata"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "calls_closer_id_fkey"
      columns: ["closer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calls_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calls_follow_up_di_fkey"
      columns: ["follow_up_di"]
isOneToOne: false
      referencedRelation: "calls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calls_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calls_prodotto_proposto_id_fkey"
      columns: ["prodotto_proposto_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calls_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clienti_cartelle": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"updated_at": string,"url": string
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"updated_at"?: string,"url": string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"updated_at"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clienti_cartelle_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clienti_cartelle_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clienti_cartelle_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clienti_cartelle_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clienti_chiusure": {
                  Row: {
                    "archiviato_il": string | null,"chiuso_il": string,"client_id": string,"created_at": string,"created_by": string | null,"motivo": string | null,"updated_at": string
                  }
                  Insert: {
                    "archiviato_il"?: string | null,"chiuso_il": string,"client_id": string,"created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archiviato_il"?: string | null,"chiuso_il"?: string,"client_id"?: string,"created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clienti_chiusure_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clienti_chiusure_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clienti_chiusure_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clienti_chiusure_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clienti_sospensioni": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"motivo": string | null,"sospeso_il": string,"updated_at": string
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"sospeso_il": string,"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"sospeso_il"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clienti_sospensioni_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clienti_sospensioni_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clienti_sospensioni_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clienti_sospensioni_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "closer_id": string | null,"cognome": string | null,"created_at": string,"created_by": string | null,"email": string | null,"fonte": Database["public"]['Enums']["lead_source"] | null,"id": string,"instagram_handle": string | null,"lead_id": string | null,"nome": string,"note": string | null,"setter_id": string | null,"telefono": string | null,"updated_at": string
                  }
                  Insert: {
                    "closer_id"?: string | null,"cognome"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"fonte"?: Database["public"]['Enums']["lead_source"] | null,"id"?: string,"instagram_handle"?: string | null,"lead_id"?: string | null,"nome": string,"note"?: string | null,"setter_id"?: string | null,"telefono"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "closer_id"?: string | null,"cognome"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"fonte"?: Database["public"]['Enums']["lead_source"] | null,"id"?: string,"instagram_handle"?: string | null,"lead_id"?: string | null,"nome"?: string,"note"?: string | null,"setter_id"?: string | null,"telefono"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_closer_id_fkey"
      columns: ["closer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_payouts": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"importo": number,"metodo": Database["public"]['Enums']["payment_method"] | null,"note": string | null,"pagato_il": string,"periodo": string,"profile_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"importo": number,"metodo"?: Database["public"]['Enums']["payment_method"] | null,"note"?: string | null,"pagato_il": string,"periodo": string,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"importo"?: number,"metodo"?: Database["public"]['Enums']["payment_method"] | null,"note"?: string | null,"pagato_il"?: string,"periodo"?: string,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_payouts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_payouts_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"commission_rules": {
                  Row: {
                    "applica_a": (Database["public"]['Enums']["sale_type"])[],"created_at": string,"created_by": string | null,"id": string,"percentuale": number,"profile_id": string,"updated_at": string,"valida_al": string | null,"valida_dal": string
                  }
                  Insert: {
                    "applica_a"?: (Database["public"]['Enums']["sale_type"])[],"created_at"?: string,"created_by"?: string | null,"id"?: string,"percentuale": number,"profile_id": string,"updated_at"?: string,"valida_al"?: string | null,"valida_dal": string
                  }
                  Update: {
                    "applica_a"?: (Database["public"]['Enums']["sale_type"])[],"created_at"?: string,"created_by"?: string | null,"id"?: string,"percentuale"?: number,"profile_id"?: string,"updated_at"?: string,"valida_al"?: string | null,"valida_dal"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_rules_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_rules_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "categoria": Database["public"]['Enums']["expense_category"],"created_at": string,"created_by": string | null,"data": string,"descrizione": string,"id": string,"importo": number,"ricorrente": boolean,"updated_at": string
                  }
                  Insert: {
                    "categoria": Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"data": string,"descrizione": string,"id"?: string,"importo": number,"ricorrente"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "categoria"?: Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"data"?: string,"descrizione"?: string,"id"?: string,"importo"?: number,"ricorrente"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"fathom_collegamento": {
                  Row: {
                    "chiave_aggiornata_il": string | null,"created_at": string,"id": boolean,"ultima_prova_il": string | null,"ultimo_errore": string | null,"ultimo_errore_il": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "chiave_aggiornata_il"?: string | null,"created_at"?: string,"id"?: boolean,"ultima_prova_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "chiave_aggiornata_il"?: string | null,"created_at"?: string,"id"?: boolean,"ultima_prova_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fathom_collegamento_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"insight_blocchi": {
                  Row: {
                    "canale": Database["public"]['Enums']["insight_canale"],"chiavi": (string)[],"created_at": string,"errore": string | null,"esecuzione_id": string,"id": string,"indice": number,"risultato": Json | null,"servito_da_fallback": boolean,"stato": string,"tentativi": number,"tipo": string,"updated_at": string,"usage": Json | null
                  }
                  Insert: {
                    "canale": Database["public"]['Enums']["insight_canale"],"chiavi"?: (string)[],"created_at"?: string,"errore"?: string | null,"esecuzione_id": string,"id"?: string,"indice": number,"risultato"?: Json | null,"servito_da_fallback"?: boolean,"stato"?: string,"tentativi"?: number,"tipo": string,"updated_at"?: string,"usage"?: Json | null
                  }
                  Update: {
                    "canale"?: Database["public"]['Enums']["insight_canale"],"chiavi"?: (string)[],"created_at"?: string,"errore"?: string | null,"esecuzione_id"?: string,"id"?: string,"indice"?: number,"risultato"?: Json | null,"servito_da_fallback"?: boolean,"stato"?: string,"tentativi"?: number,"tipo"?: string,"updated_at"?: string,"usage"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "insight_blocchi_esecuzione_id_fkey"
      columns: ["esecuzione_id"]
isOneToOne: false
      referencedRelation: "insight_esecuzioni"
      referencedColumns: ["id"]
    }
                  ]
                },"insight_chat": {
                  Row: {
                    "aggiornata_il": string | null,"calendly_inviato_il": string | null,"canale": Database["public"]['Enums']["insight_canale"],"codici_condivisi": (string)[],"completa": boolean,"conversazione_id": string,"created_at": string,"id": string,"letta_da": string | null,"letta_il": string,"messaggi": NonNullable<Json>,"messaggi_letti": number,"minore_14": boolean,"nome": string | null,"non_lead": boolean,"origine_giorno": string | null,"origine_il": string | null,"origine_shortcode": string | null,"origine_tipo": string | null,"ultimo_da": string | null,"ultimo_il": string | null,"ultimo_target": string | null,"updated_at": string,"username": string | null,"utente_id": string | null
                  }
                  Insert: {
                    "aggiornata_il"?: string | null,"calendly_inviato_il"?: string | null,"canale": Database["public"]['Enums']["insight_canale"],"codici_condivisi"?: (string)[],"completa"?: boolean,"conversazione_id": string,"created_at"?: string,"id"?: string,"letta_da"?: string | null,"letta_il"?: string,"messaggi"?: NonNullable<Json>,"messaggi_letti"?: number,"minore_14"?: boolean,"nome"?: string | null,"non_lead"?: boolean,"origine_giorno"?: string | null,"origine_il"?: string | null,"origine_shortcode"?: string | null,"origine_tipo"?: string | null,"ultimo_da"?: string | null,"ultimo_il"?: string | null,"ultimo_target"?: string | null,"updated_at"?: string,"username"?: string | null,"utente_id"?: string | null
                  }
                  Update: {
                    "aggiornata_il"?: string | null,"calendly_inviato_il"?: string | null,"canale"?: Database["public"]['Enums']["insight_canale"],"codici_condivisi"?: (string)[],"completa"?: boolean,"conversazione_id"?: string,"created_at"?: string,"id"?: string,"letta_da"?: string | null,"letta_il"?: string,"messaggi"?: NonNullable<Json>,"messaggi_letti"?: number,"minore_14"?: boolean,"nome"?: string | null,"non_lead"?: boolean,"origine_giorno"?: string | null,"origine_il"?: string | null,"origine_shortcode"?: string | null,"origine_tipo"?: string | null,"ultimo_da"?: string | null,"ultimo_il"?: string | null,"ultimo_target"?: string | null,"updated_at"?: string,"username"?: string | null,"utente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "insight_chat_letta_da_fkey"
      columns: ["letta_da"]
isOneToOne: false
      referencedRelation: "insight_esecuzioni"
      referencedColumns: ["id"]
    }
                  ]
                },"insight_esecuzioni": {
                  Row: {
                    "avvisi": (string)[],"blocchi_fatti": number | null,"blocchi_totali": number | null,"chat_attribuite": number | null,"chat_escluse": number | null,"chat_instagram": number | null,"chat_messenger": number | null,"contenuti": number | null,"contesto_app": Json | null,"costo_usd": number | null,"creata_il": string,"dettagli_recap": NonNullable<Json>,"errore": string | null,"finita_il": string | null,"giorno": string,"id": string,"iniziata_il": string | null,"inviata_il": string | null,"invocazioni": number,"lease_fino_al": string | null,"modello": string | null,"motivo": string,"passo": Database["public"]['Enums']["insight_passo"],"progresso": NonNullable<Json>,"richiesta_da": string | null,"servito_da_fallback": number,"stato": Database["public"]['Enums']["insight_stato_esecuzione"],"tentativi": number,"token_cache_letti": number | null,"token_cache_scritti": number | null,"token_input": number | null,"token_output": number | null,"updated_at": string
                  }
                  Insert: {
                    "avvisi"?: (string)[],"blocchi_fatti"?: number | null,"blocchi_totali"?: number | null,"chat_attribuite"?: number | null,"chat_escluse"?: number | null,"chat_instagram"?: number | null,"chat_messenger"?: number | null,"contenuti"?: number | null,"contesto_app"?: Json | null,"costo_usd"?: number | null,"creata_il"?: string,"dettagli_recap"?: NonNullable<Json>,"errore"?: string | null,"finita_il"?: string | null,"giorno": string,"id"?: string,"iniziata_il"?: string | null,"inviata_il"?: string | null,"invocazioni"?: number,"lease_fino_al"?: string | null,"modello"?: string | null,"motivo": string,"passo"?: Database["public"]['Enums']["insight_passo"],"progresso"?: NonNullable<Json>,"richiesta_da"?: string | null,"servito_da_fallback"?: number,"stato"?: Database["public"]['Enums']["insight_stato_esecuzione"],"tentativi"?: number,"token_cache_letti"?: number | null,"token_cache_scritti"?: number | null,"token_input"?: number | null,"token_output"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "avvisi"?: (string)[],"blocchi_fatti"?: number | null,"blocchi_totali"?: number | null,"chat_attribuite"?: number | null,"chat_escluse"?: number | null,"chat_instagram"?: number | null,"chat_messenger"?: number | null,"contenuti"?: number | null,"contesto_app"?: Json | null,"costo_usd"?: number | null,"creata_il"?: string,"dettagli_recap"?: NonNullable<Json>,"errore"?: string | null,"finita_il"?: string | null,"giorno"?: string,"id"?: string,"iniziata_il"?: string | null,"inviata_il"?: string | null,"invocazioni"?: number,"lease_fino_al"?: string | null,"modello"?: string | null,"motivo"?: string,"passo"?: Database["public"]['Enums']["insight_passo"],"progresso"?: NonNullable<Json>,"richiesta_da"?: string | null,"servito_da_fallback"?: number,"stato"?: Database["public"]['Enums']["insight_stato_esecuzione"],"tentativi"?: number,"token_cache_letti"?: number | null,"token_cache_scritti"?: number | null,"token_input"?: number | null,"token_output"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "insight_esecuzioni_richiesta_da_fkey"
      columns: ["richiesta_da"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"insight_fatto": {
                  Row: {
                    "canale": Database["public"]['Enums']["insight_canale"],"chiave": string,"fatto": boolean,"giorno": string,"id": string
                  }
                  Insert: {
                    "canale": Database["public"]['Enums']["insight_canale"],"chiave": string,"fatto": boolean,"giorno": string,"id"?: string
                  }
                  Update: {
                    "canale"?: Database["public"]['Enums']["insight_canale"],"chiave"?: string,"fatto"?: boolean,"giorno"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "insight_fatto_recap"
      columns: ["giorno","canale"]
isOneToOne: false
      referencedRelation: "insight_recap"
      referencedColumns: ["giorno","canale"]
    }
                  ]
                },"insight_impostazioni": {
                  Row: {
                    "anticipo_minuti": number,"attivo": boolean,"created_at": string,"id": boolean,"ora": string,"storico_dal": string | null,"ultimo_tick_il": string | null,"updated_at": string,"updated_by": string | null,"url_passo": string | null
                  }
                  Insert: {
                    "anticipo_minuti"?: number,"attivo"?: boolean,"created_at"?: string,"id"?: boolean,"ora"?: string,"storico_dal"?: string | null,"ultimo_tick_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"url_passo"?: string | null
                  }
                  Update: {
                    "anticipo_minuti"?: number,"attivo"?: boolean,"created_at"?: string,"id"?: boolean,"ora"?: string,"storico_dal"?: string | null,"ultimo_tick_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"url_passo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "insight_impostazioni_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"insight_profili": {
                  Row: {
                    "created_at": string,"follower": number | null,"letto_il": string,"lo_segui": boolean | null,"nome": string | null,"ti_segue": boolean | null,"updated_at": string,"username": string,"utente_id": string | null,"verificato": boolean | null
                  }
                  Insert: {
                    "created_at"?: string,"follower"?: number | null,"letto_il"?: string,"lo_segui"?: boolean | null,"nome"?: string | null,"ti_segue"?: boolean | null,"updated_at"?: string,"username": string,"utente_id"?: string | null,"verificato"?: boolean | null
                  }
                  Update: {
                    "created_at"?: string,"follower"?: number | null,"letto_il"?: string,"lo_segui"?: boolean | null,"nome"?: string | null,"ti_segue"?: boolean | null,"updated_at"?: string,"username"?: string,"utente_id"?: string | null,"verificato"?: boolean | null
                  }
                  Relationships: [
                    
                  ]
                },"insight_recap": {
                  Row: {
                    "canale": Database["public"]['Enums']["insight_canale"],"created_at": string,"dati": NonNullable<Json>,"esecuzione_id": string | null,"generato_il": string,"giorno": string,"stato": string,"updated_at": string
                  }
                  Insert: {
                    "canale": Database["public"]['Enums']["insight_canale"],"created_at"?: string,"dati": NonNullable<Json>,"esecuzione_id"?: string | null,"generato_il": string,"giorno": string,"stato": string,"updated_at"?: string
                  }
                  Update: {
                    "canale"?: Database["public"]['Enums']["insight_canale"],"created_at"?: string,"dati"?: NonNullable<Json>,"esecuzione_id"?: string | null,"generato_il"?: string,"giorno"?: string,"stato"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "insight_recap_esecuzione_id_fkey"
      columns: ["esecuzione_id"]
isOneToOne: false
      referencedRelation: "insight_esecuzioni"
      referencedColumns: ["id"]
    }
                  ]
                },"insight_schede": {
                  Row: {
                    "canale": Database["public"]['Enums']["insight_canale"],"chiave": string,"created_at": string,"dati": NonNullable<Json>,"esecuzione_id": string,"giorno": string,"id": string,"impronta": string,"tipo": string,"updated_at": string
                  }
                  Insert: {
                    "canale": Database["public"]['Enums']["insight_canale"],"chiave": string,"created_at"?: string,"dati": NonNullable<Json>,"esecuzione_id": string,"giorno": string,"id"?: string,"impronta": string,"tipo": string,"updated_at"?: string
                  }
                  Update: {
                    "canale"?: Database["public"]['Enums']["insight_canale"],"chiave"?: string,"created_at"?: string,"dati"?: NonNullable<Json>,"esecuzione_id"?: string,"giorno"?: string,"id"?: string,"impronta"?: string,"tipo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "insight_schede_esecuzione_id_fkey"
      columns: ["esecuzione_id"]
isOneToOne: false
      referencedRelation: "insight_esecuzioni"
      referencedColumns: ["id"]
    }
                  ]
                },"instagram_account_misure": {
                  Row: {
                    "created_at": string,"follower": number | null,"giorno": string,"letto_il": string,"media": number | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"follower"?: number | null,"giorno": string,"letto_il": string,"media"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"follower"?: number | null,"giorno"?: string,"letto_il"?: string,"media"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"instagram_collegamento": {
                  Row: {
                    "account_id": string | null,"account_username": string | null,"created_at": string,"id": boolean,"setter_id": string | null,"token_aggiornato_il": string | null,"token_scade_il": string | null,"ultimo_calcolo_chat": number | null,"ultimo_calcolo_giorno": string | null,"ultimo_calcolo_il": string | null,"ultimo_errore": string | null,"ultimo_errore_il": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "account_id"?: string | null,"account_username"?: string | null,"created_at"?: string,"id"?: boolean,"setter_id"?: string | null,"token_aggiornato_il"?: string | null,"token_scade_il"?: string | null,"ultimo_calcolo_chat"?: number | null,"ultimo_calcolo_giorno"?: string | null,"ultimo_calcolo_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "account_id"?: string | null,"account_username"?: string | null,"created_at"?: string,"id"?: boolean,"setter_id"?: string | null,"token_aggiornato_il"?: string | null,"token_scade_il"?: string | null,"ultimo_calcolo_chat"?: number | null,"ultimo_calcolo_giorno"?: string | null,"ultimo_calcolo_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instagram_collegamento_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instagram_collegamento_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"instagram_contenuti": {
                  Row: {
                    "audio_tipo": string | null,"avg_watch_ms": number | null,"comments": number | null,"comments_count": number | null,"copertina_url": string | null,"created_at": string,"didascalia": string | null,"durata_ms": number | null,"eliminato_il": string | null,"follows": number | null,"letto_il": string,"like_count": number | null,"likes": number | null,"media_id": string,"media_product_type": string | null,"media_type": string,"metriche_il": string | null,"metriche_stato": string,"permalink": string,"profile_visits": number | null,"pubblicato_il": string,"reach": number | null,"reel": boolean,"reposts": number | null,"saved": number | null,"shares": number | null,"shortcode": string,"skip_rate": number | null,"total_interactions": number | null,"updated_at": string,"video_disponibile": boolean | null,"view_total_ms": number | null,"views": number | null
                  }
                  Insert: {
                    "audio_tipo"?: string | null,"avg_watch_ms"?: number | null,"comments"?: number | null,"comments_count"?: number | null,"copertina_url"?: string | null,"created_at"?: string,"didascalia"?: string | null,"durata_ms"?: number | null,"eliminato_il"?: string | null,"follows"?: number | null,"letto_il"?: string,"like_count"?: number | null,"likes"?: number | null,"media_id": string,"media_product_type"?: string | null,"media_type": string,"metriche_il"?: string | null,"metriche_stato"?: string,"permalink": string,"profile_visits"?: number | null,"pubblicato_il": string,"reach"?: number | null,"reel": boolean,"reposts"?: number | null,"saved"?: number | null,"shares"?: number | null,"shortcode": string,"skip_rate"?: number | null,"total_interactions"?: number | null,"updated_at"?: string,"video_disponibile"?: boolean | null,"view_total_ms"?: number | null,"views"?: number | null
                  }
                  Update: {
                    "audio_tipo"?: string | null,"avg_watch_ms"?: number | null,"comments"?: number | null,"comments_count"?: number | null,"copertina_url"?: string | null,"created_at"?: string,"didascalia"?: string | null,"durata_ms"?: number | null,"eliminato_il"?: string | null,"follows"?: number | null,"letto_il"?: string,"like_count"?: number | null,"likes"?: number | null,"media_id"?: string,"media_product_type"?: string | null,"media_type"?: string,"metriche_il"?: string | null,"metriche_stato"?: string,"permalink"?: string,"profile_visits"?: number | null,"pubblicato_il"?: string,"reach"?: number | null,"reel"?: boolean,"reposts"?: number | null,"saved"?: number | null,"shares"?: number | null,"shortcode"?: string,"skip_rate"?: number | null,"total_interactions"?: number | null,"updated_at"?: string,"video_disponibile"?: boolean | null,"view_total_ms"?: number | null,"views"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"instagram_contenuti_dm": {
                  Row: {
                    "calcolato_il": string,"call_prenotate": number,"dm": number,"dm_certi": number,"giorno": string,"lead_in_target": number,"shortcode": string
                  }
                  Insert: {
                    "calcolato_il"?: string,"call_prenotate": number,"dm": number,"dm_certi": number,"giorno": string,"lead_in_target": number,"shortcode": string
                  }
                  Update: {
                    "calcolato_il"?: string,"call_prenotate"?: number,"dm"?: number,"dm_certi"?: number,"giorno"?: string,"lead_in_target"?: number,"shortcode"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "instagram_contenuti_dm_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "instagram_contenuti_dm_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "instagram_contenuti_dm_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "instagram_contenuti_dm_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "instagram_contenuti_dm_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["shortcode"]
    }
                  ]
                },"instagram_contenuti_dm_giorni": {
                  Row: {
                    "created_at": string,"giorno": string
                  }
                  Insert: {
                    "created_at"?: string,"giorno": string
                  }
                  Update: {
                    "created_at"?: string,"giorno"?: string
                  }
                  Relationships: [
                    
                  ]
                },"instagram_contenuti_misure": {
                  Row: {
                    "avg_watch_ms": number | null,"comments": number | null,"comments_count": number | null,"created_at": string,"eta_ore": number,"follows": number | null,"giorno": string,"letto_il": string,"like_count": number | null,"likes": number | null,"media_id": string,"profile_visits": number | null,"reach": number | null,"reposts": number | null,"saved": number | null,"shares": number | null,"skip_rate": number | null,"total_interactions": number | null,"updated_at": string,"views": number | null
                  }
                  Insert: {
                    "avg_watch_ms"?: number | null,"comments"?: number | null,"comments_count"?: number | null,"created_at"?: string,"eta_ore": number,"follows"?: number | null,"giorno": string,"letto_il": string,"like_count"?: number | null,"likes"?: number | null,"media_id": string,"profile_visits"?: number | null,"reach"?: number | null,"reposts"?: number | null,"saved"?: number | null,"shares"?: number | null,"skip_rate"?: number | null,"total_interactions"?: number | null,"updated_at"?: string,"views"?: number | null
                  }
                  Update: {
                    "avg_watch_ms"?: number | null,"comments"?: number | null,"comments_count"?: number | null,"created_at"?: string,"eta_ore"?: number,"follows"?: number | null,"giorno"?: string,"letto_il"?: string,"like_count"?: number | null,"likes"?: number | null,"media_id"?: string,"profile_visits"?: number | null,"reach"?: number | null,"reposts"?: number | null,"saved"?: number | null,"shares"?: number | null,"skip_rate"?: number | null,"total_interactions"?: number | null,"updated_at"?: string,"views"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instagram_contenuti_misure_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_contenuti_misure_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_contenuti_misure_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_contenuti_misure_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_contenuti_misure_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["media_id"]
    }
                  ]
                },"instagram_contenuti_stato": {
                  Row: {
                    "account_username": string | null,"campi": string | null,"created_at": string,"giro_dal": string | null,"giro_id": string | null,"giro_motivo": string | null,"id": boolean,"metriche_errore": string | null,"metriche_esito": string | null,"metriche_fine_il": string | null,"metriche_gradini": Json | null,"metriche_letti": number | null,"permesso_insights": boolean | null,"permesso_insights_il": string | null,"ultimo_errore": string | null,"ultimo_errore_il": string | null,"ultimo_giro_causa": string | null,"ultimo_giro_collegati": number | null,"ultimo_giro_esito": string | null,"ultimo_giro_il": string | null,"ultimo_giro_letti": number | null,"ultimo_giro_motivo": string | null,"ultimo_giro_proposti": number | null,"updated_at": string
                  }
                  Insert: {
                    "account_username"?: string | null,"campi"?: string | null,"created_at"?: string,"giro_dal"?: string | null,"giro_id"?: string | null,"giro_motivo"?: string | null,"id"?: boolean,"metriche_errore"?: string | null,"metriche_esito"?: string | null,"metriche_fine_il"?: string | null,"metriche_gradini"?: Json | null,"metriche_letti"?: number | null,"permesso_insights"?: boolean | null,"permesso_insights_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"ultimo_giro_causa"?: string | null,"ultimo_giro_collegati"?: number | null,"ultimo_giro_esito"?: string | null,"ultimo_giro_il"?: string | null,"ultimo_giro_letti"?: number | null,"ultimo_giro_motivo"?: string | null,"ultimo_giro_proposti"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "account_username"?: string | null,"campi"?: string | null,"created_at"?: string,"giro_dal"?: string | null,"giro_id"?: string | null,"giro_motivo"?: string | null,"id"?: boolean,"metriche_errore"?: string | null,"metriche_esito"?: string | null,"metriche_fine_il"?: string | null,"metriche_gradini"?: Json | null,"metriche_letti"?: number | null,"permesso_insights"?: boolean | null,"permesso_insights_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"ultimo_giro_causa"?: string | null,"ultimo_giro_collegati"?: number | null,"ultimo_giro_esito"?: string | null,"ultimo_giro_il"?: string | null,"ultimo_giro_letti"?: number | null,"ultimo_giro_motivo"?: string | null,"ultimo_giro_proposti"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"instagram_esclusi": {
                  Row: {
                    "created_at": string,"created_by": string | null,"motivo": string | null,"updated_at": string,"username": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "instagram_esclusi_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"instagram_letture": {
                  Row: {
                    "created_at": string,"errore": string | null,"fonte_visione": string | null,"fotogrammi": number | null,"gancio_parlato": string | null,"ha_audio": boolean | null,"iniziata_il": string | null,"lato_px": number | null,"letta_il": string | null,"media_id": string,"modello_trascrizione": string | null,"modello_visione": string | null,"motivo": string,"priorita": number,"prossimo_il": string | null,"richiesta": string,"ripresa_usata": boolean,"scheda": Json | null,"segmenti": Json | null,"stato": string,"tentativi": number,"trascrizione": string | null,"trascrizione_esito": string | null,"updated_at": string,"versione_prompt_visione": string | null,"video": string | null,"visione_esito": string | null
                  }
                  Insert: {
                    "created_at"?: string,"errore"?: string | null,"fonte_visione"?: string | null,"fotogrammi"?: number | null,"gancio_parlato"?: string | null,"ha_audio"?: boolean | null,"iniziata_il"?: string | null,"lato_px"?: number | null,"letta_il"?: string | null,"media_id": string,"modello_trascrizione"?: string | null,"modello_visione"?: string | null,"motivo": string,"priorita"?: number,"prossimo_il"?: string | null,"richiesta": string,"ripresa_usata"?: boolean,"scheda"?: Json | null,"segmenti"?: Json | null,"stato"?: string,"tentativi"?: number,"trascrizione"?: string | null,"trascrizione_esito"?: string | null,"updated_at"?: string,"versione_prompt_visione"?: string | null,"video"?: string | null,"visione_esito"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"errore"?: string | null,"fonte_visione"?: string | null,"fotogrammi"?: number | null,"gancio_parlato"?: string | null,"ha_audio"?: boolean | null,"iniziata_il"?: string | null,"lato_px"?: number | null,"letta_il"?: string | null,"media_id"?: string,"modello_trascrizione"?: string | null,"modello_visione"?: string | null,"motivo"?: string,"priorita"?: number,"prossimo_il"?: string | null,"richiesta"?: string,"ripresa_usata"?: boolean,"scheda"?: Json | null,"segmenti"?: Json | null,"stato"?: string,"tentativi"?: number,"trascrizione"?: string | null,"trascrizione_esito"?: string | null,"updated_at"?: string,"versione_prompt_visione"?: string | null,"video"?: string | null,"visione_esito"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instagram_letture_media_id_fkey"
      columns: ["media_id"]
isOneToOne: true
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_letture_media_id_fkey"
      columns: ["media_id"]
isOneToOne: true
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_letture_media_id_fkey"
      columns: ["media_id"]
isOneToOne: true
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_letture_media_id_fkey"
      columns: ["media_id"]
isOneToOne: true
      referencedRelation: "v_instagram_post"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "instagram_letture_media_id_fkey"
      columns: ["media_id"]
isOneToOne: true
      referencedRelation: "v_pubblicati"
      referencedColumns: ["media_id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "created_at": string,"email": string,"invitato_da": string | null,"revocato": boolean,"ruolo": Database["public"]['Enums']["app_role"],"updated_at": string,"usato_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"invitato_da"?: string | null,"revocato"?: boolean,"ruolo": Database["public"]['Enums']["app_role"],"updated_at"?: string,"usato_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"invitato_da"?: string | null,"revocato"?: boolean,"ruolo"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"usato_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_invitato_da_fkey"
      columns: ["invitato_da"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_contenuto": {
                  Row: {
                    "certo": boolean,"come": string,"created_at": string,"giorno": string,"lead_id": string,"shortcode": string | null
                  }
                  Insert: {
                    "certo": boolean,"come": string,"created_at"?: string,"giorno": string,"lead_id": string,"shortcode"?: string | null
                  }
                  Update: {
                    "certo"?: boolean,"come"?: string,"created_at"?: string,"giorno"?: string,"lead_id"?: string,"shortcode"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_contenuto_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_contenuto_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "lead_contenuto_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "lead_contenuto_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "lead_contenuto_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "lead_contenuto_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["shortcode"]
    }
                  ]
                },"leads": {
                  Row: {
                    "created_at": string,"created_by": string | null,"fonte": Database["public"]['Enums']["lead_source"],"id": string,"instagram_handle": string | null,"nome": string,"note": string | null,"setter_id": string | null,"stato": Database["public"]['Enums']["lead_status"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"fonte"?: Database["public"]['Enums']["lead_source"],"id"?: string,"instagram_handle"?: string | null,"nome": string,"note"?: string | null,"setter_id"?: string | null,"stato"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"fonte"?: Database["public"]['Enums']["lead_source"],"id"?: string,"instagram_handle"?: string | null,"nome"?: string,"note"?: string | null,"setter_id"?: string | null,"stato"?: Database["public"]['Enums']["lead_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"marketing_abbinamenti": {
                  Row: {
                    "calcolato_il": string,"contenuto_id": string,"esito": string,"giorni": number | null,"motivi": (string)[],"punteggio": number,"shortcode": string,"somiglianza": number
                  }
                  Insert: {
                    "calcolato_il"?: string,"contenuto_id": string,"esito": string,"giorni"?: number | null,"motivi"?: (string)[],"punteggio": number,"shortcode": string,"somiglianza": number
                  }
                  Update: {
                    "calcolato_il"?: string,"contenuto_id"?: string,"esito"?: string,"giorni"?: number | null,"motivi"?: (string)[],"punteggio"?: number,"shortcode"?: string,"somiglianza"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "marketing_contenuti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["shortcode"]
    }
                  ]
                },"marketing_abbinamenti_rifiutati": {
                  Row: {
                    "contenuto_id": string,"created_at": string,"shortcode": string
                  }
                  Insert: {
                    "contenuto_id": string,"created_at"?: string,"shortcode": string
                  }
                  Update: {
                    "contenuto_id"?: string,"created_at"?: string,"shortcode"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_abbinamenti_rifiutati_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "marketing_contenuti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketing_abbinamenti_rifiutati_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_rifiutati_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_rifiutati_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["contenuto_id"]
    }
                  ]
                },"marketing_analisi": {
                  Row: {
                    "contenuto": Json | null,"created_at": string,"errore": string | null,"eta_confronto": number | null,"eta_ore": number | null,"finita_il": string | null,"fonti": Json | null,"id": string,"iniziata_il": string | null,"media_id": string,"modello": string | null,"motivo": string,"numeri": Json | null,"periodo_a": string,"periodo_da": string,"prossimo_il": string | null,"punteggio": Json | null,"punteggio_fascia": string | null,"punteggio_tipo": string | null,"punteggio_totale": number | null,"stato": Database["public"]['Enums']["analisi_stato"],"tentativi": number,"updated_at": string,"verdetto": string | null,"versione_guida": string | null,"versione_prompt": string | null
                  }
                  Insert: {
                    "contenuto"?: Json | null,"created_at"?: string,"errore"?: string | null,"eta_confronto"?: number | null,"eta_ore"?: number | null,"finita_il"?: string | null,"fonti"?: Json | null,"id"?: string,"iniziata_il"?: string | null,"media_id": string,"modello"?: string | null,"motivo": string,"numeri"?: Json | null,"periodo_a": string,"periodo_da": string,"prossimo_il"?: string | null,"punteggio"?: Json | null,"punteggio_fascia"?: string | null,"punteggio_tipo"?: string | null,"punteggio_totale"?: number | null,"stato"?: Database["public"]['Enums']["analisi_stato"],"tentativi"?: number,"updated_at"?: string,"verdetto"?: string | null,"versione_guida"?: string | null,"versione_prompt"?: string | null
                  }
                  Update: {
                    "contenuto"?: Json | null,"created_at"?: string,"errore"?: string | null,"eta_confronto"?: number | null,"eta_ore"?: number | null,"finita_il"?: string | null,"fonti"?: Json | null,"id"?: string,"iniziata_il"?: string | null,"media_id"?: string,"modello"?: string | null,"motivo"?: string,"numeri"?: Json | null,"periodo_a"?: string,"periodo_da"?: string,"prossimo_il"?: string | null,"punteggio"?: Json | null,"punteggio_fascia"?: string | null,"punteggio_tipo"?: string | null,"punteggio_totale"?: number | null,"stato"?: Database["public"]['Enums']["analisi_stato"],"tentativi"?: number,"updated_at"?: string,"verdetto"?: string | null,"versione_guida"?: string | null,"versione_prompt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_analisi_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "marketing_analisi_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "marketing_analisi_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "marketing_analisi_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["media_id"]
    },{
      foreignKeyName: "marketing_analisi_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["media_id"]
    }
                  ]
                },"marketing_contenuti": {
                  Row: {
                    "audio": string | null,"bozza": string | null,"commenti": string | null,"created_at": string,"created_by": string | null,"da_analisi": string | null,"da_idea": number | null,"da_spunti": string | null,"da_spunti_idea": number | null,"finale": string | null,"formato": string | null,"formato_campo": string,"id": string,"inspiration": string | null,"instagram_shortcode": string | null,"messaggio": string | null,"nome": string,"notion_page_id": string | null,"post_date": string | null,"reel_type": string | null,"reel_type_campo": string,"stato": Database["public"]['Enums']["contenuto_status"],"tipo": Database["public"]['Enums']["contenuto_tipo"],"updated_at": string,"url": string | null,"view_count": number | null,"view_count_da_instagram": boolean
                  }
                  Insert: {
                    "audio"?: string | null,"bozza"?: string | null,"commenti"?: string | null,"created_at"?: string,"created_by"?: string | null,"da_analisi"?: string | null,"da_idea"?: number | null,"da_spunti"?: string | null,"da_spunti_idea"?: number | null,"finale"?: string | null,"formato"?: string | null,"formato_campo"?: string,"id"?: string,"inspiration"?: string | null,"instagram_shortcode"?: never,"messaggio"?: string | null,"nome": string,"notion_page_id"?: string | null,"post_date"?: string | null,"reel_type"?: string | null,"reel_type_campo"?: string,"stato"?: Database["public"]['Enums']["contenuto_status"],"tipo"?: Database["public"]['Enums']["contenuto_tipo"],"updated_at"?: string,"url"?: string | null,"view_count"?: number | null,"view_count_da_instagram"?: boolean
                  }
                  Update: {
                    "audio"?: string | null,"bozza"?: string | null,"commenti"?: string | null,"created_at"?: string,"created_by"?: string | null,"da_analisi"?: string | null,"da_idea"?: number | null,"da_spunti"?: string | null,"da_spunti_idea"?: number | null,"finale"?: string | null,"formato"?: string | null,"formato_campo"?: string,"id"?: string,"inspiration"?: string | null,"instagram_shortcode"?: never,"messaggio"?: string | null,"nome"?: string,"notion_page_id"?: string | null,"post_date"?: string | null,"reel_type"?: string | null,"reel_type_campo"?: string,"stato"?: Database["public"]['Enums']["contenuto_status"],"tipo"?: Database["public"]['Enums']["contenuto_tipo"],"updated_at"?: string,"url"?: string | null,"view_count"?: number | null,"view_count_da_instagram"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_contenuti_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketing_contenuti_da_analisi_fkey"
      columns: ["da_analisi"]
isOneToOne: false
      referencedRelation: "marketing_analisi"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketing_contenuti_da_analisi_fkey"
      columns: ["da_analisi"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["analisi_id"]
    },{
      foreignKeyName: "marketing_contenuti_da_analisi_fkey"
      columns: ["da_analisi"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["analisi_id"]
    },{
      foreignKeyName: "marketing_contenuti_da_spunti_fkey"
      columns: ["da_spunti"]
isOneToOne: false
      referencedRelation: "marketing_spunti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketing_contenuti_formato_fkey"
      columns: ["formato_campo","formato"]
isOneToOne: false
      referencedRelation: "marketing_opzioni"
      referencedColumns: ["campo","valore"]
    },{
      foreignKeyName: "marketing_contenuti_reel_type_fkey"
      columns: ["reel_type_campo","reel_type"]
isOneToOne: false
      referencedRelation: "marketing_opzioni"
      referencedColumns: ["campo","valore"]
    }
                  ]
                },"marketing_lavori_stato": {
                  Row: {
                    "automatiche": boolean,"costo_max_mese": number,"costo_mese_usd": number,"created_at": string,"id": boolean,"inviata_il": string | null,"lease_fino_al": string | null,"mese": string,"note_team": boolean,"passo_cosa": string | null,"passo_id": string | null,"passo_rif": string | null,"secondi_audio": number,"token_cache_letti": number,"token_cache_scritti": number,"token_input": number,"token_output": number,"ultimo_errore": string | null,"ultimo_esito": string | null,"ultimo_passo_il": string | null,"ultimo_tick_il": string | null,"updated_at": string,"url_passo": string | null
                  }
                  Insert: {
                    "automatiche"?: boolean,"costo_max_mese"?: number,"costo_mese_usd"?: number,"created_at"?: string,"id"?: boolean,"inviata_il"?: string | null,"lease_fino_al"?: string | null,"mese"?: string,"note_team"?: boolean,"passo_cosa"?: string | null,"passo_id"?: string | null,"passo_rif"?: string | null,"secondi_audio"?: number,"token_cache_letti"?: number,"token_cache_scritti"?: number,"token_input"?: number,"token_output"?: number,"ultimo_errore"?: string | null,"ultimo_esito"?: string | null,"ultimo_passo_il"?: string | null,"ultimo_tick_il"?: string | null,"updated_at"?: string,"url_passo"?: string | null
                  }
                  Update: {
                    "automatiche"?: boolean,"costo_max_mese"?: number,"costo_mese_usd"?: number,"created_at"?: string,"id"?: boolean,"inviata_il"?: string | null,"lease_fino_al"?: string | null,"mese"?: string,"note_team"?: boolean,"passo_cosa"?: string | null,"passo_id"?: string | null,"passo_rif"?: string | null,"secondi_audio"?: number,"token_cache_letti"?: number,"token_cache_scritti"?: number,"token_input"?: number,"token_output"?: number,"ultimo_errore"?: string | null,"ultimo_esito"?: string | null,"ultimo_passo_il"?: string | null,"ultimo_tick_il"?: string | null,"updated_at"?: string,"url_passo"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"marketing_opzioni": {
                  Row: {
                    "campo": string,"colore": string,"created_at": string,"created_by": string | null,"id": string,"nome": string,"ordine": number,"updated_at": string,"valore": string
                  }
                  Insert: {
                    "campo": string,"colore"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"nome": string,"ordine"?: number,"updated_at"?: string,"valore": string
                  }
                  Update: {
                    "campo"?: string,"colore"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"nome"?: string,"ordine"?: number,"updated_at"?: string,"valore"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_opzioni_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"marketing_post_esclusi": {
                  Row: {
                    "created_at": string,"shortcode": string
                  }
                  Insert: {
                    "created_at"?: string,"shortcode": string
                  }
                  Update: {
                    "created_at"?: string,"shortcode"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_post_esclusi_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: true
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_post_esclusi_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: true
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_post_esclusi_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: true
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_post_esclusi_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: true
      referencedRelation: "v_instagram_post"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_post_esclusi_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: true
      referencedRelation: "v_pubblicati"
      referencedColumns: ["shortcode"]
    }
                  ]
                },"marketing_spunti": {
                  Row: {
                    "contenuto": Json | null,"created_at": string,"errore": string | null,"finita_il": string | null,"fonti": Json | null,"id": string,"iniziata_il": string | null,"modello": string | null,"motivo": string,"periodo_a": string,"periodo_da": string,"prossimo_il": string | null,"stato": Database["public"]['Enums']["analisi_stato"],"tentativi": number,"updated_at": string,"versione_prompt": string | null
                  }
                  Insert: {
                    "contenuto"?: Json | null,"created_at"?: string,"errore"?: string | null,"finita_il"?: string | null,"fonti"?: Json | null,"id"?: string,"iniziata_il"?: string | null,"modello"?: string | null,"motivo": string,"periodo_a": string,"periodo_da": string,"prossimo_il"?: string | null,"stato"?: Database["public"]['Enums']["analisi_stato"],"tentativi"?: number,"updated_at"?: string,"versione_prompt"?: string | null
                  }
                  Update: {
                    "contenuto"?: Json | null,"created_at"?: string,"errore"?: string | null,"finita_il"?: string | null,"fonti"?: Json | null,"id"?: string,"iniziata_il"?: string | null,"modello"?: string | null,"motivo"?: string,"periodo_a"?: string,"periodo_da"?: string,"prossimo_il"?: string | null,"stato"?: Database["public"]['Enums']["analisi_stato"],"tentativi"?: number,"updated_at"?: string,"versione_prompt"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"messenger_collegamento": {
                  Row: {
                    "created_at": string,"id": boolean,"pagina_id": string | null,"pagina_nome": string | null,"token_aggiornato_il": string | null,"ultimo_errore": string | null,"ultimo_errore_il": string | null,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: boolean,"pagina_id"?: string | null,"pagina_nome"?: string | null,"token_aggiornato_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: boolean,"pagina_id"?: string | null,"pagina_nome"?: string | null,"token_aggiornato_il"?: string | null,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messenger_collegamento_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"messenger_esclusi": {
                  Row: {
                    "created_at": string,"created_by": string | null,"motivo": string | null,"nome": string,"updated_at": string,"utente_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"nome": string,"updated_at"?: string,"utente_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"motivo"?: string | null,"nome"?: string,"updated_at"?: string,"utente_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messenger_esclusi_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifiche": {
                  Row: {
                    "anteprima": string,"canale": string,"chiave": string,"corpo_html": string | null,"created_at": string,"destinatario_id": string,"dettagli": Json | null,"email_inviata": boolean,"id": string,"letta_il": string | null,"link": string | null,"tipo": string,"titolo": string
                  }
                  Insert: {
                    "anteprima"?: string,"canale"?: string,"chiave": string,"corpo_html"?: string | null,"created_at"?: string,"destinatario_id": string,"dettagli"?: Json | null,"email_inviata"?: boolean,"id"?: string,"letta_il"?: string | null,"link"?: string | null,"tipo": string,"titolo": string
                  }
                  Update: {
                    "anteprima"?: string,"canale"?: string,"chiave"?: string,"corpo_html"?: string | null,"created_at"?: string,"destinatario_id"?: string,"dettagli"?: Json | null,"email_inviata"?: boolean,"id"?: string,"letta_il"?: string | null,"link"?: string | null,"tipo"?: string,"titolo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifiche_destinatario_id_fkey"
      columns: ["destinatario_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifiche_avvisi_emessi": {
                  Row: {
                    "chiave": string,"emessa_il": string
                  }
                  Insert: {
                    "chiave": string,"emessa_il"?: string
                  }
                  Update: {
                    "chiave"?: string,"emessa_il"?: string
                  }
                  Relationships: [
                    
                  ]
                },"obiettivi_mese": {
                  Row: {
                    "cash": number | null,"created_at": string,"created_by": string | null,"mese": string,"nuovi_clienti": number | null,"updated_at": string
                  }
                  Insert: {
                    "cash"?: number | null,"created_at"?: string,"created_by"?: string | null,"mese": string,"nuovi_clienti"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "cash"?: number | null,"created_at"?: string,"created_by"?: string | null,"mese"?: string,"nuovi_clienti"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "obiettivi_mese_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"importo_incassato": number | null,"importo_previsto": number,"incassato_il": string | null,"metodo": Database["public"]['Enums']["payment_method"] | null,"note": string | null,"numero_rata": number,"sale_id": string,"scadenza": string,"stato": Database["public"]['Enums']["payment_status"],"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"importo_incassato"?: number | null,"importo_previsto": number,"incassato_il"?: string | null,"metodo"?: Database["public"]['Enums']["payment_method"] | null,"note"?: string | null,"numero_rata": number,"sale_id": string,"scadenza": string,"stato"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"importo_incassato"?: number | null,"importo_previsto"?: number,"incassato_il"?: string | null,"metodo"?: Database["public"]['Enums']["payment_method"] | null,"note"?: string | null,"numero_rata"?: number,"sale_id"?: string,"scadenza"?: string,"stato"?: Database["public"]['Enums']["payment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "v_provvigioni_maturate"
      referencedColumns: ["sale_id"]
    },{
      foreignKeyName: "payments_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "v_vendite"
      referencedColumns: ["sale_id"]
    }
                  ]
                },"pm_membri": {
                  Row: {
                    "aggiunto_da": string | null,"created_at": string,"id": string,"profile_id": string,"progetto_id": string,"updated_at": string
                  }
                  Insert: {
                    "aggiunto_da"?: string | null,"created_at"?: string,"id"?: string,"profile_id": string,"progetto_id": string,"updated_at"?: string
                  }
                  Update: {
                    "aggiunto_da"?: string | null,"created_at"?: string,"id"?: string,"profile_id"?: string,"progetto_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_membri_aggiunto_da_fkey"
      columns: ["aggiunto_da"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_membri_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_membri_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_membri_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "v_pm_progetti"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_modelli": {
                  Row: {
                    "attivo": boolean,"created_at": string,"created_by": string | null,"descrizione": string | null,"id": string,"nome": string,"per_nuovi_clienti": boolean,"reparto_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"descrizione"?: string | null,"id"?: string,"nome": string,"per_nuovi_clienti"?: boolean,"reparto_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"descrizione"?: string | null,"id"?: string,"nome"?: string,"per_nuovi_clienti"?: boolean,"reparto_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_modelli_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_modelli_reparto_id_fkey"
      columns: ["reparto_id"]
isOneToOne: false
      referencedRelation: "pm_reparti"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_modelli_voci": {
                  Row: {
                    "created_at": string,"descrizione": string | null,"durata_giorni": number | null,"id": string,"inizio_giorni": number | null,"modello_id": string,"ordine": number,"per_ruolo": Database["public"]['Enums']["app_role"] | null,"tasklist": string | null,"titolo": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"descrizione"?: string | null,"durata_giorni"?: number | null,"id"?: string,"inizio_giorni"?: number | null,"modello_id": string,"ordine"?: number,"per_ruolo"?: Database["public"]['Enums']["app_role"] | null,"tasklist"?: string | null,"titolo": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"descrizione"?: string | null,"durata_giorni"?: number | null,"id"?: string,"inizio_giorni"?: number | null,"modello_id"?: string,"ordine"?: number,"per_ruolo"?: Database["public"]['Enums']["app_role"] | null,"tasklist"?: string | null,"titolo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_modelli_voci_modello_id_fkey"
      columns: ["modello_id"]
isOneToOne: false
      referencedRelation: "pm_modelli"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_note": {
                  Row: {
                    "autore_id": string,"created_at": string,"data": string,"id": string,"progetto_id": string,"testo": string,"updated_at": string
                  }
                  Insert: {
                    "autore_id"?: string,"created_at"?: string,"data"?: string,"id"?: string,"progetto_id": string,"testo": string,"updated_at"?: string
                  }
                  Update: {
                    "autore_id"?: string,"created_at"?: string,"data"?: string,"id"?: string,"progetto_id"?: string,"testo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_note_autore_id_fkey"
      columns: ["autore_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_note_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_note_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "v_pm_progetti"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_progetti": {
                  Row: {
                    "client_id": string | null,"coach_id": string | null,"created_at": string,"created_by": string | null,"data_fine": string | null,"data_inizio": string | null,"descrizione": string | null,"id": string,"nome": string,"reparto_id": string,"responsabile_id": string | null,"stato": Database["public"]['Enums']["pm_stato_progetto"],"updated_at": string
                  }
                  Insert: {
                    "client_id"?: string | null,"coach_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_fine"?: string | null,"data_inizio"?: string | null,"descrizione"?: string | null,"id"?: string,"nome": string,"reparto_id": string,"responsabile_id"?: string | null,"stato"?: Database["public"]['Enums']["pm_stato_progetto"],"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string | null,"coach_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_fine"?: string | null,"data_inizio"?: string | null,"descrizione"?: string | null,"id"?: string,"nome"?: string,"reparto_id"?: string,"responsabile_id"?: string | null,"stato"?: Database["public"]['Enums']["pm_stato_progetto"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_progetti_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_progetti_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "pm_progetti_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "pm_progetti_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_progetti_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_progetti_reparto_id_fkey"
      columns: ["reparto_id"]
isOneToOne: false
      referencedRelation: "pm_reparti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_progetti_responsabile_id_fkey"
      columns: ["responsabile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_reparti": {
                  Row: {
                    "attivo": boolean,"created_at": string,"created_by": string | null,"descrizione": string | null,"id": string,"nome": string,"ordine": number,"progetti_con_cliente": boolean,"updated_at": string
                  }
                  Insert: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"descrizione"?: string | null,"id"?: string,"nome": string,"ordine"?: number,"progetti_con_cliente"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"descrizione"?: string | null,"id"?: string,"nome"?: string,"ordine"?: number,"progetti_con_cliente"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_reparti_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_task": {
                  Row: {
                    "completato_il": string | null,"created_at": string,"created_by": string | null,"data_inizio": string | null,"descrizione": string | null,"id": string,"ordine": number,"parent_id": string | null,"per_ruolo": Database["public"]['Enums']["app_role"] | null,"priorita": Database["public"]['Enums']["pm_priorita"],"progetto_id": string,"scadenza": string | null,"stato": Database["public"]['Enums']["pm_stato_task"],"stima_minuti": number | null,"tasklist_id": string | null,"titolo": string,"updated_at": string
                  }
                  Insert: {
                    "completato_il"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_inizio"?: string | null,"descrizione"?: string | null,"id"?: string,"ordine"?: number,"parent_id"?: string | null,"per_ruolo"?: Database["public"]['Enums']["app_role"] | null,"priorita"?: Database["public"]['Enums']["pm_priorita"],"progetto_id": string,"scadenza"?: string | null,"stato"?: Database["public"]['Enums']["pm_stato_task"],"stima_minuti"?: number | null,"tasklist_id"?: string | null,"titolo": string,"updated_at"?: string
                  }
                  Update: {
                    "completato_il"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_inizio"?: string | null,"descrizione"?: string | null,"id"?: string,"ordine"?: number,"parent_id"?: string | null,"per_ruolo"?: Database["public"]['Enums']["app_role"] | null,"priorita"?: Database["public"]['Enums']["pm_priorita"],"progetto_id"?: string,"scadenza"?: string | null,"stato"?: Database["public"]['Enums']["pm_stato_task"],"stima_minuti"?: number | null,"tasklist_id"?: string | null,"titolo"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_task_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "pm_task"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "v_pm_task"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "v_pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_tasklist_id_fkey"
      columns: ["tasklist_id"]
isOneToOne: false
      referencedRelation: "pm_tasklist"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_tasklist_id_fkey"
      columns: ["tasklist_id"]
isOneToOne: false
      referencedRelation: "v_pm_tasklist"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_task_assegnatari": {
                  Row: {
                    "created_at": string,"created_by": string | null,"profile_id": string,"task_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"profile_id": string,"task_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"profile_id"?: string,"task_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_task_assegnatari_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_assegnatari_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_assegnatari_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "pm_task"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_assegnatari_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "v_pm_task"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_tasklist": {
                  Row: {
                    "created_at": string,"created_by": string | null,"data_fine": string | null,"data_inizio": string | null,"descrizione": string | null,"id": string,"nome": string,"ordine": number,"progetto_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"data_fine"?: string | null,"data_inizio"?: string | null,"descrizione"?: string | null,"id"?: string,"nome": string,"ordine"?: number,"progetto_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"data_fine"?: string | null,"data_inizio"?: string | null,"descrizione"?: string | null,"id"?: string,"nome"?: string,"ordine"?: number,"progetto_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_tasklist_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_tasklist_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_tasklist_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "v_pm_progetti"
      referencedColumns: ["id"]
    }
                  ]
                },"pm_tempo": {
                  Row: {
                    "created_at": string,"data": string,"fine": string | null,"id": string,"inizio": string | null,"minuti": number | null,"nota": string | null,"pausa_dal": string | null,"pausa_secondi": number,"profile_id": string,"progetto_id": string,"task_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"data": string,"fine"?: string | null,"id"?: string,"inizio"?: string | null,"minuti"?: number | null,"nota"?: string | null,"pausa_dal"?: string | null,"pausa_secondi"?: number,"profile_id"?: string,"progetto_id": string,"task_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"data"?: string,"fine"?: string | null,"id"?: string,"inizio"?: string | null,"minuti"?: number | null,"nota"?: string | null,"pausa_dal"?: string | null,"pausa_secondi"?: number,"profile_id"?: string,"progetto_id"?: string,"task_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_tempo_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_tempo_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_tempo_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "v_pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_tempo_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "pm_task"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_tempo_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "v_pm_task"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "attivo": boolean,"created_at": string,"created_by": string | null,"durata_mesi": number,"id": string,"nome": string,"piano_predefinito": Json | null,"prezzo_listino": number,"updated_at": string
                  }
                  Insert: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"durata_mesi": number,"id"?: string,"nome": string,"piano_predefinito"?: Json | null,"prezzo_listino": number,"updated_at"?: string
                  }
                  Update: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"durata_mesi"?: number,"id"?: string,"nome"?: string,"piano_predefinito"?: Json | null,"prezzo_listino"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "attivo": boolean,"created_at": string,"email": string,"foto_url": string | null,"id": string,"livello_pm": Database["public"]['Enums']["pm_livello"],"nome": string,"ruolo": Database["public"]['Enums']["app_role"],"tutorial_visto": boolean,"updated_at": string
                  }
                  Insert: {
                    "attivo"?: boolean,"created_at"?: string,"email": string,"foto_url"?: string | null,"id": string,"livello_pm"?: Database["public"]['Enums']["pm_livello"],"nome": string,"ruolo": Database["public"]['Enums']["app_role"],"tutorial_visto"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "attivo"?: boolean,"created_at"?: string,"email"?: string,"foto_url"?: string | null,"id"?: string,"livello_pm"?: Database["public"]['Enums']["pm_livello"],"nome"?: string,"ruolo"?: Database["public"]['Enums']["app_role"],"tutorial_visto"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"promemoria_percorso": {
                  Row: {
                    "client_id": string,"created_at": string,"created_by": string | null,"data_fine": string,"esito": Database["public"]['Enums']["promemoria_esito"],"id": string,"sale_id": string | null,"tipo": Database["public"]['Enums']["promemoria_tipo"],"updated_at": string
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"created_by"?: string | null,"data_fine": string,"esito": Database["public"]['Enums']["promemoria_esito"],"id"?: string,"sale_id"?: string | null,"tipo": Database["public"]['Enums']["promemoria_tipo"],"updated_at"?: string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"created_by"?: string | null,"data_fine"?: string,"esito"?: Database["public"]['Enums']["promemoria_esito"],"id"?: string,"sale_id"?: string | null,"tipo"?: Database["public"]['Enums']["promemoria_tipo"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "promemoria_percorso_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promemoria_percorso_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "promemoria_percorso_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "promemoria_percorso_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promemoria_percorso_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promemoria_percorso_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "v_provvigioni_maturate"
      referencedColumns: ["sale_id"]
    },{
      foreignKeyName: "promemoria_percorso_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "v_vendite"
      referencedColumns: ["sale_id"]
    }
                  ]
                },"rate_notificate": {
                  Row: {
                    "notificata_il": string,"payment_id": string
                  }
                  Insert: {
                    "notificata_il"?: string,"payment_id": string
                  }
                  Update: {
                    "notificata_il"?: string,"payment_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rate_notificate_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rate_notificate_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "v_provvigioni_maturate"
      referencedColumns: ["payment_id"]
    },{
      foreignKeyName: "rate_notificate_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "v_rate"
      referencedColumns: ["payment_id"]
    }
                  ]
                },"report_proposte_instagram": {
                  Row: {
                    "calcolato_il": string,"call_proposte": number,"chat_incerte": number,"chat_lette": number,"conversazioni": number,"corretta": boolean,"created_at": string,"data": string,"deciso_da": string | null,"deciso_il": string | null,"discovery_prenotate": number,"dm_inbound": number,"dm_outbound": number,"follow_up": number,"id": string,"setter_id": string,"stato": Database["public"]['Enums']["proposta_stato"],"updated_at": string
                  }
                  Insert: {
                    "calcolato_il"?: string,"call_proposte"?: number,"chat_incerte"?: number,"chat_lette"?: number,"conversazioni"?: number,"corretta"?: boolean,"created_at"?: string,"data": string,"deciso_da"?: string | null,"deciso_il"?: string | null,"discovery_prenotate"?: number,"dm_inbound"?: number,"dm_outbound"?: number,"follow_up"?: number,"id"?: string,"setter_id": string,"stato"?: Database["public"]['Enums']["proposta_stato"],"updated_at"?: string
                  }
                  Update: {
                    "calcolato_il"?: string,"call_proposte"?: number,"chat_incerte"?: number,"chat_lette"?: number,"conversazioni"?: number,"corretta"?: boolean,"created_at"?: string,"data"?: string,"deciso_da"?: string | null,"deciso_il"?: string | null,"discovery_prenotate"?: number,"dm_inbound"?: number,"dm_outbound"?: number,"follow_up"?: number,"id"?: string,"setter_id"?: string,"stato"?: Database["public"]['Enums']["proposta_stato"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "report_proposte_instagram_deciso_da_fkey"
      columns: ["deciso_da"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "report_proposte_instagram_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "call_id": string | null,"client_id": string,"closer_id": string | null,"created_at": string,"created_by": string | null,"data_fine": string,"data_inizio": string,"data_vendita": string,"id": string,"note": string | null,"numero_rate": number,"prodotto_personalizzato": string | null,"product_id": string | null,"setter_id": string | null,"tipo": Database["public"]['Enums']["sale_type"],"updated_at": string,"valore_contratto": number
                  }
                  Insert: {
                    "call_id"?: string | null,"client_id": string,"closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_fine": string,"data_inizio": string,"data_vendita": string,"id"?: string,"note"?: string | null,"numero_rate"?: number,"prodotto_personalizzato"?: string | null,"product_id"?: string | null,"setter_id"?: string | null,"tipo": Database["public"]['Enums']["sale_type"],"updated_at"?: string,"valore_contratto": number
                  }
                  Update: {
                    "call_id"?: string | null,"client_id"?: string,"closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_fine"?: string,"data_inizio"?: string,"data_vendita"?: string,"id"?: string,"note"?: string | null,"numero_rate"?: number,"prodotto_personalizzato"?: string | null,"product_id"?: string | null,"setter_id"?: string | null,"tipo"?: Database["public"]['Enums']["sale_type"],"updated_at"?: string,"valore_contratto"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_call_id_fkey"
      columns: ["call_id"]
isOneToOne: false
      referencedRelation: "calls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "sales_closer_id_fkey"
      columns: ["closer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"setter_daily_reports": {
                  Row: {
                    "call_proposte": number,"call_qualificate": number,"contenuto_pubblicato": boolean,"conversazioni": number,"cosa_frenava": string | null,"created_at": string,"created_by": string | null,"data": string,"discovery_prenotate": number,"discovery_svolte": number,"dm_inbound": number,"dm_outbound": number,"dm_totali": number | null,"domande_contenuti": string | null,"follow_up": number,"id": string,"lead_in_target": Database["public"]['Enums']["quota_in_target"] | null,"note": string | null,"qualita_conversazioni": Database["public"]['Enums']["qualita_conversazioni"] | null,"setter_id": string,"strategy_prenotate": number,"updated_at": string
                  }
                  Insert: {
                    "call_proposte"?: number,"call_qualificate"?: number,"contenuto_pubblicato"?: boolean,"conversazioni"?: number,"cosa_frenava"?: string | null,"created_at"?: string,"created_by"?: string | null,"data": string,"discovery_prenotate"?: number,"discovery_svolte"?: number,"dm_inbound"?: number,"dm_outbound"?: number,"dm_totali"?: never,"domande_contenuti"?: string | null,"follow_up"?: number,"id"?: string,"lead_in_target"?: Database["public"]['Enums']["quota_in_target"] | null,"note"?: string | null,"qualita_conversazioni"?: Database["public"]['Enums']["qualita_conversazioni"] | null,"setter_id": string,"strategy_prenotate"?: number,"updated_at"?: string
                  }
                  Update: {
                    "call_proposte"?: number,"call_qualificate"?: number,"contenuto_pubblicato"?: boolean,"conversazioni"?: number,"cosa_frenava"?: string | null,"created_at"?: string,"created_by"?: string | null,"data"?: string,"discovery_prenotate"?: number,"discovery_svolte"?: number,"dm_inbound"?: number,"dm_outbound"?: number,"dm_totali"?: never,"domande_contenuti"?: string | null,"follow_up"?: number,"id"?: string,"lead_in_target"?: Database["public"]['Enums']["quota_in_target"] | null,"note"?: string | null,"qualita_conversazioni"?: Database["public"]['Enums']["qualita_conversazioni"] | null,"setter_id"?: string,"strategy_prenotate"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "setter_daily_reports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "setter_daily_reports_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"vendite_contratti": {
                  Row: {
                    "created_at": string,"created_by": string | null,"sale_id": string,"updated_at": string,"url": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"sale_id": string,"updated_at"?: string,"url": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"sale_id"?: string,"updated_at"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vendite_contratti_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendite_contratti_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: true
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vendite_contratti_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: true
      referencedRelation: "v_provvigioni_maturate"
      referencedColumns: ["sale_id"]
    },{
      foreignKeyName: "vendite_contratti_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: true
      referencedRelation: "v_vendite"
      referencedColumns: ["sale_id"]
    }
                  ]
                }
          }
          Views: {
            "v_analisi_reel": {
                  Row: {
                    "analisi_errore": string | null,"analisi_eta_confronto": number | null,"analisi_eta_ore": number | null,"analisi_finita_il": string | null,"analisi_id": string | null,"analisi_motivo": string | null,"analisi_stato": Database["public"]['Enums']["analisi_stato"] | null,"analisi_verdetto": string | null,"avg_watch_ms": number | null,"call_14g": number | null,"call_prenotate": number | null,"classificazione_formato": string | null,"classificazione_reel_type": string | null,"comments": number | null,"comments_count": number | null,"confronto": string | null,"contenuto_id": string | null,"copertina_url": string | null,"didascalia_inizio": string | null,"dm": number | null,"dm_14g": number | null,"durata_ms": number | null,"eliminato": boolean | null,"eta_confronto": number | null,"eta_ore": number | null,"fascia_lead": string | null,"fascia_pubblico": string | null,"fonte_visione": string | null,"formato": string | null,"giorno": string | null,"in_target_14g": number | null,"lead_completi": boolean | null,"lead_contati": boolean | null,"lead_in_target": number | null,"lettura_errore": string | null,"lettura_richiesta": string | null,"lettura_stato": string | null,"lettura_video": string | null,"like_count": number | null,"likes": number | null,"media_id": string | null,"media_type": string | null,"metriche_il": string | null,"metriche_stato": string | null,"nome": string | null,"numeri_parziali": boolean | null,"permalink": string | null,"pubblicato_il": string | null,"punteggio_fascia": string | null,"punteggio_tipo": string | null,"punteggio_totale": number | null,"quota_vista": number | null,"reach": number | null,"reel_type": string | null,"salvataggi_rapporto": number | null,"saved": number | null,"shares": number | null,"shortcode": string | null,"skip_rate": number | null,"stato_collegamento": string | null,"status": Database["public"]['Enums']["contenuto_status"] | null,"tasso_condivisioni": number | null,"tasso_salvataggi": number | null,"trascrizione_esito": string | null,"verdetto_oggi": string | null,"video_disponibile": boolean | null,"views": number | null,"views_3g": number | null,"views_7g": number | null,"views_all_eta": number | null,"views_confronto": number | null,"views_rapporto": number | null,"visione_esito": string | null,"visione_media_s": number | null,"visione_su_durata": number | null
                  }
                  Relationships: [
                    
                  ]
                },"v_client_status": {
                  Row: {
                    "client_id": string | null,"cognome": string | null,"data_fine_ultima": string | null,"nome": string | null,"numero_vendite": number | null,"stato": Database["public"]['Enums']["client_status"] | null
                  }
                  Relationships: [
                    
                  ]
                },"v_clienti": {
                  Row: {
                    "client_id": string | null,"closer_id": string | null,"cognome": string | null,"created_at": string | null,"da_incassare": number | null,"data_fine_ultima": string | null,"fonte": Database["public"]['Enums']["lead_source"] | null,"in_ritardo": number | null,"incassato": number | null,"instagram_handle": string | null,"nome": string | null,"numero_vendite": number | null,"setter_id": string | null,"stato": Database["public"]['Enums']["client_status"] | null,"ultima_vendita": string | null,"valore_firmato": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_closer_id_fkey"
      columns: ["closer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"v_clienti_chiusi": {
                  Row: {
                    "archiviato_il": string | null,"chiuso_il": string | null,"client_id": string | null,"created_at": string | null,"motivo": string | null
                  }
                  Insert: {
                           "archiviato_il"?: string | null,"chiuso_il"?: string | null,"client_id"?: string | null,"created_at"?: string | null,"motivo"?: string | null
                         }
                        Update: {
                           "archiviato_il"?: string | null,"chiuso_il"?: string | null,"client_id"?: string | null,"created_at"?: string | null,"motivo"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "clienti_chiusure_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clienti_chiusure_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "clienti_chiusure_client_id_fkey"
      columns: ["client_id"]
isOneToOne: true
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    }
                  ]
                },"v_instagram_mediane": {
                  Row: {
                    "quanti": number | null,"tasso_condivisioni_mediana": number | null,"tasso_condivisioni_quanti": number | null,"tasso_salvataggi_mediana": number | null,"tasso_salvataggi_quanti": number | null,"tipo": string | null,"views_3g_mediana": number | null,"views_3g_quanti": number | null,"views_mediana": number | null,"views_quanti": number | null,"visione_su_durata_mediana": number | null,"visione_su_durata_quanti": number | null
                  }
                  Relationships: [
                    
                  ]
                },"v_instagram_numeri": {
                  Row: {
                    "audio_tipo": string | null,"avg_watch_ms": number | null,"call_14g": number | null,"call_prenotate": number | null,"comments": number | null,"comments_count": number | null,"copertina_url": string | null,"dm": number | null,"dm_14g": number | null,"dm_7g": number | null,"dm_ogni_mille_views": number | null,"durata_ms": number | null,"eliminato": boolean | null,"eta_ore": number | null,"follows": number | null,"giorno": string | null,"in_target_14g": number | null,"lead_completi": boolean | null,"lead_contati": boolean | null,"lead_giorni": number | null,"lead_giorni_contati": number | null,"lead_in_target": number | null,"like_count": number | null,"likes": number | null,"media_id": string | null,"media_product_type": string | null,"media_type": string | null,"metriche_il": string | null,"metriche_stato": string | null,"numeri_parziali": boolean | null,"permalink": string | null,"profile_visits": number | null,"pubblicato_il": string | null,"reach": number | null,"reach_3g": number | null,"reel": boolean | null,"reposts": number | null,"saved": number | null,"saved_3g": number | null,"shares": number | null,"shares_3g": number | null,"shortcode": string | null,"skip_rate": number | null,"tasso_condivisioni": number | null,"tasso_interazioni": number | null,"tasso_salvataggi": number | null,"total_interactions": number | null,"video_disponibile": boolean | null,"views": number | null,"views_30g": number | null,"views_3g": number | null,"views_7g": number | null,"views_per_account": number | null,"visione_su_durata": number | null
                  }
                  Relationships: [
                    
                  ]
                },"v_instagram_post": {
                  Row: {
                    "collegato_da_solo": boolean | null,"contenuto_id": string | null,"contenuto_nome": string | null,"contenuto_post_date": string | null,"contenuto_stato": Database["public"]['Enums']["contenuto_status"] | null,"copertina_url": string | null,"didascalia": string | null,"eliminato_il": string | null,"giorno": string | null,"media_id": string | null,"media_type": string | null,"motivi_collegamento": (string)[] | null,"permalink": string | null,"pubblicato_il": string | null,"reel": boolean | null,"shortcode": string | null,"stato_collegamento": string | null
                  }
                  Relationships: [
                    
                  ]
                },"v_marketing_proposte": {
                  Row: {
                    "calcolato_il": string | null,"contenuto_id": string | null,"giorni": number | null,"motivi": (string)[] | null,"nome": string | null,"post_date": string | null,"punteggio": number | null,"shortcode": string | null,"somiglianza": number | null,"stato": Database["public"]['Enums']["contenuto_status"] | null,"tipo": Database["public"]['Enums']["contenuto_tipo"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "marketing_contenuti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_contenuto_id_fkey"
      columns: ["contenuto_id"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["contenuto_id"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "instagram_contenuti"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_analisi_reel"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_numeri"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_instagram_post"
      referencedColumns: ["shortcode"]
    },{
      foreignKeyName: "marketing_abbinamenti_shortcode_fkey"
      columns: ["shortcode"]
isOneToOne: false
      referencedRelation: "v_pubblicati"
      referencedColumns: ["shortcode"]
    }
                  ]
                },"v_pm_progetti": {
                  Row: {
                    "avanzamento": number | null,"client_id": string | null,"coach_id": string | null,"created_at": string | null,"data_fine": string | null,"data_inizio": string | null,"descrizione": string | null,"id": string | null,"nome": string | null,"reparto_id": string | null,"responsabile_id": string | null,"scaduto": boolean | null,"sono_membro": boolean | null,"stato": Database["public"]['Enums']["pm_stato_progetto"] | null,"task_completati": number | null,"task_in_ritardo": number | null,"task_totali": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_progetti_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_progetti_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "pm_progetti_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "pm_progetti_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_progetti_reparto_id_fkey"
      columns: ["reparto_id"]
isOneToOne: false
      referencedRelation: "pm_reparti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_progetti_responsabile_id_fkey"
      columns: ["responsabile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"v_pm_task": {
                  Row: {
                    "assegnatari": (string)[] | null,"completato_il": string | null,"created_at": string | null,"created_by": string | null,"data_inizio": string | null,"descrizione": string | null,"id": string | null,"in_ritardo": boolean | null,"ordine": number | null,"parent_id": string | null,"priorita": Database["public"]['Enums']["pm_priorita"] | null,"progetto_id": string | null,"scadenza": string | null,"sotto_task_completati": number | null,"sotto_task_totali": number | null,"stato": Database["public"]['Enums']["pm_stato_task"] | null,"stima_minuti": number | null,"tasklist_id": string | null,"titolo": string | null,"updated_at": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_task_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "pm_task"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "v_pm_task"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "v_pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_tasklist_id_fkey"
      columns: ["tasklist_id"]
isOneToOne: false
      referencedRelation: "pm_tasklist"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_task_tasklist_id_fkey"
      columns: ["tasklist_id"]
isOneToOne: false
      referencedRelation: "v_pm_tasklist"
      referencedColumns: ["id"]
    }
                  ]
                },"v_pm_tasklist": {
                  Row: {
                    "avanzamento": number | null,"created_at": string | null,"data_fine": string | null,"data_inizio": string | null,"descrizione": string | null,"id": string | null,"nome": string | null,"ordine": number | null,"progetto_id": string | null,"task_completati": number | null,"task_in_ritardo": number | null,"task_totali": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pm_tasklist_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "pm_progetti"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pm_tasklist_progetto_id_fkey"
      columns: ["progetto_id"]
isOneToOne: false
      referencedRelation: "v_pm_progetti"
      referencedColumns: ["id"]
    }
                  ]
                },"v_provvigioni_maturate": {
                  Row: {
                    "importo_incassato": number | null,"incassato_il": string | null,"mese": string | null,"payment_id": string | null,"percentuale": number | null,"profile_id": string | null,"provvigione": number | null,"sale_id": string | null,"tipo": Database["public"]['Enums']["sale_type"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_setter_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"v_pubblicati": {
                  Row: {
                    "analisi_errore": string | null,"analisi_eta_confronto": number | null,"analisi_eta_ore": number | null,"analisi_finita_il": string | null,"analisi_id": string | null,"analisi_motivo": string | null,"analisi_stato": Database["public"]['Enums']["analisi_stato"] | null,"analisi_verdetto": string | null,"avg_watch_ms": number | null,"call_14g": number | null,"call_prenotate": number | null,"classificazione_formato": string | null,"classificazione_reel_type": string | null,"comments": number | null,"comments_count": number | null,"confronto": string | null,"contenuto_id": string | null,"copertina_url": string | null,"didascalia": string | null,"didascalia_inizio": string | null,"dm": number | null,"dm_14g": number | null,"durata_ms": number | null,"eliminato": boolean | null,"eta_confronto": number | null,"eta_ore": number | null,"fascia_lead": string | null,"fascia_pubblico": string | null,"fonte_visione": string | null,"formato": string | null,"giorno": string | null,"in_target_14g": number | null,"lead_completi": boolean | null,"lead_contati": boolean | null,"lead_in_target": number | null,"lettura_errore": string | null,"lettura_richiesta": string | null,"lettura_stato": string | null,"lettura_video": string | null,"like_count": number | null,"likes": number | null,"media_id": string | null,"media_type": string | null,"metriche_il": string | null,"metriche_stato": string | null,"nome": string | null,"numeri_parziali": boolean | null,"permalink": string | null,"pubblicato_il": string | null,"punteggio_fascia": string | null,"punteggio_tipo": string | null,"punteggio_totale": number | null,"quota_vista": number | null,"reach": number | null,"reel": boolean | null,"reel_type": string | null,"salvataggi_rapporto": number | null,"saved": number | null,"shares": number | null,"shortcode": string | null,"skip_rate": number | null,"status": Database["public"]['Enums']["contenuto_status"] | null,"tasso_condivisioni": number | null,"tasso_salvataggi": number | null,"trascrizione_esito": string | null,"verdetto_oggi": string | null,"video_disponibile": boolean | null,"view_count": number | null,"view_count_da_instagram": boolean | null,"views": number | null,"views_3g": number | null,"views_7g": number | null,"views_all_eta": number | null,"views_confronto": number | null,"views_rapporto": number | null,"visione_esito": string | null,"visione_media_s": number | null,"visione_su_durata": number | null
                  }
                  Relationships: [
                    
                  ]
                },"v_rate": {
                  Row: {
                    "client_id": string | null,"cliente": string | null,"closer_id": string | null,"giorni_ritardo": number | null,"importo_incassato": number | null,"importo_previsto": number | null,"in_ritardo": boolean | null,"incassato_il": string | null,"metodo": Database["public"]['Enums']["payment_method"] | null,"numero_rata": number | null,"payment_id": string | null,"sale_id": string | null,"scadenza": string | null,"setter_id": string | null,"stato": Database["public"]['Enums']["payment_status"] | null,"tipo": Database["public"]['Enums']["sale_type"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "v_provvigioni_maturate"
      referencedColumns: ["sale_id"]
    },{
      foreignKeyName: "payments_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "v_vendite"
      referencedColumns: ["sale_id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "sales_closer_id_fkey"
      columns: ["closer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"v_vendite": {
                  Row: {
                    "call_id": string | null,"client_id": string | null,"closer_id": string | null,"da_incassare": number | null,"data_fine": string | null,"data_inizio": string | null,"data_vendita": string | null,"in_ritardo": number | null,"incassato": number | null,"numero_rate": number | null,"product_id": string | null,"prossima_scadenza": string | null,"rate_in_ritardo": number | null,"rate_incassate": number | null,"rate_totali": number | null,"sale_id": string | null,"scarto_piano": number | null,"setter_id": string | null,"tipo": Database["public"]['Enums']["sale_type"] | null,"totale_piano": number | null,"valore_contratto": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_call_id_fkey"
      columns: ["call_id"]
isOneToOne: false
      referencedRelation: "calls"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_client_status"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "sales_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "v_clienti"
      referencedColumns: ["client_id"]
    },{
      foreignKeyName: "sales_closer_id_fkey"
      columns: ["closer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_setter_id_fkey"
      columns: ["setter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "aggiorna_mio_profilo":
{ Args: { "p_foto_url": string,"p_nome": string }; Returns: undefined
                           },
"aggiorna_stato_lead":
{ Args: { "p_lead_id": string,"p_stato": Database["public"]['Enums']["lead_status"] }; Returns: Database["public"]['Enums']["lead_status"]
                           },
"aggiungi_rata":
{ Args: { "p_importo": number,"p_sale_id": string,"p_scadenza": string }; Returns: string
                           },
"analisi_fascia_lead":
{ Args: { "p_dm": number,"p_in_target": number,"p_p75": number,"p_reel_type": string }; Returns: string
                           },
"analisi_fascia_pubblico":
{ Args: { "p_condivisioni": number,"p_salvataggi": number,"p_views": number }; Returns: string
                           },
"analisi_numeri_reel":
{ Args: { "p_eta"?: number,"p_media_id": string }; Returns: Json
                           },
"analisi_numeri_set":
{ Args: { "p_eta"?: number,"p_media_ids"?: (string)[] }; Returns: {
              "media_id": string,"num": Json
            }[]
                           },
"analisi_riepilogo":
{ Args: { "p_a": string,"p_da": string }; Returns: Json
                           },
"analisi_verdetto":
{ Args: { "p_lead": string,"p_pubblico": string }; Returns: string
                           },
"anteprima_eliminazione":
{ Args: { "p_id": string,"p_tipo": string }; Returns: Json
                           },
"anteprima_piano":
{ Args: { "p_rate": Json,"p_valore": number }; Returns: {
              "numero_rate": number,"scarto": number,"totale": number
            }[]
                           },
"avanzamento_obiettivi":
{ Args: { "p_mese": string }; Returns: {
              "cash": number,"mese": string,"nuovi": number,"obiettivo_cash": number,"obiettivo_nuovi": number,"quota_cash": number,"quota_nuovi": number
            }[]
                           },
"backup_completo":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"call_analisi_fallita":
{ Args: { "p_call": string,"p_conta"?: boolean,"p_errore": string,"p_passo": string,"p_riprova_tra"?: string,"p_stato": string }; Returns: undefined
                           },
"call_analisi_pulizia":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"call_analisi_richiedi":
{ Args: { "p_call": string }; Returns: undefined
                           },
"call_analisi_salva":
{ Args: { "p": Json,"p_call": string,"p_passo": string }; Returns: boolean
                           },
"call_analisi_valuta":
{ Args: { "p_call": string }; Returns: undefined
                           },
"call_c_e_lavoro":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"call_costo_mese":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"call_dispatch":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"call_fonti_analisi":
{ Args: { "p_call": string }; Returns: Json
                           },
"call_ha_follow_up":
{ Args: { "c": Database["public"]['Tables']["calls"]['Row'] }; Returns: boolean
                           },
"call_ha_vendita":
{ Args: { "c": Database["public"]['Tables']["calls"]['Row'] }; Returns: boolean
                           },
"call_imposta_costo_max":
{ Args: { "p_usd": number }; Returns: undefined
                           },
"call_imposta_interruttori":
{ Args: { "p_analisi"?: boolean }; Returns: undefined
                           },
"call_imposta_url":
{ Args: { "p_url": string }; Returns: undefined
                           },
"call_lavori_situazione":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"call_numeri_periodo":
{ Args: { "p_a": string,"p_closer"?: string,"p_da": string,"p_per": string }; Returns: {
              "analizzate": number,"call": number,"cash_nuovi": number,"chiuse": number,"close_rate": number,"close_rate_qualificate": number,"copertura": number,"durata_media_min": number,"etichetta": string,"gruppo": string,"in_target_da_verificare": number,"in_target_no": number,"in_target_si": number,"media_id": string,"no_show": number,"obiezioni": Json,"performance": Json,"qualificate": number,"quota_in_target": number,"registrate": number,"revenue_nuovi": number,"show_rate": number,"svolte": number,"vendite_nuove": number
            }[]
                           },
"call_passo_finito":
{ Args: { "p_contatori": Json,"p_esito": string,"p_passo": string }; Returns: boolean
                           },
"call_per_claude":
{ Args: { "p_a"?: string,"p_cerca"?: string,"p_closer"?: string,"p_da"?: string,"p_da_registrare"?: boolean,"p_id"?: string,"p_lead"?: string,"p_limite"?: number,"p_recenti"?: boolean,"p_setter"?: string,"p_stati"?: (Database["public"]['Enums']["call_status"])[] }; Returns: {
              "closer_id": string,"closer_nome": string,"di_follow_up": boolean,"esito": Database["public"]['Enums']["call_outcome"],"follow_up_di": string,"follow_up_id": string,"follow_up_il": string,"follow_up_stato": Database["public"]['Enums']["call_status"],"id": string,"importata": boolean,"importo_proposto": number,"lead_fonte": Database["public"]['Enums']["lead_source"],"lead_handle": string,"lead_id": string,"lead_nome": string,"lead_stato": Database["public"]['Enums']["lead_status"],"link_registrazione": string,"motivo": string,"note_closer": string,"note_setter": string,"partenza_il": string,"performance": Database["public"]['Enums']["call_performance"],"prenotata_il": string,"prodotto": string,"prodotto_proposto_id": string,"programmata_il": string,"qualificata": boolean,"registrazione": string,"setter_id": string,"setter_nome": string,"spostata_dal": string,"stato": Database["public"]['Enums']["call_status"],"tipo": Database["public"]['Enums']["call_type"],"totale": number,"volte_spostata": number
            }[]
                           },
"call_pianifica":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"call_prendi_passo":
{ Args: { "p_secondi"?: number }; Returns: {
              "cosa": string,"passo": string,"rif": string
            }[]
                           },
"call_scegli_lavoro":
{ Args: Record<PropertyKey, never>; Returns: {
              "cosa": string,"rif": string
            }[]
                           },
"call_segna_esito":
{ Args: { "p_errore": string,"p_esito": string }; Returns: undefined
                           },
"call_sveglia":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"call_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"cash_mensile":
{ Args: { "p_fino"?: string,"p_mesi"?: number }; Returns: {
              "mese": string,"nuovi_clienti": number,"rate_precedenti": number,"rinnovo": number,"totale": number,"upsell": number
            }[]
                           },
"chiudi_regola_provvigione":
{ Args: { "p_rule_id": string,"p_valida_al": string }; Returns: undefined
                           },
"clienti_elenco":
{ Args: { "p_stati"?: (Database["public"]['Enums']["client_status"])[] }; Returns: {
              "cartella_url": string,"chiuso_il": string,"client_id": string,"cognome": string,"contratto_url": string,"da_incassare": number,"data_fine": string,"data_inizio": string,"in_ritardo": number,"incassato": number,"ltv": number,"mese": number,"mesi_totali": number,"metodi": (string)[],"nome": string,"numero_percorso": number,"prodotto": string,"prossima_scadenza": string,"prossimo_importo": number,"rate": Json,"rate_incassate": number,"rate_totali": number,"sale_id": string,"settimana": number,"settimane_totali": number,"sospeso_il": string,"stato": Database["public"]['Enums']["client_status"],"tipo": Database["public"]['Enums']["sale_type"],"valore_contratto": number
            }[]
                           },
"collega_registrazione":
{ Args: { "p_call_id": string,"p_scelta": Json }; Returns: Json
                           },
"collega_vendita_call":
{ Args: { "p_call_id": string,"p_sale_id": string }; Returns: undefined
                           },
"commenti_setter_periodo":
{ Args: { "p_a": string,"p_da": string,"p_limite"?: number,"p_setter"?: string }; Returns: {
              "cosa_frenava": string,"data": string,"domande_contenuti": string,"giorni": number,"lead_in_target": Database["public"]['Enums']["quota_in_target"],"livello": string,"note": string,"qualita_conversazioni": Database["public"]['Enums']["qualita_conversazioni"],"quota": number,"report_id": string,"scala": string,"setter": string,"setter_id": string,"su_giorni": number,"tipo": string
            }[]
                           },
"commento_da_scrivere":
{ Args: { "p_conversazioni": number,"p_cosa_frenava": string,"p_data": string,"p_dm_inbound": number,"p_dm_outbound": number,"p_follow_up": number,"p_lead_in_target": Database["public"]['Enums']["quota_in_target"],"p_qualita_conversazioni": Database["public"]['Enums']["qualita_conversazioni"] }; Returns: boolean
                           },
"commento_proposta_valido":
{ Args: { "p_commento": Json }; Returns: Json
                           },
"conferma_proposta_instagram":
{ Args: { "p_calcolato_il"?: string,"p_commento"?: Json,"p_id": string,"p_valori"?: Json,"p_visti"?: Json }; Returns: {
              "call_proposte": number,
"call_qualificate": number,
"contenuto_pubblicato": boolean,
"conversazioni": number,
"cosa_frenava": string | null,
"created_at": string,
"created_by": string | null,
"data": string,
"discovery_prenotate": number,
"discovery_svolte": number,
"dm_inbound": number,
"dm_outbound": number,
"dm_totali": number | null,
"domande_contenuti": string | null,
"follow_up": number,
"id": string,
"lead_in_target": Database["public"]['Enums']["quota_in_target"] | null,
"note": string | null,
"qualita_conversazioni": Database["public"]['Enums']["qualita_conversazioni"] | null,
"setter_id": string,
"strategy_prenotate": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "setter_daily_reports"
        isOneToOne: true
        isSetofReturn: false
      } },
"conteggi_opzioni_marketing":
{ Args: Record<PropertyKey, never>; Returns: {
              "campo": string,"n": number,"valore": string
            }[]
                           },
"copia_costi_ricorrenti":
{ Args: { "p_mese": string }; Returns: number
                           },
"crea_opzione_marketing":
{ Args: { "p_campo": string,"p_colore"?: string,"p_nome": string }; Returns: {
              "campo": string,
"colore": string,
"created_at": string,
"created_by": string | null,
"id": string,
"nome": string,
"ordine": number,
"updated_at": string,
"valore": string
            }
                          SetofOptions: {
        from: "*"
        to: "marketing_opzioni"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"da_client_oauth":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"da_incassare":
{ Args: Record<PropertyKey, never>; Returns: {
              "fascia": string,"numero": number,"totale": number
            }[]
                           },
"da_incassare_closer":
{ Args: Record<PropertyKey, never>; Returns: {
              "in_ritardo": number,"numero_in_ritardo": number,"numero_oltre": number,"numero_prossimi_30": number,"numero_rate": number,"oltre": number,"prossimi_30": number,"totale": number,"vendite": number
            }[]
                           },
"decidi_performance":
{ Args: { "p_call_id": string,"p_livello": Database["public"]['Enums']["call_performance"] }; Returns: undefined
                           },
"dettagli_call":
{ Args: { "p_call_id": string,"p_importo_proposto"?: number,"p_link_registrazione"?: string,"p_note_closer"?: string,"p_performance"?: Database["public"]['Enums']["call_performance"],"p_prodotto_proposto_id"?: string }; Returns: undefined
                           },
"discovery_prenotate_del_giorno":
{ Args: { "p_data": string,"p_setter": string }; Returns: number
                           },
"elimina_call":
{ Args: { "p_call_id": string }; Returns: undefined
                           },
"elimina_cliente":
{ Args: { "p_client_id": string }; Returns: undefined
                           },
"elimina_lead":
{ Args: { "p_lead_id": string }; Returns: undefined
                           },
"elimina_persona":
{ Args: { "p_profile_id": string }; Returns: undefined
                           },
"elimina_prodotto":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"elimina_rata":
{ Args: { "p_payment_id": string }; Returns: undefined
                           },
"euro_testo":
{ Args: { "p_importo": number }; Returns: string
                           },
"fathom_chiave":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"fathom_chiave_presente":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"fathom_collega_trovata":
{ Args: { "p_call_id": string,"p_durata": number,"p_inizio": string,"p_recording_id": number,"p_url": string }; Returns: string
                           },
"fathom_errore":
{ Args: { "p_testo": string }; Returns: string
                           },
"fathom_imposta_chiave":
{ Args: { "p_chiave": string }; Returns: string
                           },
"fathom_salva_verifica":
{ Args: { "p_call_id": string,"p_durata": number,"p_inizio": string,"p_recording_id": number,"p_url": string }; Returns: undefined
                           },
"fathom_segna_esito":
{ Args: { "p_errore": string }; Returns: undefined
                           },
"fathom_togli_chiave":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"fissa_call":
{ Args: { "p_closer_id": string,"p_data": string,"p_fonte": Database["public"]['Enums']["lead_source"],"p_instagram_handle"?: string,"p_nome": string,"p_ora": string,"p_setter_id"?: string,"p_tipo": Database["public"]['Enums']["call_type"] }; Returns: {
              "id_call": string,"id_lead": string,"lead_esistente": boolean
            }[]
                           },
"fissa_follow_up":
{ Args: { "p_call_id": string,"p_data": string,"p_ora": string }; Returns: string
                           },
"foto_google":
{ Args: { "p_meta": Json }; Returns: string
                           },
"funnel_mese":
{ Args: { "p_mese": string }; Returns: {
              "fase": string,"ordine": number,"passaggio": number,"valore": number
            }[]
                           },
"funnel_periodo":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "fase": string,"ordine": number,"passaggio": number,"valore": number
            }[]
                           },
"giornate_closer":
{ Args: { "p_a": string,"p_closer"?: string,"p_da": string }; Returns: {
              "call": number,"cancellate": number,"cash": number,"chiuse": number,"close_rate": number,"data": string,"follow_up": number,"no_show": number,"qualificate": number,"revenue": number,"show_rate": number
            }[]
                           },
"giornate_setter":
{ Args: { "p_a": string,"p_da": string,"p_setter"?: string }; Returns: {
              "call_proposte": number,"call_qualificate": number,"cash": number,"closer_call": number,"closer_cancellate": number,"closer_chiuse": number,"closer_follow_up": number,"closer_no_show": number,"closer_qualificate": number,"conversazioni": number,"data": string,"discovery_prenotate": number,"discovery_svolte": number,"dm_inbound": number,"dm_outbound": number,"dm_totali": number,"follow_up": number,"prenotate_inbound": number,"prenotate_outbound": number,"revenue": number,"strategy_prenotate": number
            }[]
                           },
"incassi_clienti_setter":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "clienti": number,"incassato": number,"numero_incassi": number,"numero_rimborsi": number,"provvigione": number,"rimborsato": number
            }[]
                           },
"inserisci_piano":
{ Args: { "p_rate": Json,"p_sale_id": string }; Returns: undefined
                           },
"insight_agenda":
{ Args: { "p_adesso"?: string }; Returns: {
              "call_id": string,"di_follow_up": boolean,"esito": Database["public"]['Enums']["call_outcome"],"fonte": Database["public"]['Enums']["lead_source"],"giorno": string,"lead_id": string,"no_show_precedenti": number,"nome": string,"programmata_il": string,"stato": Database["public"]['Enums']["call_status"],"username": string,"volte_spostata": number
            }[]
                           },
"insight_chat_messenger":
{ Args: Record<PropertyKey, never>; Returns: {
              "nome": string,"utente_id": string
            }[]
                           },
"insight_chiave":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"insight_costo_usd":
{ Args: { "p_cache_letti": number,"p_cache_scritti": number,"p_input": number,"p_output": number }; Returns: number
                           },
"insight_da_avviare":
{ Args: { "p_adesso": string }; Returns: string
                           },
"insight_dimentica":
{ Args: { "p_canale": Database["public"]['Enums']["insight_canale"],"p_chiave": string }; Returns: Json
                           },
"insight_dispatch":
{ Args: { "p_esecuzione": string }; Returns: boolean
                           },
"insight_fallita":
{ Args: { "p_contatori"?: Json,"p_errore": string,"p_esecuzione": string }; Returns: boolean
                           },
"insight_imposta_automazione":
{ Args: { "p_attivo": boolean,"p_ora": string }; Returns: undefined
                           },
"insight_imposta_url":
{ Args: { "p_url": string }; Returns: undefined
                           },
"insight_istante":
{ Args: { "p_valore": string }; Returns: string
                           },
"insight_passo_finito":
{ Args: { "p_avvisi": (string)[],"p_contatori": Json,"p_esecuzione": string,"p_progresso": Json,"p_prossimo": Database["public"]['Enums']["insight_passo"] }; Returns: boolean
                           },
"insight_prendi_passo":
{ Args: { "p_esecuzione": string,"p_secondi"?: number }; Returns: {
              "giorno": string,"motivo": string,"passo": Database["public"]['Enums']["insight_passo"],"progresso": Json
            }[]
                           },
"insight_pulizia":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"insight_puo_leggere":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"insight_richiedi":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"insight_ruota_chiave":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"insight_scarta_letture":
{ Args: { "p_esecuzione": string }; Returns: number
                           },
"insight_scarta_minore":
{ Args: { "p_canale": Database["public"]['Enums']["insight_canale"],"p_conversazione_id": string,"p_esecuzione": string }; Returns: Json
                           },
"insight_stato":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"insight_stato_lead":
{ Args: { "p_nomi"?: (string)[],"p_username": (string)[] }; Returns: {
              "chiave": string,"cliente": boolean,"fonte": Database["public"]['Enums']["lead_source"],"ha_call": boolean,"no_show_precedenti": number,"per": string,"prossima_call_il": string,"prossima_call_stato": Database["public"]['Enums']["call_status"],"stato_lead": Database["public"]['Enums']["lead_status"],"ultimo_esito": Database["public"]['Enums']["call_outcome"]
            }[]
                           },
"insight_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"insight_valore_grande":
{ Args: { "p_valore": Json }; Returns: number
                           },
"insight_valore_intero":
{ Args: { "p_valore": Json }; Returns: number
                           },
"insight_valore_rapporto":
{ Args: { "p_valore": Json }; Returns: number
                           },
"instagram_collega_da_solo":
{ Args: { "p_contenuto": string,"p_giorni": number,"p_motivi": (string)[],"p_punteggio": number,"p_shortcode": string,"p_somiglianza": number }; Returns: boolean
                           },
"instagram_contenuti_dm_salva":
{ Args: { "p_righe": Json,"p_segna_giorni"?: boolean }; Returns: number
                           },
"instagram_contenuti_fine_giro":
{ Args: { "p_account": string,"p_campi": string,"p_causa"?: string,"p_collegati": number,"p_errore": string,"p_esito": string,"p_giro": string,"p_letti": number,"p_proposti": number }; Returns: boolean
                           },
"instagram_contenuti_inizia_giro":
{ Args: { "p_motivo": string }; Returns: Json
                           },
"instagram_contenuti_metriche_fine":
{ Args: { "p_errore": string,"p_esito": string,"p_giro": string,"p_gradini": Json,"p_letti": number,"p_permesso": boolean }; Returns: boolean
                           },
"instagram_contenuti_segna_eliminati":
{ Args: { "p_dal": string,"p_presenti": (string)[] }; Returns: number
                           },
"instagram_errore":
{ Args: { "p_messaggio": string }; Returns: undefined
                           },
"instagram_imposta_token":
{ Args: { "p_token": string }; Returns: undefined
                           },
"instagram_salva_metriche":
{ Args: { "p_righe": Json }; Returns: number
                           },
"instagram_salva_proposta":
{ Args: { "p_call_proposte": number,"p_chat_incerte": number,"p_chat_lette": number,"p_conversazioni": number,"p_data": string,"p_discovery_prenotate"?: number,"p_dm_inbound": number,"p_dm_outbound": number,"p_follow_up": number,"p_setter": string }; Returns: string
                           },
"instagram_salva_proposte":
{ Args: { "p_proposte": Json }; Returns: number
                           },
"instagram_togli_token":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"instagram_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"instagram_token_presente":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"instagram_token_rinnovato":
{ Args: { "p_scade_il": string,"p_token": string,"p_vecchio": string }; Returns: boolean
                           },
"interrompi_percorso":
{ Args: { "p_esegui"?: boolean,"p_sale_id": string,"p_togli_rate": boolean,"p_ultimo_giorno": string }; Returns: {
              "importo_tolto": number,"rate_restanti": number,"rate_tolte": number,"valore_dopo": number,"valore_prima": number
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"kpi_panoramica":
{ Args: { "p_mese": string }; Returns: {
              "chiave": string,"delta": number,"precedente": number,"valore": number
            }[]
                           },
"kpi_periodo":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "chiave": string,"delta": number,"precedente": number,"valore": number
            }[]
                           },
"lead_appartiene_al_setter":
{ Args: { "p_lead_id": string,"p_setter_id": string }; Returns: boolean
                           },
"lead_contenuto_da_chat":
{ Args: { "p_lead": string }; Returns: undefined
                           },
"lead_contenuto_da_insight":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"legge_come_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"marketing_analisi_fine":
{ Args: { "p_contenuto": Json,"p_errore": string,"p_fonti": Json,"p_id": string,"p_modello": string,"p_numeri": Json,"p_punteggio"?: Json,"p_riprova_il"?: string,"p_stato": string,"p_versione": string,"p_versione_guida"?: string }; Returns: boolean
                           },
"marketing_analisi_richiedi":
{ Args: { "p_media_id": string,"p_rileggi"?: boolean }; Returns: string
                           },
"marketing_c_e_lavoro":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"marketing_contenuti_per_abbinamento":
{ Args: Record<PropertyKey, never>; Returns: {
              "bozza": string,"finale": string,"id": string,"messaggio": string,"nome": string,"post_date": string,"stato": Database["public"]['Enums']["contenuto_status"],"tipo": Database["public"]['Enums']["contenuto_tipo"]
            }[]
                           },
"marketing_costo_mese":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"marketing_da_oscurare":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"marketing_dispatch":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"marketing_fonti_analisi":
{ Args: { "p_a": string,"p_da": string }; Returns: Json
                           },
"marketing_fonti_spunti":
{ Args: { "p_a": string,"p_da": string }; Returns: Json
                           },
"marketing_imposta_costo_max":
{ Args: { "p_usd": number }; Returns: undefined
                           },
"marketing_imposta_interruttori":
{ Args: { "p_automatiche"?: boolean,"p_note_team"?: boolean }; Returns: undefined
                           },
"marketing_imposta_url":
{ Args: { "p_url": string }; Returns: undefined
                           },
"marketing_lavori_situazione":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"marketing_lettura_fine":
{ Args: { "p_esito": Json,"p_media_id": string }; Returns: boolean
                           },
"marketing_passo_finito":
{ Args: { "p_contatori": Json,"p_esito": string,"p_passo": string }; Returns: boolean
                           },
"marketing_pianifica":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"marketing_prendi_passo":
{ Args: { "p_secondi"?: number }; Returns: {
              "cosa": string,"passo": string,"rif": string
            }[]
                           },
"marketing_scegli_lavoro":
{ Args: { "p_adesso"?: string }; Returns: {
              "cosa": string,"rif": string
            }[]
                           },
"marketing_segna_esito":
{ Args: { "p_errore": string,"p_esito": string }; Returns: undefined
                           },
"marketing_slug":
{ Args: { "p_nome": string }; Returns: string
                           },
"marketing_spunti_fine":
{ Args: { "p_conta"?: boolean,"p_contenuto": Json,"p_errore": string,"p_fonti": Json,"p_id": string,"p_modello": string,"p_passo": string,"p_riprova_il": string,"p_stato": string,"p_versione": string }; Returns: boolean
                           },
"marketing_spunti_richiedi":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"marketing_sveglia":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"marketing_tick":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"mcp_chi_sono":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"mcp_client":
{ Args: Record<PropertyKey, never>; Returns: {
              "client_id": string,"nome": string,"tipo": string
            }[]
                           },
"mcp_filtro_richiesta":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"mcp_richiesta_valida":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mcp_ruolo":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"mcp_token_valido":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"messenger_errore":
{ Args: { "p_messaggio": string }; Returns: undefined
                           },
"messenger_imposta_token":
{ Args: { "p_pagina_id": string,"p_pagina_nome": string,"p_token": string }; Returns: undefined
                           },
"messenger_togli_token":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"messenger_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"messenger_token_presente":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"metriche_mese":
{ Args: { "p_mese": string }; Returns: {
              "call_prenotate": number,"call_proposte": number,"call_svolte": number,"cash_incassato": number,"cash_nuovi_clienti": number,"cash_per_call_svolta": number,"cash_per_dm": number,"cash_rate_precedenti": number,"cash_rinnovo": number,"cash_upsell": number,"chiuse": number,"close_rate": number,"close_rate_qualificate": number,"conversazioni": number,"costi": number,"dm_per_call": number,"dm_per_strategy": number,"dm_totali": number,"in_scadenza_nel_mese": number,"margine_operativo": number,"mese": string,"no_show": number,"numero_vendite": number,"nuovi_clienti": number,"provvigioni_maturate": number,"qualificate": number,"revenue_firmata": number,"revenue_nuovi": number,"revenue_per_dm": number,"rinnovati_nel_mese": number,"rinnovi": number,"show_rate": number,"strategy_prenotate": number,"tasso_conversazione": number,"tasso_prenotazione": number,"tasso_qualificazione": number,"tasso_rinnovo": number,"valore_medio_nuovo": number
            }[]
                           },
"metriche_per_fonte":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "call_svolte": number,"cash": number,"chiuse": number,"close_rate": number,"fonte": Database["public"]['Enums']["lead_source"],"lead": number,"nuovi_clienti": number,"quota_cash": number
            }[]
                           },
"metriche_periodo":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "call_prenotate": number,"call_proposte": number,"call_svolte": number,"cash_incassato": number,"cash_nuovi_clienti": number,"cash_per_call_svolta": number,"cash_per_dm": number,"cash_rate_precedenti": number,"cash_rinnovo": number,"cash_upsell": number,"chiuse": number,"close_rate": number,"close_rate_qualificate": number,"conversazioni": number,"costi": number,"dm_per_call": number,"dm_per_strategy": number,"dm_totali": number,"fine": string,"in_scadenza": number,"inizio": string,"margine_operativo": number,"no_show": number,"numero_vendite": number,"nuovi_clienti": number,"provvigioni_maturate": number,"qualificate": number,"revenue_firmata": number,"revenue_nuovi": number,"revenue_per_dm": number,"rinnovati": number,"rinnovi": number,"show_rate": number,"strategy_prenotate": number,"tasso_conversazione": number,"tasso_prenotazione": number,"tasso_qualificazione": number,"tasso_rinnovo": number,"valore_medio_nuovo": number
            }[]
                           },
"metriche_setting":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "call_prenotate": number,"call_proposte": number,"call_svolte": number,"chiuse": number,"close_rate": number,"conversazioni": number,"dm_inbound": number,"dm_outbound": number,"dm_per_call": number,"dm_totali": number,"follow_up": number,"giorni_compilati": number,"no_show": number,"nome": string,"prenotate_inbound": number,"prenotate_outbound": number,"setter_id": string,"show_rate": number,"tasso_conversazione": number,"tasso_prenotazione": number
            }[]
                           },
"mia_foto_google":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"mie_vendite_setter":
{ Args: Record<PropertyKey, never>; Returns: {
              "cliente": string,"data_vendita": string,"importo_incassato": number,"importo_previsto": number,"in_ritardo": boolean,"incassato_il": string,"incassato_vendita": number,"numero_rata": number,"numero_rate": number,"percentuale": number,"prodotto": string,"provvigione": number,"provvigione_prevista": boolean,"provvigione_vendita": number,"rate_in_ritardo": number,"rate_incassate": number,"sale_id": string,"scadenza": string,"stato": Database["public"]['Enums']["payment_status"],"tipo": Database["public"]['Enums']["sale_type"],"valore_contratto": number
            }[]
                           },
"miei_clienti":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"nome": string,"stato": Database["public"]['Enums']["client_status"]
            }[]
                           },
"miei_numeri":
{ Args: { "p_mese": string }; Returns: {
              "call_fissate": number,"call_prenotate": number,"call_proposte": number,"call_svolte": number,"chiuse": number,"close_rate": number,"conversazioni": number,"dm_inbound": number,"dm_outbound": number,"dm_per_call": number,"dm_totali": number,"follow_up": number,"giorni_compilati": number,"no_show": number,"prenotate_inbound": number,"prenotate_outbound": number,"provvigioni_maturate": number,"provvigioni_pagate": number,"show_rate": number,"tasso_conversazione": number,"tasso_prenotazione": number
            }[]
                           },
"miei_numeri_periodo":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "call_fissate": number,"call_prenotate": number,"call_proposte": number,"call_svolte": number,"chiuse": number,"close_rate": number,"conversazioni": number,"dm_inbound": number,"dm_outbound": number,"dm_per_call": number,"dm_totali": number,"follow_up": number,"giorni_compilati": number,"no_show": number,"prenotate_inbound": number,"prenotate_outbound": number,"provvigioni_maturate": number,"provvigioni_pagate": number,"show_rate": number,"tasso_conversazione": number,"tasso_prenotazione": number
            }[]
                           },
"modifica_call":
{ Args: { "p_call_id": string,"p_closer_id": string,"p_data": string,"p_note"?: string,"p_ora": string,"p_tipo": Database["public"]['Enums']["call_type"] }; Returns: undefined
                           },
"motivi_non_chiusura_periodo":
{ Args: { "p_a": string,"p_da": string,"p_limite"?: number,"p_setter"?: string }; Returns: {
              "call_id": string,"closer": string,"data": string,"esito": Database["public"]['Enums']["call_outcome"],"lead": string,"motivo": string,"note_closer": string,"programmata_il": string,"qualificata": boolean
            }[]
                           },
"notifiche_avviso":
{ Args: { "p_anteprima": string,"p_chiave": string,"p_destinatari": (string)[],"p_dettagli": Json,"p_link": string,"p_tipo": string,"p_titolo": string }; Returns: number
                           },
"notifiche_avviso_admin":
{ Args: { "p_anteprima": string,"p_chiave": string,"p_dettagli": Json,"p_link": string,"p_tipo": string,"p_titolo": string }; Returns: number
                           },
"notifiche_collegamenti_stato":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"notifiche_data":
{ Args: { "p_giorno": string }; Returns: string
                           },
"notifiche_dollari":
{ Args: { "p_importo": number }; Returns: string
                           },
"notifiche_euro":
{ Args: { "p_importo": number }; Returns: string
                           },
"notifiche_proposta":
{ Args: { "p_id": string }; Returns: number
                           },
"notifiche_pulizia":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"notifiche_rate_in_ritardo":
{ Args: { "p_giorno": string }; Returns: number
                           },
"notifiche_registra":
{ Args: { "p_anteprima": string,"p_chiave": string,"p_corpo_html": string,"p_destinatari": (string)[],"p_email_inviata": boolean,"p_link": string,"p_tipo": string,"p_titolo": string }; Returns: number
                           },
"notifiche_spesa":
{ Args: { "p_area": string,"p_dopo": number,"p_max": number,"p_mese": string,"p_prima": number }; Returns: number
                           },
"nuova_regola_provvigione":
{ Args: { "p_applica_a": (Database["public"]['Enums']["sale_type"])[],"p_percentuale": number,"p_profile_id": string,"p_valida_dal": string }; Returns: string
                           },
"oggi":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"oggi_team":
{ Args: Record<PropertyKey, never>; Returns: {
              "call_in_programma": number,"call_prenotate": number,"call_svolte": number,"cash_incassato": number,"cash_nuovi_clienti": number,"chiuse": number,"conversazioni": number,"dm_totali": number,"report_compilati": number
            }[]
                           },
"periodo_precedente":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "a": string,"da": string
            }[]
                           },
"piano_rate":
{ Args: { "p_data_vendita": string,"p_numero_rate": number,"p_valore": number }; Returns: {
              "importo": number,"numero_rata": number,"scadenza": string
            }[]
                           },
"pm_allinea_progetto_cliente":
{ Args: { "p_client_id": string }; Returns: undefined
                           },
"pm_applica_modello":
{ Args: { "p_autore": string,"p_inizio": string,"p_modello": string,"p_progetto": string }; Returns: undefined
                           },
"pm_apri_progetto_cliente":
{ Args: { "p_client_id": string,"p_sale_id": string }; Returns: string
                           },
"pm_assegnato":
{ Args: { "p_task": string }; Returns: boolean
                           },
"pm_avvia_timer":
{ Args: { "p_nota"?: string,"p_progetto_id": string,"p_task_id"?: string }; Returns: string
                           },
"pm_coach_del_cliente":
{ Args: { "p_client_id": string }; Returns: boolean
                           },
"pm_crea_progetti_clienti_attivi":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"pm_crea_progetto":
{ Args: { "p_client_id"?: string,"p_data_fine"?: string,"p_data_inizio"?: string,"p_descrizione"?: string,"p_membri"?: (string)[],"p_modello_id"?: string,"p_nome": string,"p_reparto_id": string }; Returns: string
                           },
"pm_crea_progetto_cliente":
{ Args: { "p_client_id": string }; Returns: string
                           },
"pm_fascia_tempo":
{ Args: { "p_alle": string,"p_dalle": string,"p_data": string }; Returns: Record<string, unknown>
                           },
"pm_riprendi_timer":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pm_ferma_timer":
{ Args: { "p_nota"?: string }; Returns: string
                           },
"pm_pausa_timer":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pm_imposta_assegnatari":
{ Args: { "p_persone": (string)[],"p_task": string }; Returns: undefined
                           },
"pm_livello_corrente":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["pm_livello"]
                           },
"pm_membro":
{ Args: { "p_progetto": string }; Returns: boolean
                           },
"pm_mio_tempo_per_task":
{ Args: { "p_a": string,"p_da": string,"p_progetto"?: string,"p_task"?: string,"p_tasks"?: (string)[] }; Returns: {
              "livello": string,"minuti": number,"progetto": string,"progetto_id": string,"task": string,"task_id": string,"voci": number
            }[]
                           },
"pm_modifica_tempo":
{ Args: { "p_alle"?: string,"p_dalle"?: string,"p_data": string,"p_id": string,"p_minuti"?: number,"p_nota"?: string,"p_progetto_id": string,"p_task_id"?: string }; Returns: string
                           },
"pm_nome_progetto_cliente":
{ Args: { "p_cognome": string,"p_nome": string }; Returns: string
                           },
"pm_panoramica_progetto":
{ Args: { "p_progetto": string }; Returns: {
              "completati": number,"da_fare": number,"in_corso": number,"in_revisione": number,"in_ritardo": number,"in_scadenza_7_giorni": number,"minuti_totali": number,"minuti_ultimi_7_giorni": number,"senza_assegnatario": number
            }[]
                           },
"pm_periodo_percorso":
{ Args: { "p_client_id": string }; Returns: Record<string, unknown>
                           },
"pm_puo_gestire":
{ Args: { "p_progetto": string }; Returns: boolean
                           },
"pm_puo_modificare_task":
{ Args: { "p_task": string }; Returns: boolean
                           },
"pm_puo_vedere":
{ Args: { "p_progetto": string }; Returns: boolean
                           },
"pm_registra_tempo":
{ Args: { "p_alle"?: string,"p_dalle"?: string,"p_data": string,"p_minuti"?: number,"p_nota"?: string,"p_progetto_id": string,"p_task_id"?: string }; Returns: string
                           },
"pm_riepilogo_tempo":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "data": string,"livello": string,"minuti": number,"progetto": string,"progetto_id": string,"voci": number
            }[]
                           },
"pm_riordina_liste":
{ Args: { "p_ids": (string)[],"p_progetto_id": string }; Returns: number
                           },
"pm_riordina_reparti":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"pm_scegli_coach":
{ Args: { "p_coach": string,"p_progetto": string }; Returns: undefined
                           },
"pm_tempo_per_persona":
{ Args: { "p_a": string,"p_da": string,"p_limite"?: number,"p_profilo"?: string,"p_progetto"?: string }; Returns: {
              "data": string,"fine": string,"id": string,"inizio": string,"livello": string,"minuti": number,"nota": string,"persona": string,"profile_id": string,"progetto": string,"progetto_id": string,"task": string,"task_id": string,"voci": number
            }[]
                           },
"pm_tempo_progetto":
{ Args: { "p_a": string,"p_da": string,"p_progetto": string }; Returns: {
              "data": string,"livello": string,"minuti": number,"persona": string,"profile_id": string,"task": string,"task_id": string,"voci": number
            }[]
                           },
"pm_timer_attivo":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"inizio": string,"nota": string,"pausa_dal": string,"pausa_secondi": number,"progetto": string,"progetto_id": string,"task": string,"task_id": string
            }[]
                           },
"previsione_cassa":
{ Args: { "p_mesi"?: number }; Returns: {
              "in_ritardo": number,"incassato": number,"mese": string,"previsto": number,"rate_in_ritardo": number,"rate_previste": number
            }[]
                           },
"promemoria_percorso_da_inviare":
{ Args: { "p_giorno": string }; Returns: {
              "azione": string,"client_id": string,"cognome": string,"data_fine": string,"data_inizio": string,"giorni_mancanti": number,"nome": string,"prodotto": string,"sale_id": string,"telefono": string,"tipo": Database["public"]['Enums']["promemoria_tipo"]
            }[]
                           },
"promemoria_percorso_interrotto":
{ Args: { "p_sale_id": string }; Returns: undefined
                           },
"promemoria_percorso_prenota":
{ Args: { "p_client_id": string,"p_data_fine": string,"p_esito"?: Database["public"]['Enums']["promemoria_esito"],"p_sale_id": string,"p_tipo": Database["public"]['Enums']["promemoria_tipo"] }; Returns: string
                           },
"provvigioni_per_vendita":
{ Args: { "p_sale_id"?: string }; Returns: {
              "cliente": string,"incassato": number,"percentuale": number,"profile_id": string,"provvigione": number,"sale_id": string,"setter": string,"tipo": Database["public"]['Enums']["sale_type"],"ultimo_incasso": string
            }[]
                           },
"provvigioni_riepilogo":
{ Args: { "p_mesi"?: number }; Returns: {
              "maturato": number,"mese": string,"nome": string,"pagato": number,"profile_id": string,"saldo_mese": number,"saldo_progressivo": number
            }[]
                           },
"puo_usare_mcp":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"rapporto":
{ Args: { "p_denominatore": number,"p_numeratore": number }; Returns: number
                           },
"recap_mese":
{ Args: { "p_mese": string }; Returns: Json
                           },
"recap_sales":
{ Args: { "p_a": string,"p_da": string }; Returns: Json
                           },
"registra_rimborso":
{ Args: { "p_data": string,"p_importo": number,"p_note"?: string,"p_payment_id": string }; Returns: string
                           },
"registra_vendita":
{ Args: { "p_call_id"?: string,"p_client_id"?: string,"p_cognome"?: string,"p_data_fine"?: string,"p_data_inizio": string,"p_data_vendita": string,"p_email"?: string,"p_instagram_handle"?: string,"p_nome"?: string,"p_note"?: string,"p_numero_rate": number,"p_prodotto_personalizzato"?: string,"p_product_id": string,"p_rate"?: Json,"p_telefono"?: string,"p_tipo": Database["public"]['Enums']["sale_type"],"p_valore_contratto": number }; Returns: {
              "cliente_nuovo": boolean,"id_cliente": string,"id_vendita": string
            }[]
                           },
"riapri_cliente":
{ Args: { "p_client_id": string }; Returns: boolean
                           },
"riattiva_cliente":
{ Args: { "p_client_id": string }; Returns: boolean
                           },
"riepilogo_contenuti_settimana":
{ Args: { "p_a": string,"p_da": string }; Returns: Json
                           },
"riepilogo_costi":
{ Args: { "p_mese": string }; Returns: {
              "categoria": Database["public"]['Enums']["expense_category"],"numero": number,"totale": number
            }[]
                           },
"riepilogo_costi_periodo":
{ Args: { "p_a": string,"p_da": string }; Returns: {
              "categoria": Database["public"]['Enums']["expense_category"],"numero": number,"totale": number
            }[]
                           },
"riepilogo_settimana":
{ Args: { "p_a": string,"p_da": string }; Returns: Json
                           },
"riepilogo_tempo_team":
{ Args: { "p_a": string,"p_da": string }; Returns: Json
                           },
"rinumera_rate":
{ Args: { "p_sale_id": string }; Returns: undefined
                           },
"salva_sezione_contenuto":
{ Args: { "p_campo": string,"p_id": string,"p_impronta": string,"p_testo": string }; Returns: Json
                           },
"scarta_proposta_instagram":
{ Args: { "p_commento"?: Json,"p_id": string }; Returns: undefined
                           },
"scollega_registrazione":
{ Args: { "p_call_id": string }; Returns: undefined
                           },
"segna_rata_incassata":
{ Args: { "p_importo"?: number,"p_incassato_il"?: string,"p_metodo"?: Database["public"]['Enums']["payment_method"],"p_payment_id": string }; Returns: {
              "data_registrata": string,"importo_registrato": number,"rata": number
            }[]
                           },
"segna_tutorial_visto":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"sposta_call":
{ Args: { "p_call_id": string,"p_data": string,"p_ora": string }; Returns: undefined
                           },
"spunti_per_claude":
{ Args: { "p_giorno"?: string }; Returns: Json
                           },
"testo_scritto":
{ Args: { "p_testo": string }; Returns: boolean
                           },
"unisci_profili":
{ Args: { "p_a": string,"p_da": string }; Returns: undefined
                           },
"vede_marketing":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"vendite_da_collegare":
{ Args: { "p_call_id": string }; Returns: {
              "cliente": string,"data_vendita": string,"sale_id": string,"setter": string,"stesso_cliente": boolean,"tipo": Database["public"]['Enums']["sale_type"],"valore_contratto": number
            }[]
                           },
"verifica_periodo":
{ Args: { "p_a": string,"p_da": string }; Returns: undefined
                           },
"verifica_piano":
{ Args: { "p_rate": Json,"p_valore": number }; Returns: undefined
                           }
          }
          Enums: {
            "analisi_stato": "in_coda"|"in_corso"|"pronta"|"fallita","app_role": "admin"|"setter"|"closer"|"coach"|"editor"|"marketing"|"nutrizione"|"dev"|"business_coach","audit_action": "insert"|"update"|"delete","call_outcome": "chiusa"|"follow_up"|"persa","call_performance": "ottima"|"buona"|"discreta"|"media"|"scarsa","call_status": "programmata"|"svolta"|"no_show"|"cancellata"|"riprogrammata","call_type": "discovery"|"strategy","client_status": "attivo"|"in_scadenza"|"da_iniziare"|"sospeso"|"scaduto"|"chiuso"|"ex_cliente"|"mai_attivato","contenuto_status": "not_started"|"to_be_recorded"|"to_be_edited"|"to_be_posted"|"posted"|"canceled","contenuto_tipo": "reel"|"carousel"|"youtube","expense_category": "team"|"software"|"ads"|"formazione"|"altro","insight_canale": "instagram"|"messenger","insight_passo": "lettura"|"analisi"|"unione","insight_stato_esecuzione": "in_coda"|"in_corso"|"pronta"|"fallita","lead_source": "dm_inbound"|"dm_outbound"|"referral"|"organico"|"ads"|"altro","lead_status": "call_fissata"|"follow_up"|"cliente"|"perso","payment_method": "bonifico"|"stripe"|"paypal"|"carta"|"contanti"|"altro","payment_status": "prevista"|"incassata"|"fallita"|"rimborsata","pm_livello": "admin"|"manager"|"employee","pm_priorita": "bassa"|"media"|"alta","pm_stato_progetto": "attivo"|"in_pausa"|"completato"|"archiviato","pm_stato_task": "da_fare"|"in_corso"|"in_revisione"|"completato","promemoria_esito": "in_invio"|"inviato"|"saltato"|"interrotto","promemoria_tipo": "feedback_3_mesi"|"rinnovo_1_mese","proposta_stato": "da_confermare"|"confermata"|"scartata","qualita_conversazioni": "buone"|"medie"|"scarse","quota_in_target": "quasi_tutti"|"circa_meta"|"pochi","sale_type": "nuovo"|"rinnovo"|"upsell"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "analisi_stato": ["in_coda", "in_corso", "pronta", "fallita"],"app_role": ["admin", "setter", "closer", "coach", "editor", "marketing", "nutrizione", "dev", "business_coach"],"audit_action": ["insert", "update", "delete"],"call_outcome": ["chiusa", "follow_up", "persa"],"call_performance": ["ottima", "buona", "discreta", "media", "scarsa"],"call_status": ["programmata", "svolta", "no_show", "cancellata", "riprogrammata"],"call_type": ["discovery", "strategy"],"client_status": ["attivo", "in_scadenza", "da_iniziare", "sospeso", "scaduto", "chiuso", "ex_cliente", "mai_attivato"],"contenuto_status": ["not_started", "to_be_recorded", "to_be_edited", "to_be_posted", "posted", "canceled"],"contenuto_tipo": ["reel", "carousel", "youtube"],"expense_category": ["team", "software", "ads", "formazione", "altro"],"insight_canale": ["instagram", "messenger"],"insight_passo": ["lettura", "analisi", "unione"],"insight_stato_esecuzione": ["in_coda", "in_corso", "pronta", "fallita"],"lead_source": ["dm_inbound", "dm_outbound", "referral", "organico", "ads", "altro"],"lead_status": ["call_fissata", "follow_up", "cliente", "perso"],"payment_method": ["bonifico", "stripe", "paypal", "carta", "contanti", "altro"],"payment_status": ["prevista", "incassata", "fallita", "rimborsata"],"pm_livello": ["admin", "manager", "employee"],"pm_priorita": ["bassa", "media", "alta"],"pm_stato_progetto": ["attivo", "in_pausa", "completato", "archiviato"],"pm_stato_task": ["da_fare", "in_corso", "in_revisione", "completato"],"promemoria_esito": ["in_invio", "inviato", "saltato", "interrotto"],"promemoria_tipo": ["feedback_3_mesi", "rinnovo_1_mese"],"proposta_stato": ["da_confermare", "confermata", "scartata"],"qualita_conversazioni": ["buone", "medie", "scarse"],"quota_in_target": ["quasi_tutti", "circa_meta", "pochi"],"sale_type": ["nuovo", "rinnovo", "upsell"]
          }
        }
} as const
