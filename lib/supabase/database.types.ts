
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
                    "closer_id": string | null,"created_at": string,"created_by": string | null,"esito": Database["public"]['Enums']["call_outcome"] | null,"id": string,"lead_id": string,"link_registrazione": string | null,"note": string | null,"note_closer": string | null,"obiezione_principale": string | null,"performance": Database["public"]['Enums']["call_performance"] | null,"prodotto_proposto_id": string | null,"programmata_il": string,"qualificata": boolean | null,"setter_id": string | null,"stato": Database["public"]['Enums']["call_status"],"tipo": Database["public"]['Enums']["call_type"],"updated_at": string
                  }
                  Insert: {
                    "closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"esito"?: Database["public"]['Enums']["call_outcome"] | null,"id"?: string,"lead_id": string,"link_registrazione"?: string | null,"note"?: string | null,"note_closer"?: string | null,"obiezione_principale"?: string | null,"performance"?: Database["public"]['Enums']["call_performance"] | null,"prodotto_proposto_id"?: string | null,"programmata_il": string,"qualificata"?: boolean | null,"setter_id"?: string | null,"stato"?: Database["public"]['Enums']["call_status"],"tipo": Database["public"]['Enums']["call_type"],"updated_at"?: string
                  }
                  Update: {
                    "closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"esito"?: Database["public"]['Enums']["call_outcome"] | null,"id"?: string,"lead_id"?: string,"link_registrazione"?: string | null,"note"?: string | null,"note_closer"?: string | null,"obiezione_principale"?: string | null,"performance"?: Database["public"]['Enums']["call_performance"] | null,"prodotto_proposto_id"?: string | null,"programmata_il"?: string,"qualificata"?: boolean | null,"setter_id"?: string | null,"stato"?: Database["public"]['Enums']["call_status"],"tipo"?: Database["public"]['Enums']["call_type"],"updated_at"?: string
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
"cash_mensile":
{ Args: { "p_fino"?: string,"p_mesi"?: number }; Returns: {
              "mese": string,"nuovi_clienti": number,"rate_precedenti": number,"rinnovo": number,"totale": number,"upsell": number
            }[]
                           },
"chiudi_regola_provvigione":
{ Args: { "p_rule_id": string,"p_valida_al": string }; Returns: undefined
                           },
"commenti_setter_periodo":
{ Args: { "p_a": string,"p_da": string,"p_limite"?: number,"p_setter"?: string }; Returns: {
              "cosa_frenava": string,"data": string,"domande_contenuti": string,"giorni": number,"lead_in_target": Database["public"]['Enums']["quota_in_target"],"livello": string,"note": string,"qualita_conversazioni": Database["public"]['Enums']["qualita_conversazioni"],"quota": number,"report_id": string,"scala": string,"setter": string,"setter_id": string,"su_giorni": number,"tipo": string
            }[]
                           },
"copia_costi_ricorrenti":
{ Args: { "p_mese": string }; Returns: number
                           },
"current_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"da_incassare":
{ Args: Record<PropertyKey, never>; Returns: {
              "fascia": string,"numero": number,"totale": number
            }[]
                           },
"dettagli_call":
{ Args: { "p_call_id": string,"p_importo_proposto"?: number,"p_link_registrazione"?: string,"p_note_closer"?: string,"p_performance"?: Database["public"]['Enums']["call_performance"],"p_prodotto_proposto_id"?: string }; Returns: undefined
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
"inserisci_piano":
{ Args: { "p_rate": Json,"p_sale_id": string }; Returns: undefined
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
"pm_assegnato":
{ Args: { "p_task": string }; Returns: boolean
                           },
"pm_avvia_timer":
{ Args: { "p_nota"?: string,"p_progetto_id": string,"p_task_id"?: string }; Returns: string
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
"riepilogo_serale":
{ Args: { "p_giorno": string }; Returns: Json
                           },
"rinumera_rate":
{ Args: { "p_sale_id": string }; Returns: undefined
                           },
"segna_rata_incassata":
{ Args: { "p_importo"?: number,"p_incassato_il"?: string,"p_metodo"?: Database["public"]['Enums']["payment_method"],"p_payment_id": string }; Returns: {
              "data_registrata": string,"importo_registrato": number,"rata": number
            }[]
                           },
"segna_tutorial_visto":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"unisci_profili":
{ Args: { "p_a": string,"p_da": string }; Returns: undefined
                           },
"verifica_periodo":
{ Args: { "p_a": string,"p_da": string }; Returns: undefined
                           },
"verifica_piano":
{ Args: { "p_rate": Json,"p_valore": number }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "admin"|"setter"|"closer"|"coach"|"editor"|"nutrizione"|"dev","audit_action": "insert"|"update"|"delete","call_outcome": "chiusa"|"follow_up"|"persa","call_performance": "ottima"|"buona"|"discreta"|"media"|"scarsa","call_status": "programmata"|"svolta"|"no_show"|"cancellata"|"riprogrammata","call_type": "discovery"|"strategy","client_status": "attivo"|"in_scadenza"|"scaduto"|"ex_cliente"|"mai_attivato","expense_category": "team"|"software"|"ads"|"formazione"|"altro","lead_source": "dm_inbound"|"dm_outbound"|"referral"|"organico"|"ads"|"altro","lead_status": "call_fissata"|"follow_up"|"cliente"|"perso","payment_method": "bonifico"|"stripe"|"paypal"|"carta"|"contanti"|"altro","payment_status": "prevista"|"incassata"|"fallita"|"rimborsata","pm_livello": "admin"|"manager"|"employee","pm_priorita": "bassa"|"media"|"alta","pm_stato_progetto": "attivo"|"in_pausa"|"completato"|"archiviato","pm_stato_task": "da_fare"|"in_corso"|"in_revisione"|"completato","qualita_conversazioni": "buone"|"medie"|"scarse","quota_in_target": "quasi_tutti"|"circa_meta"|"pochi","sale_type": "nuovo"|"rinnovo"|"upsell"
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
            "app_role": ["admin", "setter", "closer", "coach", "editor", "nutrizione", "dev"],"audit_action": ["insert", "update", "delete"],"call_outcome": ["chiusa", "follow_up", "persa"],"call_performance": ["ottima", "buona", "discreta", "media", "scarsa"],"call_status": ["programmata", "svolta", "no_show", "cancellata", "riprogrammata"],"call_type": ["discovery", "strategy"],"client_status": ["attivo", "in_scadenza", "scaduto", "ex_cliente", "mai_attivato"],"expense_category": ["team", "software", "ads", "formazione", "altro"],"lead_source": ["dm_inbound", "dm_outbound", "referral", "organico", "ads", "altro"],"lead_status": ["call_fissata", "follow_up", "cliente", "perso"],"payment_method": ["bonifico", "stripe", "paypal", "carta", "contanti", "altro"],"payment_status": ["prevista", "incassata", "fallita", "rimborsata"],"pm_livello": ["admin", "manager", "employee"],"pm_priorita": ["bassa", "media", "alta"],"pm_stato_progetto": ["attivo", "in_pausa", "completato", "archiviato"],"pm_stato_task": ["da_fare", "in_corso", "in_revisione", "completato"],"qualita_conversazioni": ["buone", "medie", "scarse"],"quota_in_target": ["quasi_tutti", "circa_meta", "pochi"],"sale_type": ["nuovo", "rinnovo", "upsell"]
          }
        }
} as const

