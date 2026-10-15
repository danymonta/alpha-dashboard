
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
                    "avvisi": (string)[],"blocchi_fatti": number | null,"blocchi_totali": number | null,"chat_attribuite": number | null,"chat_escluse": number | null,"chat_instagram": number | null,"chat_messenger": number | null,"contenuti": number | null,"contesto_app": Json | null,"costo_usd": number | null,"creata_il": string,"errore": string | null,"finita_il": string | null,"giorno": string,"id": string,"iniziata_il": string | null,"inviata_il": string | null,"invocazioni": number,"lease_fino_al": string | null,"modello": string | null,"motivo": string,"passo": Database["public"]['Enums']["insight_passo"],"progresso": NonNullable<Json>,"richiesta_da": string | null,"servito_da_fallback": number,"stato": Database["public"]['Enums']["insight_stato_esecuzione"],"tentativi": number,"token_cache_letti": number | null,"token_cache_scritti": number | null,"token_input": number | null,"token_output": number | null,"updated_at": string
                  }
                  Insert: {
                    "avvisi"?: (string)[],"blocchi_fatti"?: number | null,"blocchi_totali"?: number | null,"chat_attribuite"?: number | null,"chat_escluse"?: number | null,"chat_instagram"?: number | null,"chat_messenger"?: number | null,"contenuti"?: number | null,"contesto_app"?: Json | null,"costo_usd"?: number | null,"creata_il"?: string,"errore"?: string | null,"finita_il"?: string | null,"giorno": string,"id"?: string,"iniziata_il"?: string | null,"inviata_il"?: string | null,"invocazioni"?: number,"lease_fino_al"?: string | null,"modello"?: string | null,"motivo": string,"passo"?: Database["public"]['Enums']["insight_passo"],"progresso"?: NonNullable<Json>,"richiesta_da"?: string | null,"servito_da_fallback"?: number,"stato"?: Database["public"]['Enums']["insight_stato_esecuzione"],"tentativi"?: number,"token_cache_letti"?: number | null,"token_cache_scritti"?: number | null,"token_input"?: number | null,"token_output"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "avvisi"?: (string)[],"blocchi_fatti"?: number | null,"blocchi_totali"?: number | null,"chat_attribuite"?: number | null,"chat_escluse"?: number | null,"chat_instagram"?: number | null,"chat_messenger"?: number | null,"contenuti"?: number | null,"contesto_app"?: Json | null,"costo_usd"?: number | null,"creata_il"?: string,"errore"?: string | null,"finita_il"?: string | null,"giorno"?: string,"id"?: string,"iniziata_il"?: string | null,"inviata_il"?: string | null,"invocazioni"?: number,"lease_fino_al"?: string | null,"modello"?: string | null,"motivo"?: string,"passo"?: Database["public"]['Enums']["insight_passo"],"progresso"?: NonNullable<Json>,"richiesta_da"?: string | null,"servito_da_fallback"?: number,"stato"?: Database["public"]['Enums']["insight_stato_esecuzione"],"tentativi"?: number,"token_cache_letti"?: number | null,"token_cache_scritti"?: number | null,"token_input"?: number | null,"token_output"?: number | null,"updated_at"?: string
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
                    "audio_tipo": string | null,"avg_watch_ms": number | null,"comments": number | null,"comments_count": number | null,"copertina_url": string | null,"created_at": string,"didascalia": string | null,"eliminato_il": string | null,"follows": number | null,"letto_il": string,"like_count": number | null,"likes": number | null,"media_id": string,"media_product_type": string | null,"media_type": string,"metriche_il": string | null,"metriche_stato": string,"permalink": string,"profile_visits": number | null,"pubblicato_il": string,"reach": number | null,"reel": boolean,"reposts": number | null,"saved": number | null,"shares": number | null,"shortcode": string,"skip_rate": number | null,"total_interactions": number | null,"updated_at": string,"view_total_ms": number | null,"views": number | null
                  }
                  Insert: {
                    "audio_tipo"?: string | null,"avg_watch_ms"?: number | null,"comments"?: number | null,"comments_count"?: number | null,"copertina_url"?: string | null,"created_at"?: string,"didascalia"?: string | null,"eliminato_il"?: string | null,"follows"?: number | null,"letto_il"?: string,"like_count"?: number | null,"likes"?: number | null,"media_id": string,"media_product_type"?: string | null,"media_type": string,"metriche_il"?: string | null,"metriche_stato"?: string,"permalink": string,"profile_visits"?: number | null,"pubblicato_il": string,"reach"?: number | null,"reel": boolean,"reposts"?: number | null,"saved"?: number | null,"shares"?: number | null,"shortcode": string,"skip_rate"?: number | null,"total_interactions"?: number | null,"updated_at"?: string,"view_total_ms"?: number | null,"views"?: number | null
                  }
                  Update: {
                    "audio_tipo"?: string | null,"avg_watch_ms"?: number | null,"comments"?: number | null,"comments_count"?: number | null,"copertina_url"?: string | null,"created_at"?: string,"didascalia"?: string | null,"eliminato_il"?: string | null,"follows"?: number | null,"letto_il"?: string,"like_count"?: number | null,"likes"?: number | null,"media_id"?: string,"media_product_type"?: string | null,"media_type"?: string,"metriche_il"?: string | null,"metriche_stato"?: string,"permalink"?: string,"profile_visits"?: number | null,"pubblicato_il"?: string,"reach"?: number | null,"reel"?: boolean,"reposts"?: number | null,"saved"?: number | null,"shares"?: number | null,"shortcode"?: string,"skip_rate"?: number | null,"total_interactions"?: number | null,"updated_at"?: string,"view_total_ms"?: number | null,"views"?: number | null
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
      referencedRelation: "v_instagram_post"
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
                },"instagram_contenuti_stato": {
                  Row: {
                    "account_username": string | null,"campi": string | null,"created_at": string,"giro_dal": string | null,"giro_id": string | null,"giro_motivo": string | null,"id": boolean,"ultimo_errore": string | null,"ultimo_errore_il": string | null,"ultimo_giro_causa": string | null,"ultimo_giro_collegati": number | null,"ultimo_giro_esito": string | null,"ultimo_giro_il": string | null,"ultimo_giro_letti": number | null,"ultimo_giro_motivo": string | null,"ultimo_giro_proposti": number | null,"updated_at": string
                  }
                  Insert: {
                    "account_username"?: string | null,"campi"?: string | null,"created_at"?: string,"giro_dal"?: string | null,"giro_id"?: string | null,"giro_motivo"?: string | null,"id"?: boolean,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"ultimo_giro_causa"?: string | null,"ultimo_giro_collegati"?: number | null,"ultimo_giro_esito"?: string | null,"ultimo_giro_il"?: string | null,"ultimo_giro_letti"?: number | null,"ultimo_giro_motivo"?: string | null,"ultimo_giro_proposti"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "account_username"?: string | null,"campi"?: string | null,"created_at"?: string,"giro_dal"?: string | null,"giro_id"?: string | null,"giro_motivo"?: string | null,"id"?: boolean,"ultimo_errore"?: string | null,"ultimo_errore_il"?: string | null,"ultimo_giro_causa"?: string | null,"ultimo_giro_collegati"?: number | null,"ultimo_giro_esito"?: string | null,"ultimo_giro_il"?: string | null,"ultimo_giro_letti"?: number | null,"ultimo_giro_motivo"?: string | null,"ultimo_giro_proposti"?: number | null,"updated_at"?: string
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
      referencedRelation: "v_instagram_post"
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
      referencedRelation: "v_instagram_post"
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
      referencedRelation: "v_instagram_post"
      referencedColumns: ["contenuto_id"]
    }
                  ]
                },"marketing_contenuti": {
                  Row: {
                    "audio": string | null,"bozza": string | null,"commenti": string | null,"created_at": string,"created_by": string | null,"finale": string | null,"formato": Database["public"]['Enums']["contenuto_format"] | null,"id": string,"inspiration": string | null,"instagram_shortcode": string | null,"messaggio": string | null,"nome": string,"notion_page_id": string | null,"post_date": string | null,"reel_type": Database["public"]['Enums']["contenuto_reel_type"] | null,"stato": Database["public"]['Enums']["contenuto_status"],"tipo": Database["public"]['Enums']["contenuto_tipo"],"updated_at": string,"url": string | null,"view_count": number | null
                  }
                  Insert: {
                    "audio"?: string | null,"bozza"?: string | null,"commenti"?: string | null,"created_at"?: string,"created_by"?: string | null,"finale"?: string | null,"formato"?: Database["public"]['Enums']["contenuto_format"] | null,"id"?: string,"inspiration"?: string | null,"instagram_shortcode"?: never,"messaggio"?: string | null,"nome": string,"notion_page_id"?: string | null,"post_date"?: string | null,"reel_type"?: Database["public"]['Enums']["contenuto_reel_type"] | null,"stato"?: Database["public"]['Enums']["contenuto_status"],"tipo"?: Database["public"]['Enums']["contenuto_tipo"],"updated_at"?: string,"url"?: string | null,"view_count"?: number | null
                  }
                  Update: {
                    "audio"?: string | null,"bozza"?: string | null,"commenti"?: string | null,"created_at"?: string,"created_by"?: string | null,"finale"?: string | null,"formato"?: Database["public"]['Enums']["contenuto_format"] | null,"id"?: string,"inspiration"?: string | null,"instagram_shortcode"?: never,"messaggio"?: string | null,"nome"?: string,"notion_page_id"?: string | null,"post_date"?: string | null,"reel_type"?: Database["public"]['Enums']["contenuto_reel_type"] | null,"stato"?: Database["public"]['Enums']["contenuto_status"],"tipo"?: Database["public"]['Enums']["contenuto_tipo"],"updated_at"?: string,"url"?: string | null,"view_count"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketing_contenuti_created_by_fkey"
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
      referencedRelation: "v_instagram_post"
      referencedColumns: ["shortcode"]
    }
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
                    "created_at": string,"data": string,"fine": string | null,"id": string,"inizio": string | null,"minuti": number | null,"nota": string | null,"profile_id": string,"progetto_id": string,"task_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"data": string,"fine"?: string | null,"id"?: string,"inizio"?: string | null,"minuti"?: number | null,"nota"?: string | null,"profile_id"?: string,"progetto_id": string,"task_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"data"?: string,"fine"?: string | null,"id"?: string,"inizio"?: string | null,"minuti"?: number | null,"nota"?: string | null,"profile_id"?: string,"progetto_id"?: string,"task_id"?: string | null,"updated_at"?: string
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
                }
          }
          Views: {
            "v_client_status": {
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
      referencedRelation: "v_instagram_post"
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
      referencedRelation: "v_instagram_post"
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
"call_ha_follow_up":
{ Args: { "c": Database["public"]['Tables']["calls"]['Row'] }; Returns: boolean
                           },
"call_ha_vendita":
{ Args: { "c": Database["public"]['Tables']["calls"]['Row'] }; Returns: boolean
                           },
"cash_mensile":
{ Args: { "p_fino"?: string,"p_mesi"?: number }; Returns: {
              "mese": string,"nuovi_clienti": number,"rate_precedenti": number,"rinnovo": number,"totale": number,"upsell": number
            }[]
                           },
"chiudi_regola_provvigione":
{ Args: { "p_rule_id": string,"p_valida_al": string }; Returns: undefined
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
"copia_costi_ricorrenti":
{ Args: { "p_mese": string }; Returns: number
                           },
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
{ Args: { "p_errore": string,"p_esecuzione": string }; Returns: boolean
                           },
"insight_imposta_automazione":
{ Args: { "p_attivo": boolean,"p_ora": string,"p_url": string }; Returns: undefined
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
{ Args: { "p_url": string }; Returns: string
                           },
"insight_ruota_chiave":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"insight_scarta_letture":
{ Args: { "p_esecuzione": string }; Returns: number
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
"instagram_collega_da_solo":
{ Args: { "p_contenuto": string,"p_giorni": number,"p_motivi": (string)[],"p_punteggio": number,"p_shortcode": string,"p_somiglianza": number }; Returns: boolean
                           },
"instagram_contenuti_dm_salva":
{ Args: { "p_righe": Json }; Returns: number
                           },
"instagram_contenuti_fine_giro":
{ Args: { "p_account": string,"p_campi": string,"p_causa"?: string,"p_collegati": number,"p_errore": string,"p_esito": string,"p_giro": string,"p_letti": number,"p_proposti": number }; Returns: boolean
                           },
"instagram_contenuti_inizia_giro":
{ Args: { "p_motivo": string }; Returns: Json
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
"marketing_contenuti_per_abbinamento":
{ Args: Record<PropertyKey, never>; Returns: {
              "bozza": string,"finale": string,"id": string,"messaggio": string,"nome": string,"post_date": string,"stato": Database["public"]['Enums']["contenuto_status"],"tipo": Database["public"]['Enums']["contenuto_tipo"]
            }[]
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
"pm_ferma_timer":
{ Args: { "p_nota"?: string }; Returns: string
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
              "id": string,"inizio": string,"nota": string,"progetto": string,"progetto_id": string,"task": string,"task_id": string
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
"registra_rimborso":
{ Args: { "p_data": string,"p_importo": number,"p_note"?: string,"p_payment_id": string }; Returns: string
                           },
"registra_vendita":
{ Args: { "p_call_id"?: string,"p_client_id"?: string,"p_cognome"?: string,"p_data_fine"?: string,"p_data_inizio": string,"p_data_vendita": string,"p_email"?: string,"p_instagram_handle"?: string,"p_nome"?: string,"p_note"?: string,"p_numero_rate": number,"p_prodotto_personalizzato"?: string,"p_product_id": string,"p_rate"?: Json,"p_telefono"?: string,"p_tipo": Database["public"]['Enums']["sale_type"],"p_valore_contratto": number }; Returns: {
              "cliente_nuovo": boolean,"id_cliente": string,"id_vendita": string
            }[]
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
"rinumera_rate":
{ Args: { "p_sale_id": string }; Returns: undefined
                           },
"salva_sezione_contenuto":
{ Args: { "p_campo": string,"p_id": string,"p_impronta": string,"p_testo": string }; Returns: Json
                           },
"scarta_proposta_instagram":
{ Args: { "p_commento"?: Json,"p_id": string }; Returns: undefined
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
            "app_role": "admin"|"setter"|"closer"|"coach"|"editor"|"marketing"|"nutrizione"|"dev","audit_action": "insert"|"update"|"delete","call_outcome": "chiusa"|"follow_up"|"persa","call_performance": "ottima"|"buona"|"discreta"|"media"|"scarsa","call_status": "programmata"|"svolta"|"no_show"|"cancellata"|"riprogrammata","call_type": "discovery"|"strategy","client_status": "attivo"|"in_scadenza"|"da_iniziare"|"scaduto"|"chiuso"|"ex_cliente"|"mai_attivato","contenuto_format": "text_opinion"|"check_caption"|"split"|"reaction"|"b_roll"|"green_screen"|"raw_talking_head"|"storytelling"|"transformation"|"show_and_tell","contenuto_reel_type": "attraction"|"education"|"converting"|"radio"|"workshop","contenuto_status": "not_started"|"to_be_recorded"|"to_be_edited"|"to_be_posted"|"posted"|"canceled","contenuto_tipo": "reel"|"carousel","expense_category": "team"|"software"|"ads"|"formazione"|"altro","insight_canale": "instagram"|"messenger","insight_passo": "lettura"|"analisi"|"unione","insight_stato_esecuzione": "in_coda"|"in_corso"|"pronta"|"fallita","lead_source": "dm_inbound"|"dm_outbound"|"referral"|"organico"|"ads"|"altro","lead_status": "call_fissata"|"follow_up"|"cliente"|"perso","payment_method": "bonifico"|"stripe"|"paypal"|"carta"|"contanti"|"altro","payment_status": "prevista"|"incassata"|"fallita"|"rimborsata","pm_livello": "admin"|"manager"|"employee","pm_priorita": "bassa"|"media"|"alta","pm_stato_progetto": "attivo"|"in_pausa"|"completato"|"archiviato","pm_stato_task": "da_fare"|"in_corso"|"in_revisione"|"completato","promemoria_esito": "in_invio"|"inviato"|"saltato"|"interrotto","promemoria_tipo": "feedback_3_mesi"|"rinnovo_1_mese","proposta_stato": "da_confermare"|"confermata"|"scartata","qualita_conversazioni": "buone"|"medie"|"scarse","quota_in_target": "quasi_tutti"|"circa_meta"|"pochi","sale_type": "nuovo"|"rinnovo"|"upsell"
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
            "app_role": ["admin", "setter", "closer", "coach", "editor", "marketing", "nutrizione", "dev"],"audit_action": ["insert", "update", "delete"],"call_outcome": ["chiusa", "follow_up", "persa"],"call_performance": ["ottima", "buona", "discreta", "media", "scarsa"],"call_status": ["programmata", "svolta", "no_show", "cancellata", "riprogrammata"],"call_type": ["discovery", "strategy"],"client_status": ["attivo", "in_scadenza", "da_iniziare", "scaduto", "chiuso", "ex_cliente", "mai_attivato"],"contenuto_format": ["text_opinion", "check_caption", "split", "reaction", "b_roll", "green_screen", "raw_talking_head", "storytelling", "transformation", "show_and_tell"],"contenuto_reel_type": ["attraction", "education", "converting", "radio", "workshop"],"contenuto_status": ["not_started", "to_be_recorded", "to_be_edited", "to_be_posted", "posted", "canceled"],"contenuto_tipo": ["reel", "carousel"],"expense_category": ["team", "software", "ads", "formazione", "altro"],"insight_canale": ["instagram", "messenger"],"insight_passo": ["lettura", "analisi", "unione"],"insight_stato_esecuzione": ["in_coda", "in_corso", "pronta", "fallita"],"lead_source": ["dm_inbound", "dm_outbound", "referral", "organico", "ads", "altro"],"lead_status": ["call_fissata", "follow_up", "cliente", "perso"],"payment_method": ["bonifico", "stripe", "paypal", "carta", "contanti", "altro"],"payment_status": ["prevista", "incassata", "fallita", "rimborsata"],"pm_livello": ["admin", "manager", "employee"],"pm_priorita": ["bassa", "media", "alta"],"pm_stato_progetto": ["attivo", "in_pausa", "completato", "archiviato"],"pm_stato_task": ["da_fare", "in_corso", "in_revisione", "completato"],"promemoria_esito": ["in_invio", "inviato", "saltato", "interrotto"],"promemoria_tipo": ["feedback_3_mesi", "rinnovo_1_mese"],"proposta_stato": ["da_confermare", "confermata", "scartata"],"qualita_conversazioni": ["buone", "medie", "scarse"],"quota_in_target": ["quasi_tutti", "circa_meta", "pochi"],"sale_type": ["nuovo", "rinnovo", "upsell"]
          }
        }
} as const

