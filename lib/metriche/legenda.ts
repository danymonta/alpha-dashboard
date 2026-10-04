/**
 * What every tracked number means, in one place (Dany, 28/09/2026: "DM totali
 * non si capisce cosa è"). The report form, the Setting and Closer tabs, "I
 * miei numeri" and the overview all explain a number with these words, so the
 * same label always means the same thing. The formulas are the ones computed
 * in SQL (CLAUDE.md section 9): change them there first, then here.
 */
import { SCALA_IN_TARGET, SCALA_QUALITA, type Scala } from '@/lib/setting/commento'

export type VoceLegenda = { etichetta: string; spiegazione: string }

/** A scale of the setter's comment, explained with the very words of the form (lib/setting/commento.ts). */
function voceScala(scala: Scala): VoceLegenda {
  const livelli = scala.opzioni.map((o) => `${o.etichetta}: ${o.definizione.replace(/\.$/, '')}`).join('. ')
  return {
    etichetta: scala.titolo,
    spiegazione: [scala.domanda, scala.spiegazione, `${livelli}.`].filter(Boolean).join(' '),
  }
}

export const LEGENDA_SETTING = {
  dm_outbound: {
    etichetta: 'DM outbound',
    spiegazione:
      'Persone nuove a cui hai scritto tu per primo. Si contano una volta sola, il giorno del primo messaggio: se rispondono nei giorni dopo è una conversazione.',
  },
  dm_inbound: {
    etichetta: 'DM inbound',
    spiegazione:
      'Persone nuove che ti hanno scritto per chiedere informazioni sul percorso e a cui hai risposto. Si contano una volta sola, il primo giorno.',
  },
  conversazioni: {
    etichetta: 'Conversazioni',
    spiegazione:
      'Conversazioni attive: la persona ti ha risposto e tu le hai risposto di nuovo. Se risponde il giorno dopo, è una conversazione di quel giorno. Non entrano nei DM totali.',
  },
  follow_up: {
    etichetta: 'Follow up',
    spiegazione: 'Messaggi di sollecito a chi non ti ha ancora risposto (per esempio un «?»). Non si dividono in inbound e outbound.',
  },
  dm_totali: {
    etichetta: 'DM totali',
    spiegazione: 'DM inbound + DM outbound + follow up: le persone a cui hai scritto. Le conversazioni non contano.',
  },
  call_proposte: {
    etichetta: 'Call proposte',
    spiegazione: 'Persone a cui hai proposto una call.',
  },
  discovery_prenotate: {
    etichetta: 'Discovery prenotate',
    spiegazione:
      'Discovery call fissate nel giorno (o nel periodo scelto): sono le call che fissa il setter (con i lead non si fanno strategy call).',
  },
  strategy_storico: {
    etichetta: 'Strategy (storico)',
    spiegazione:
      'Strategy call scritte nei report dei giorni passati, già comprese in «Call prenotate». Oggi il setter fissa solo discovery call: compaiono solo nei periodi che ne hanno.',
  },
  call_prenotate: {
    etichetta: 'Call prenotate',
    spiegazione: 'Le discovery call fissate nel periodo, dal report. Nei giorni passati comprendono anche le strategy call dello storico, indicate a parte quando ci sono: oggi il setter fissa solo discovery.',
  },
  prenotate_inbound: {
    etichetta: 'Prenotate da DM inbound',
    spiegazione: 'Call fissate nel giorno (o nel periodo scelto) con lead di fonte «DM inbound». Si leggono dalle call in agenda: referral, ads e organico non entrano.',
  },
  prenotate_outbound: {
    etichetta: 'Prenotate da DM outbound',
    spiegazione: 'Call fissate nel giorno (o nel periodo scelto) con lead di fonte «DM outbound». Si leggono dalle call in agenda: referral, ads e organico non entrano.',
  },
  contenuto_pubblicato: {
    etichetta: 'Contenuto pubblicato',
    spiegazione: 'Se quel giorno è uscito un contenuto sul profilo.',
  },
  // the setter's comment on his day (30/09/2026): asked with the conversations
  lead_in_target: voceScala(SCALA_IN_TARGET),
  qualita_conversazioni: voceScala(SCALA_QUALITA),
  tasso_conversazione: {
    etichetta: 'Tasso di conversazione',
    spiegazione: 'Conversazioni ÷ DM totali.',
  },
  tasso_prenotazione: {
    etichetta: 'Tasso di prenotazione',
    spiegazione: 'Call prenotate ÷ call proposte.',
  },
  dm_per_call: {
    etichetta: 'DM per call prenotata',
    spiegazione:
      'DM totali (inbound + outbound + follow up) ÷ call prenotate: quanti messaggi servono per fissare una call.',
  },
  // the overview's "per DM" ratios divide by the same DM totali, and only count
  // the new clients of the period: DMs bring new clients, not renewals
  cash_per_dm: {
    etichetta: 'Cash per DM (nuovi clienti)',
    spiegazione:
      'Cash dei nuovi clienti del periodo ÷ DM totali (inbound + outbound + follow up). Rate di clienti entrati prima, rinnovi e upsell non contano: non arrivano dai DM.',
  },
  revenue_per_dm: {
    etichetta: 'Revenue per DM (nuovi clienti)',
    spiegazione:
      'Valore dei contratti dei nuovi clienti del periodo ÷ DM totali (inbound + outbound + follow up). Rinnovi e upsell esclusi.',
  },
} satisfies Record<string, VoceLegenda>

export const LEGENDA_CLOSER = {
  call: {
    etichetta: 'Call svolte',
    spiegazione:
      'Call che si sono tenute, con l’esito registrato in «Le mie call» o in «Compila la giornata». Si contano nel giorno della call.',
  },
  qualificate: {
    etichetta: 'Qualificate',
    spiegazione: 'Call svolte con una persona in target. Una call chiusa è sempre qualificata.',
  },
  no_show: {
    etichetta: 'No show',
    spiegazione: 'Call fissate a cui la persona non si è presentata.',
  },
  follow_up: {
    etichetta: 'Follow up (esito call)',
    spiegazione: 'Call svolte con esito «Follow-up»: la decisione è rimandata, si ricontatta. Non sono i follow up in DM del setter.',
  },
  cancellate: {
    etichetta: 'Cancellate',
    spiegazione: 'Call annullate prima di tenersi.',
  },
  chiuse: {
    etichetta: 'Chiuse',
    spiegazione:
      'Call con esito «Chiusa»: di solito è entrato un nuovo cliente. Se dalla call nasce un rinnovo o un upsell conta qui, ma non in cash e revenue, che sono solo dei clienti nuovi.',
  },
  cash: {
    etichetta: 'Cash',
    spiegazione:
      'Solo clienti nuovi: la prima rata incassata delle vendite nuove, sul giorno in cui le hai chiuse. Le rate successive, i rinnovi e gli upsell restano in Incassi e in Panoramica.',
  },
  revenue: {
    etichetta: 'Revenue',
    spiegazione: 'Solo clienti nuovi: valore dei contratti delle vendite nuove chiuse quel giorno. Rinnovi e upsell esclusi.',
  },
  show_rate: {
    etichetta: 'Show rate',
    spiegazione: 'Call svolte ÷ (svolte + no show). Cancellate e in attesa di conferma non contano.',
  },
  close_rate: {
    etichetta: 'Close rate',
    spiegazione: 'Chiuse ÷ call svolte.',
  },
  close_rate_qualificate: {
    etichetta: 'Close rate su qualificate',
    spiegazione: 'Chiuse ÷ call svolte qualificate.',
  },
} satisfies Record<string, VoceLegenda>

/**
 * "I miei numeri": the calls the setter booked as the closer saw them, and the
 * money of the clients he brought. The closer's numbers that share a name with
 * a setting one say "(closer)": both halves sit in the same table.
 */
export const LEGENDA_SETTER = {
  call_fissate: {
    etichetta: 'In agenda nel periodo',
    spiegazione: 'Call che hai fissato con la data della call nel periodo, qualunque sia l’esito.',
  },
  closer_qualificate: {
    etichetta: 'Qualificate (closer)',
    spiegazione: 'Call svolte con persona in target, secondo il closer. Una call chiusa è sempre qualificata.',
  },
  closer_follow_up: {
    etichetta: 'Follow up (closer)',
    spiegazione: 'Call svolte con esito «Follow-up»: la decisione è rimandata, il closer ricontatta. Non sono i tuoi follow up in DM.',
  },
  cash_miei_clienti: {
    etichetta: 'Cash',
    spiegazione:
      'Solo i clienti nuovi che hai portato tu: la prima rata che hanno pagato per entrare, sul giorno della vendita. Le rate successive le trovi in «I tuoi clienti».',
  },
  revenue_miei_clienti: {
    etichetta: 'Revenue',
    spiegazione: 'Solo i clienti nuovi che hai portato tu: valore dei contratti firmati nel giorno (o nel periodo scelto). Rinnovi esclusi.',
  },
} satisfies Record<string, VoceLegenda>

export type ChiaveSetting = keyof typeof LEGENDA_SETTING
export type ChiaveCloser = keyof typeof LEGENDA_CLOSER

/** The overview's economics and the team's day (CLAUDE.md section 9). */
export const LEGENDA_ECONOMICS = {
  cash_incassato: {
    etichetta: 'Cash incassato',
    spiegazione:
      'Tutti i soldi entrati nel periodo, per data d’incasso, al netto dei rimborsi: nuovi clienti, rate di clienti entrati prima, rinnovi e upsell.',
  },
  // the four parts of the cash incassato: they always add up to it
  cash_nuovi_clienti: {
    etichetta: 'Nuovi clienti del periodo',
    spiegazione:
      'Parte del cash incassato: quanto hanno pagato nel periodo i clienti entrati nel periodo (vendite di tipo «nuovo» firmate nel periodo, o firmate dopo se nel periodo hanno versato un acconto), prima rata e rate successive.',
  },
  cash_rate_precedenti: {
    etichetta: 'Rate di clienti già entrati',
    spiegazione:
      'Parte del cash incassato: rate pagate nel periodo da clienti entrati prima (vendite di tipo «nuovo» firmate prima del periodo). Non sono clienti nuovi.',
  },
  cash_rinnovi: {
    etichetta: 'Rinnovi',
    spiegazione: 'Parte del cash incassato: soldi entrati nel periodo dalle vendite di tipo «rinnovo», rate comprese.',
  },
  cash_upsell: {
    etichetta: 'Upsell',
    spiegazione: 'Parte del cash incassato: soldi entrati nel periodo dalle vendite di tipo «upsell», rate comprese.',
  },
  revenue_firmata: {
    etichetta: 'Revenue firmata',
    spiegazione:
      'Valore dei contratti firmati nel periodo, per data di vendita, di ogni tipo: nuovi clienti, rinnovi e upsell.',
  },
  nuovi_clienti: {
    etichetta: 'Nuovi clienti',
    spiegazione: 'Vendite di tipo «nuovo» firmate nel periodo: i clienti entrati nel periodo.',
  },
  rinnovi: {
    etichetta: 'Rinnovi',
    spiegazione: 'Vendite di tipo «rinnovo» firmate nel periodo.',
  },
  margine_operativo: {
    etichetta: 'Margine operativo',
    spiegazione: 'Cash incassato − provvigioni maturate − costi del periodo. Le tasse non sono incluse.',
  },
  valore_medio_nuovo: {
    etichetta: 'Valore medio nuovo cliente',
    spiegazione:
      'Valore dei contratti dei nuovi clienti del periodo ÷ numero di nuovi clienti (vendite di tipo «nuovo»). Rinnovi e upsell esclusi.',
  },
  cash_per_call_svolta: {
    etichetta: 'Cash per call svolta (nuovi clienti)',
    spiegazione:
      'Cash dei nuovi clienti del periodo ÷ call svolte. Rate di clienti entrati prima, rinnovi e upsell esclusi.',
  },
  tasso_rinnovo: {
    etichetta: 'Tasso di rinnovo',
    spiegazione: 'Clienti con il percorso in scadenza nel periodo che hanno rinnovato entro 30 giorni ÷ clienti in scadenza.',
  },
  call_da_fare: {
    etichetta: 'Call da fare',
    spiegazione: 'Call in agenda oggi di cui non è ancora stato registrato l’esito.',
  },
  incassato_oggi: {
    etichetta: 'Incassato oggi',
    spiegazione:
      'Tutti i soldi incassati oggi, al netto dei rimborsi: anche rate di clienti entrati prima e rinnovi, non solo le vendite chiuse oggi. Sotto, la parte pagata dai nuovi clienti entrati oggi.',
  },
  tasso_qualificazione: {
    etichetta: 'Tasso di qualificazione',
    spiegazione: 'Call svolte che il closer ha segnato come qualificate ÷ call svolte.',
  },
  provvigioni_maturate: {
    etichetta: 'Provvigioni maturate',
    spiegazione:
      'Quanto spetta ai setter sugli incassi del periodo delle vendite coperte dalla loro regola provvigionale (di solito solo clienti nuovi), anche sulle rate dei mesi dopo la firma.',
  },
  costi: {
    etichetta: 'Costi',
    spiegazione: 'Spese registrate in «Costi» con data nel periodo.',
  },
  in_ritardo: {
    etichetta: 'In ritardo',
    spiegazione: 'Rate ancora da incassare con la scadenza già passata.',
  },
  prossimi_30: {
    etichetta: 'Entro 30 giorni',
    spiegazione: 'Rate da incassare che scadono da oggi ai prossimi 30 giorni.',
  },
  oltre_30: {
    etichetta: 'Oltre',
    spiegazione: 'Rate da incassare che scadono tra più di 30 giorni.',
  },
} satisfies Record<string, VoceLegenda>
