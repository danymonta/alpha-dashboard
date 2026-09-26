
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
                },"calls": {
                  Row: {
                    "closer_id": string | null,"created_at": string,"created_by": string | null,"esito": Database["public"]['Enums']["call_outcome"] | null,"id": string,"lead_id": string,"note": string | null,"obiezione_principale": string | null,"programmata_il": string,"qualificata": boolean | null,"setter_id": string | null,"stato": Database["public"]['Enums']["call_status"],"tipo": Database["public"]['Enums']["call_type"],"updated_at": string
                  }
                  Insert: {
                    "closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"esito"?: Database["public"]['Enums']["call_outcome"] | null,"id"?: string,"lead_id": string,"note"?: string | null,"obiezione_principale"?: string | null,"programmata_il": string,"qualificata"?: boolean | null,"setter_id"?: string | null,"stato"?: Database["public"]['Enums']["call_status"],"tipo": Database["public"]['Enums']["call_type"],"updated_at"?: string
                  }
                  Update: {
                    "closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"esito"?: Database["public"]['Enums']["call_outcome"] | null,"id"?: string,"lead_id"?: string,"note"?: string | null,"obiezione_principale"?: string | null,"programmata_il"?: string,"qualificata"?: boolean | null,"setter_id"?: string | null,"stato"?: Database["public"]['Enums']["call_status"],"tipo"?: Database["public"]['Enums']["call_type"],"updated_at"?: string
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
    }
                  ]
                },"products": {
                  Row: {
                    "attivo": boolean,"created_at": string,"created_by": string | null,"durata_mesi": number,"id": string,"nome": string,"prezzo_listino": number,"updated_at": string
                  }
                  Insert: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"durata_mesi": number,"id"?: string,"nome": string,"prezzo_listino": number,"updated_at"?: string
                  }
                  Update: {
                    "attivo"?: boolean,"created_at"?: string,"created_by"?: string | null,"durata_mesi"?: number,"id"?: string,"nome"?: string,"prezzo_listino"?: number,"updated_at"?: string
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
                    "attivo": boolean,"created_at": string,"email": string,"id": string,"nome": string,"ruolo": Database["public"]['Enums']["app_role"],"updated_at": string
                  }
                  Insert: {
                    "attivo"?: boolean,"created_at"?: string,"email": string,"id": string,"nome": string,"ruolo": Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Update: {
                    "attivo"?: boolean,"created_at"?: string,"email"?: string,"id"?: string,"nome"?: string,"ruolo"?: Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sales": {
                  Row: {
                    "call_id": string | null,"client_id": string,"closer_id": string | null,"created_at": string,"created_by": string | null,"data_fine": string,"data_inizio": string,"data_vendita": string,"id": string,"note": string | null,"numero_rate": number,"product_id": string | null,"setter_id": string | null,"tipo": Database["public"]['Enums']["sale_type"],"updated_at": string,"valore_contratto": number
                  }
                  Insert: {
                    "call_id"?: string | null,"client_id": string,"closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_fine": string,"data_inizio": string,"data_vendita": string,"id"?: string,"note"?: string | null,"numero_rate"?: number,"product_id"?: string | null,"setter_id"?: string | null,"tipo": Database["public"]['Enums']["sale_type"],"updated_at"?: string,"valore_contratto": number
                  }
                  Update: {
                    "call_id"?: string | null,"client_id"?: string,"closer_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_fine"?: string,"data_inizio"?: string,"data_vendita"?: string,"id"?: string,"note"?: string | null,"numero_rate"?: number,"product_id"?: string | null,"setter_id"?: string | null,"tipo"?: Database["public"]['Enums']["sale_type"],"updated_at"?: string,"valore_contratto"?: number
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
                    "call_proposte": number,"call_qualificate": number,"contenuto_pubblicato": boolean,"conversazioni": number,"created_at": string,"created_by": string | null,"data": string,"discovery_prenotate": number,"discovery_svolte": number,"dm_inbound": number,"dm_outbound": number,"follow_up": number,"id": string,"note": string | null,"setter_id": string,"strategy_prenotate": number,"updated_at": string
                  }
                  Insert: {
                    "call_proposte"?: number,"call_qualificate"?: number,"contenuto_pubblicato"?: boolean,"conversazioni"?: number,"created_at"?: string,"created_by"?: string | null,"data": string,"discovery_prenotate"?: number,"discovery_svolte"?: number,"dm_inbound"?: number,"dm_outbound"?: number,"follow_up"?: number,"id"?: string,"note"?: string | null,"setter_id": string,"strategy_prenotate"?: number,"updated_at"?: string
                  }
                  Update: {
                    "call_proposte"?: number,"call_qualificate"?: number,"contenuto_pubblicato"?: boolean,"conversazioni"?: number,"created_at"?: string,"created_by"?: string | null,"data"?: string,"discovery_prenotate"?: number,"discovery_svolte"?: number,"dm_inbound"?: number,"dm_outbound"?: number,"follow_up"?: number,"id"?: string,"note"?: string | null,"setter_id"?: string,"strategy_prenotate"?: number,"updated_at"?: string
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
                }
          }
          Functions: {
            "current_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["app_role"]
                           },
"fissa_call":
{ Args: { "p_closer_id": string,"p_data": string,"p_fonte": Database["public"]['Enums']["lead_source"],"p_instagram_handle"?: string,"p_nome": string,"p_ora": string,"p_tipo": Database["public"]['Enums']["call_type"] }; Returns: {
              "id_call": string,"id_lead": string,"lead_esistente": boolean
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"lead_appartiene_al_setter":
{ Args: { "p_lead_id": string,"p_setter_id": string }; Returns: boolean
                           },
"miei_clienti":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"nome": string,"stato": Database["public"]['Enums']["client_status"]
            }[]
                           },
"oggi":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"piano_rate":
{ Args: { "p_data_vendita": string,"p_numero_rate": number,"p_valore": number }; Returns: {
              "importo": number,"numero_rata": number,"scadenza": string
            }[]
                           },
"registra_vendita":
{ Args: { "p_call_id"?: string,"p_client_id"?: string,"p_cognome"?: string,"p_data_inizio": string,"p_data_vendita": string,"p_email"?: string,"p_instagram_handle"?: string,"p_nome"?: string,"p_note"?: string,"p_numero_rate": number,"p_product_id": string,"p_telefono"?: string,"p_tipo": Database["public"]['Enums']["sale_type"],"p_valore_contratto": number }; Returns: {
              "cliente_nuovo": boolean,"id_cliente": string,"id_vendita": string
            }[]
                           }
          }
          Enums: {
            "app_role": "admin"|"setter"|"closer"|"coach"|"editor"|"nutrizione"|"dev","audit_action": "insert"|"update"|"delete","call_outcome": "chiusa"|"follow_up"|"persa","call_status": "programmata"|"svolta"|"no_show"|"cancellata"|"riprogrammata","call_type": "discovery"|"strategy","client_status": "attivo"|"in_scadenza"|"scaduto"|"ex_cliente"|"mai_attivato","expense_category": "team"|"software"|"ads"|"formazione"|"altro","lead_source": "dm_inbound"|"dm_outbound"|"referral"|"organico"|"ads"|"altro","lead_status": "call_fissata"|"cliente"|"perso","payment_method": "bonifico"|"stripe"|"paypal"|"carta"|"contanti"|"altro","payment_status": "prevista"|"incassata"|"fallita"|"rimborsata","sale_type": "nuovo"|"rinnovo"|"upsell"
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
            "app_role": ["admin", "setter", "closer", "coach", "editor", "nutrizione", "dev"],"audit_action": ["insert", "update", "delete"],"call_outcome": ["chiusa", "follow_up", "persa"],"call_status": ["programmata", "svolta", "no_show", "cancellata", "riprogrammata"],"call_type": ["discovery", "strategy"],"client_status": ["attivo", "in_scadenza", "scaduto", "ex_cliente", "mai_attivato"],"expense_category": ["team", "software", "ads", "formazione", "altro"],"lead_source": ["dm_inbound", "dm_outbound", "referral", "organico", "ads", "altro"],"lead_status": ["call_fissata", "cliente", "perso"],"payment_method": ["bonifico", "stripe", "paypal", "carta", "contanti", "altro"],"payment_status": ["prevista", "incassata", "fallita", "rimborsata"],"sale_type": ["nuovo", "rinnovo", "upsell"]
          }
        }
} as const

