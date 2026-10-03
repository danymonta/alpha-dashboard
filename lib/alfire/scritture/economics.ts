import 'server-only'

import { z } from 'zod'

import { salvaObiettivi } from '@/app/actions/obiettivi'
import {
  anteprimaInterruzione,
  aggiornaCliente,
  creaCliente,
  eliminaCliente,
  interrompiPercorso,
} from '@/app/(app)/clients/actions'
import {
  eliminaPagamentoProvvigione,
  modificaPagamentoProvvigione,
  registraPagamentoProvvigione,
} from '@/app/(app)/commissions/actions'
import { aggiungiCosto, copiaRicorrenti, eliminaCosto, modificaCosto } from '@/app/(app)/expenses/actions'
import {
  aggiungiRata,
  annullaIncasso,
  eliminaRata,
  eliminaVendita,
  modificaIncasso,
  modificaRata,
  modificaVendita,
  registraRimborso,
  segnaFallita,
  segnaIncassata,
} from '@/app/(app)/sales/[id]/actions'
import { registraVendita } from '@/app/(app)/sales/new/actions'
import { chiudiRegola, eliminaRegola, modificaRegola, nuovaRegola } from '@/app/(app)/settings/commissions/actions'
import { cambiaAttivoProdotto, eliminaProdotto, salvaProdotto } from '@/app/(app)/settings/products/actions'
import { cambi } from '@/lib/alfire/cambi'
import { CONSEGUENZE, conseguenzeCosto, conseguenzeRata } from '@/lib/alfire/conseguenze'
import { dettagliVendita, type Anteprima } from '@/lib/alfire/riassunto'
import {
  errore,
  etichettaRegola,
  etichettaVendita,
  isErrore,
  meseDi,
  numeroRata,
  quandoCall,
  type Errore,
  type Rata,
  type Vendita,
} from '@/lib/alfire/risolvi'
import {
  anteprima,
  anteprimaConConseguenze,
  data,
  dataISO,
  definizione,
  enumAzioni,
  unisciNote,
  type Contesto,
  type Definizione,
} from '@/lib/alfire/scritture/comune'
import type { AppRole } from '@/lib/auth/roles'
import { aggiungiMesi, fineDopoMesi, oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatMese } from '@/lib/format'
import { CATEGORIE_COSTO } from '@/lib/validation/anagrafiche'
import { ETICHETTA_FONTE, FONTI, normalizzaHandle, type Fonte } from '@/lib/validation/call'
import { ETICHETTA_METODO, METODI, type Metodo } from '@/lib/validation/incasso'
import { PERSONALIZZATO, TIPI_VENDITA } from '@/lib/validation/vendita'

/**
 * Alfire's writes on money: clients, sales, instalments, costs, commissions,
 * monthly targets, products. Each one calls the server action the app's form
 * calls, with the user's session; the preview reads the row first, so the
 * card says what changes before the tap.
 */

const RUOLI_SETTER: AppRole[] = ['admin', 'setter', 'closer']
const RUOLI_CLOSER: AppRole[] = ['admin', 'closer']
const ETICHETTA_TIPO: Record<string, string> = { nuovo: 'Nuovo cliente', rinnovo: 'Rinnovo', upsell: 'Upsell' }

function fonte(v: string | null | undefined): string | null {
  return v ? (ETICHETTA_FONTE[v as Fonte] ?? v) : null
}

function metodo(v: string | null | undefined): string | null {
  return v ? (ETICHETTA_METODO[v as Metodo] ?? v) : null
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
function cliente(ctx: Contesto): Definizione {
  const { supabase, r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'cliente'),
    cliente: z.string().optional().describe('Nome e cognome attuali (modifica, elimina)'),
    nome: z.string().min(1).max(80).optional(),
    cognome: z.string().max(80).optional(),
    email: z.string().max(160).optional(),
    telefono: z.string().max(30).optional(),
    instagram_handle: z.string().max(40).optional(),
    fonte: z.enum(FONTI).optional(),
    setter: z.string().optional(),
    closer: z.string().optional(),
    note: z.string().max(1000).optional().describe('Sostituisce le note'),
    aggiungi_nota: z.string().max(500).optional().describe('In fondo alle note'),
  })
  type Input = z.infer<typeof schema>
  const campi = 'id, nome, cognome, email, telefono, instagram_handle, fonte, setter_id, closer_id, note'

  /** The row as it is, and as it will be after the edit. */
  async function unisci(v: Input) {
    const c = await r.trovaCliente(v.cliente ?? '')
    if (!c) return errore('Dimmi quale cliente.')
    if (isErrore(c)) return c
    const { data: attuale } = await supabase.from('clients').select(campi).eq('id', c.id).single()
    if (!attuale) return errore('Cliente non trovato.')
    const setter = await r.idPersona(v.setter, attuale.setter_id, RUOLI_SETTER)
    if (isErrore(setter)) return setter
    const closer = await r.idPersona(v.closer, attuale.closer_id, RUOLI_CLOSER)
    if (isErrore(closer)) return closer
    const dopo = {
      ...attuale,
      nome: v.nome ?? attuale.nome,
      cognome: v.cognome ?? attuale.cognome,
      email: v.email ?? attuale.email,
      telefono: v.telefono ?? attuale.telefono,
      instagram_handle: v.instagram_handle ?? attuale.instagram_handle,
      fonte: v.fonte ?? attuale.fonte,
      setter_id: setter,
      closer_id: closer,
      note: unisciNote(attuale.note, v.note, v.aggiungi_nota),
    }
    return { nome: c.nome, attuale, dopo }
  }

  /** A new client's setter and closer by name, before the tap: an unknown name stops the card. */
  async function persone(v: Input) {
    const setter = await r.idPersona(v.setter, null, RUOLI_SETTER)
    if (isErrore(setter)) return setter
    const closer = await r.idPersona(v.closer, null, RUOLI_CLOSER)
    if (isErrore(closer)) return closer
    return { setter, closer }
  }

  return definizione({
    description:
      'Anagrafica di un cliente. crea: solo per chi non ha comprato niente (se ha comprato usa registra_vendita). ' +
      'modifica: solo i campi da cambiare; setter e closer dell’anagrafica: nome, "io" o "nessuno" (provvigioni e "I tuoi clienti" ' +
      'seguono il setter della vendita: vendita modifica). elimina: con le sue vendite e rate.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      if (v.azione === 'crea') {
        if (!v.nome) return errore('Scrivi il nome del cliente.')
        const p = await persone(v)
        if (isErrore(p)) return p
        const gia = await r.trovaCliente(`${v.nome} ${v.cognome ?? ''}`.trim())
        return anteprima(undefined, [gia && !isErrore(gia) ? `C’è già un cliente ${gia.nome}: controlla che non sia lui.` : null], false)
      }
      if (v.azione === 'elimina') {
        const c = await r.trovaCliente(v.cliente ?? '')
        if (!c) return errore('Dimmi quale cliente.')
        if (isErrore(c)) return c
        return anteprimaConConseguenze(`Elimino il cliente ${c.nome}`, 'cliente', c.id)
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      const nomi = await r.nomi([u.attuale.setter_id, u.attuale.closer_id, u.dopo.setter_id, u.dopo.closer_id])
      const nome = (id: string | null) => (id ? (nomi.get(id) ?? '?') : null)
      // the client's setter is not the sale's: commissions keep following the sales already there
      let venditeConSetter = false
      if (u.attuale.setter_id !== u.dopo.setter_id) {
        const { data: vendite } = await supabase.from('sales').select('id').eq('client_id', u.attuale.id).limit(1)
        venditeConSetter = (vendite ?? []).length > 0
      }
      return anteprima(`Correggo il cliente ${u.nome}`, [
        ...cambi([
          ['Nome', u.attuale.nome, u.dopo.nome],
          ['Cognome', u.attuale.cognome, u.dopo.cognome],
          ['Email', u.attuale.email, u.dopo.email],
          ['Telefono', u.attuale.telefono, u.dopo.telefono],
          ['Instagram', u.attuale.instagram_handle, normalizzaHandle(u.dopo.instagram_handle ?? '')],
          ['Fonte', fonte(u.attuale.fonte), fonte(u.dopo.fonte)],
          ['Setter', nome(u.attuale.setter_id), nome(u.dopo.setter_id)],
          ['Closer', nome(u.attuale.closer_id), nome(u.dopo.closer_id)],
          ['Note', u.attuale.note, u.dopo.note, 'lungo'],
        ]),
        venditeConSetter
          ? 'Le vendite già registrate tengono il loro setter: provvigioni invariate. Per cambiarlo: vendita modifica.'
          : null,
      ])
    },
    execute: async (v) => {
      if (v.azione === 'crea') {
        if (!v.nome) return errore('Scrivi il nome del cliente.')
        const setter = await r.idPersona(v.setter, null, RUOLI_SETTER)
        if (isErrore(setter)) return setter
        const closer = await r.idPersona(v.closer, null, RUOLI_CLOSER)
        if (isErrore(closer)) return closer
        const esito = await creaCliente({
          nome: v.nome,
          cognome: v.cognome,
          email: v.email,
          telefono: v.telefono,
          instagram_handle: v.instagram_handle,
          fonte: v.fonte,
          setter_id: setter,
          closer_id: closer,
          note: unisciNote(null, v.note, v.aggiungi_nota),
        })
        return esito.ok ? { fatto: true, link: `/clients/${esito.id}` } : errore(esito.errore)
      }
      if (v.azione === 'elimina') {
        const c = await r.trovaCliente(v.cliente ?? '')
        if (!c) return errore('Dimmi quale cliente.')
        if (isErrore(c)) return c
        const esito = await eliminaCliente({ id: c.id })
        return esito.ok ? { fatto: true, cliente: c.nome, link: '/clients' } : errore(esito.errore)
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      const esito = await aggiornaCliente(u.dopo)
      return esito.ok ? { fatto: true, link: `/clients/${u.dopo.id}` } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
type ProdottoCatalogo = { id: string; nome: string; durata_mesi: number }

/**
 * A catalogue product by name: the exact name, else the names that contain it
 * as whole words ("2 mesi" is not "12 mesi"). More than one fits: an error
 * that names them, never a custom path by accident. None: null, a path
 * outside the catalogue.
 */
async function prodottoPerNome(ctx: Contesto, nome: string): Promise<ProdottoCatalogo | null | Errore> {
  const { data: prodotti, error } = await ctx.supabase.from('products').select('id, nome, durata_mesi')
  if (error) return errore('Non riesco a leggere il catalogo: riprova tra poco.')
  const elenco = prodotti ?? []
  const piano = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')
  const cerca = piano(nome)
  const esatti = elenco.filter((p) => piano(p.nome) === cerca)
  if (esatti.length === 1) return esatti[0]
  const parole = new RegExp(`(^|\\s)${cerca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)
  const simili = esatti.length > 1 ? esatti : elenco.filter((p) => parole.test(piano(p.nome)))
  if (simili.length === 1) return simili[0]
  if (simili.length > 1) {
    return errore(`Più prodotti possibili: ${simili.map((p) => p.nome).join(', ')}.`, 'Chiedi quale, o il nome del percorso su misura.')
  }
  return null
}

function nomeProdotto(v: Pick<Vendita, 'prodotto' | 'prodotto_personalizzato'>): string | null {
  return v.prodotto?.nome ?? v.prodotto_personalizzato
}

function vendita(ctx: Contesto): Definizione {
  const { r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'vendita'),
    cliente: z.string().describe('Nome e cognome'),
    data_vendita: dataISO('Quale vendita, se ne ha più di una').optional(),
    tipo: z.enum(TIPI_VENDITA).optional(),
    prodotto: z.string().optional(),
    valore: z.number().positive().optional(),
    nuova_data_vendita: data.optional(),
    data_inizio: data.optional(),
    data_fine: data.optional(),
    setter: z.string().optional(),
    closer: z.string().optional(),
    note: z.string().max(1000).optional(),
    ultimo_giorno: dataISO('interrompi: ultimo giorno del percorso').optional(),
    togli_rate: z.boolean().optional().describe('interrompi: toglie le rate non pagate dopo, il contratto scende'),
  })
  type Input = z.infer<typeof schema>

  async function unisci(v: Input) {
    const t = await r.trovaVendita(v.cliente, { data_vendita: v.data_vendita, scelta: 'recente' })
    if (isErrore(t)) return t
    const { vendita: attuale } = t
    let productId = attuale.product_id ?? PERSONALIZZATO
    let personalizzato = attuale.prodotto_personalizzato
    let prodotto = nomeProdotto(attuale)
    if (v.prodotto) {
      const p = await prodottoPerNome(ctx, v.prodotto)
      if (isErrore(p)) return p
      productId = p ? p.id : PERSONALIZZATO
      personalizzato = p ? null : v.prodotto
      prodotto = p ? p.nome : v.prodotto
    }
    const setter = await r.idPersona(v.setter, attuale.setter_id, RUOLI_SETTER)
    if (isErrore(setter)) return setter
    const closer = await r.idPersona(v.closer, attuale.closer_id, RUOLI_CLOSER)
    if (isErrore(closer)) return closer
    const dopo = {
      id: attuale.id,
      tipo: v.tipo ?? attuale.tipo,
      product_id: productId,
      prodotto_personalizzato: personalizzato,
      valore_contratto: v.valore ?? Number(attuale.valore_contratto),
      data_vendita: v.nuova_data_vendita ?? attuale.data_vendita,
      data_inizio: v.data_inizio ?? attuale.data_inizio,
      data_fine: v.data_fine ?? attuale.data_fine,
      setter_id: setter,
      closer_id: closer,
      note: v.note ?? attuale.note,
    }
    return { cliente: t.cliente.nome, attuale, dopo, prodotto }
  }

  return definizione({
    description:
      'Una vendita di un cliente. modifica: solo i campi da cambiare (la più recente, o quella di data_vendita); le rate si cambiano con rata. ' +
      'interrompi: il cliente smette prima, il percorso finisce ultimo_giorno. elimina: con le sue rate.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      if (v.azione === 'interrompi') {
        if (!v.ultimo_giorno) return errore('Dimmi l’ultimo giorno del percorso.')
        const t = await r.trovaVendita(v.cliente, { data_vendita: v.data_vendita, scelta: 'in_corso' })
        if (isErrore(t)) return t
        const a = await anteprimaInterruzione({ sale_id: t.vendita.id, ultimo_giorno: v.ultimo_giorno, togli_rate: v.togli_rate ?? false })
        if (!a.ok) return errore(a.errore)
        const p = a.anteprima
        return anteprima(`Interrompo il percorso di ${t.cliente.nome}: vendita ${etichettaVendita(t.vendita)}`, [
          `Fine del percorso: ${formatData(t.vendita.data_fine)} → ${formatData(v.ultimo_giorno)}`,
          p.rate_tolte > 0
            ? `Tolgo ${p.rate_tolte} ${p.rate_tolte === 1 ? 'rata' : 'rate'} (${formatEuro(p.importo_tolto)}): il contratto passa da ${formatEuro(p.valore_prima)} a ${formatEuro(p.valore_dopo)}.`
            : `Nessuna rata cambia: il contratto resta ${formatEuro(p.valore_prima)}.`,
          ...CONSEGUENZE.interruzione,
        ])
      }
      if (v.azione === 'elimina') {
        const t = await r.trovaVendita(v.cliente, { data_vendita: v.data_vendita, scelta: 'unica' })
        if (isErrore(t)) return t
        return anteprimaConConseguenze(`Elimino la vendita di ${t.cliente.nome} ${etichettaVendita(t.vendita)}`, 'vendita', t.vendita.id)
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      const nomi = await r.nomi([u.attuale.setter_id, u.attuale.closer_id, u.dopo.setter_id, u.dopo.closer_id])
      const nome = (id: string | null) => (id ? (nomi.get(id) ?? '?') : null)
      return anteprima(`Correggo la vendita di ${u.cliente} ${etichettaVendita(u.attuale)}`, [
        ...cambi([
          ['Tipo', ETICHETTA_TIPO[u.attuale.tipo], ETICHETTA_TIPO[u.dopo.tipo]],
          ['Prodotto', nomeProdotto(u.attuale), u.prodotto],
          ['Valore', u.attuale.valore_contratto, u.dopo.valore_contratto, 'euro'],
          ['Data di vendita', u.attuale.data_vendita, u.dopo.data_vendita, 'data'],
          ['Inizio', u.attuale.data_inizio, u.dopo.data_inizio, 'data'],
          ['Fine', u.attuale.data_fine, u.dopo.data_fine, 'data'],
          ['Setter', nome(u.attuale.setter_id), nome(u.dopo.setter_id)],
          ['Closer', nome(u.attuale.closer_id), nome(u.dopo.closer_id)],
          ['Note', u.attuale.note, u.dopo.note, 'lungo'],
        ]),
        Number(u.attuale.valore_contratto) !== u.dopo.valore_contratto ? 'Le rate restano come sono: si correggono una per una.' : null,
      ])
    },
    execute: async (v) => {
      if (v.azione === 'interrompi') {
        if (!v.ultimo_giorno) return errore('Dimmi l’ultimo giorno del percorso.')
        const t = await r.trovaVendita(v.cliente, { data_vendita: v.data_vendita, scelta: 'in_corso' })
        if (isErrore(t)) return t
        const esito = await interrompiPercorso({
          sale_id: t.vendita.id,
          ultimo_giorno: v.ultimo_giorno,
          togli_rate: v.togli_rate ?? false,
        })
        return esito.ok ? { fatto: true, link: `/sales/${t.vendita.id}` } : errore(esito.errore)
      }
      if (v.azione === 'elimina') {
        const t = await r.trovaVendita(v.cliente, { data_vendita: v.data_vendita, scelta: 'unica' })
        if (isErrore(t)) return t
        const esito = await eliminaVendita({ id: t.vendita.id })
        return esito.ok ? { fatto: true, link: '/sales' } : errore(esito.errore)
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      const esito = await modificaVendita(u.dopo)
      return esito.ok ? { fatto: true, link: `/sales/${u.dopo.id}` } : errore(esito.errore)
    },
  })
}

function registraVenditaStrumento(ctx: Contesto): Definizione {
  const { supabase, profilo, r } = ctx
  const admin = profilo.ruolo === 'admin'
  const schema = z.object({
    cliente: z.string().describe('Nome e cognome'),
    tipo: z.enum(['nuovo', 'rinnovo', 'upsell']),
    prodotto: z.string().describe('Nome del prodotto del catalogo, o del percorso su misura (es. Annuale)'),
    valore: z.number().positive().describe('Valore del contratto in euro'),
    data_vendita: data,
    data_inizio: dataISO('Di solito una settimana dopo il pagamento; un rinnovo, il giorno dopo la fine del precedente'),
    durata_mesi: z.number().int().min(1).max(36).optional(),
    data_fine: data.optional(),
    numero_rate: z.number().int().min(1).max(24).optional(),
    rate: z
      .array(
        z.object({
          scadenza: data,
          importo: z.number().positive(),
          incassata_il: data.optional(),
          metodo: z.enum(METODI).optional(),
        }),
      )
      .max(24)
      .optional(),
    call_id: z.string().uuid().optional().describe('Se nasce da una call chiusa (da call_periodo o dall’esito): ne eredita lead, setter e closer'),
    // the closer's sale takes setter and closer from the call or the client: only the admin names them
    ...(admin ? { setter: z.string().optional(), closer: z.string().optional() } : {}),
    note: z.string().max(1000).optional(),
    // only for a client created by this sale; its source is the admin's to set
    email: z.string().max(160).optional(),
    telefono: z.string().max(30).optional(),
    instagram_handle: z.string().max(40).optional(),
    ...(admin ? { fonte: z.enum(FONTI).optional() } : {}),
  })
  type Input = z.infer<typeof schema> & { setter?: string; closer?: string; fonte?: Fonte }

  /**
   * What public.registra_vendita will do with this input, read before the tap
   * and again when it runs: the client (found by name, or the one already born
   * from the call's lead, or new), the product, and who gets the sale. Setter
   * and closer as the database sets them (the call's; for a new sale without
   * one, the client's setter; the closer is whoever records it), then the
   * names the admin said, resolved before anything is written.
   */
  async function prepara(v: Input) {
    let cliente = await r.trovaCliente(v.cliente, { anchePerNuovo: v.tipo === 'nuovo' })
    if (isErrore(cliente)) return cliente
    const call = v.call_id ? await r.trovaCall({ call_id: v.call_id }) : null
    if (isErrore(call)) return call
    if (!cliente && call) {
      const { data: dalLead, error } = await supabase
        .from('clients')
        .select('id, nome, cognome')
        .eq('lead_id', call.lead_id)
        .order('created_at')
        .limit(1)
      if (error) return errore('Non riesco a leggere i clienti: riprova tra poco.')
      if (dalLead?.[0]) cliente = { id: dalLead[0].id, nome: [dalLead[0].nome, dalLead[0].cognome].filter(Boolean).join(' ') }
    }
    const prodotto = await prodottoPerNome(ctx, v.prodotto)
    if (isErrore(prodotto)) return prodotto
    const dataFine = v.data_fine ?? (v.durata_mesi ? fineDopoMesi(v.data_inizio, v.durata_mesi) : null)
    if (!prodotto && !dataFine) return errore('Per un percorso fuori catalogo servono la durata in mesi o la data di fine.')

    let setterCliente: string | null = call?.setter_id ?? null
    if (cliente) {
      const { data: anagrafica, error } = await supabase.from('clients').select('setter_id').eq('id', cliente.id).maybeSingle()
      if (error) return errore('Non riesco a leggere il cliente: riprova tra poco.')
      setterCliente = anagrafica?.setter_id ?? null
    }
    // renewals and upsells have no setter unless they come from a booked call
    const setterDb = call?.setter_id ?? (v.tipo === 'nuovo' ? setterCliente : null)
    const closerDb = call?.closer_id ?? profilo.id
    const setter = admin ? await r.idPersona(v.setter, setterDb, RUOLI_SETTER) : setterDb
    if (isErrore(setter)) return setter
    const closer = admin ? await r.idPersona(v.closer, closerDb, RUOLI_CLOSER) : closerDb
    if (isErrore(closer)) return closer
    return { cliente, call, prodotto, dataFine, setter, closer, setterDb, closerDb }
  }

  /** Setter and closer of a sale just created, when the admin named others than the database set. */
  async function cambiaPersoneVendita(saleId: string, setter: string | null, closer: string | null): Promise<string | null> {
    const { data: v } = await supabase
      .from('sales')
      .select('id, tipo, product_id, prodotto_personalizzato, valore_contratto, data_vendita, data_inizio, data_fine, setter_id, closer_id, note')
      .eq('id', saleId)
      .single()
    if (!v) return 'Vendita registrata, ma non ho potuto impostare setter e closer.'
    const esito = await modificaVendita({ ...v, product_id: v.product_id ?? PERSONALIZZATO, setter_id: setter, closer_id: closer })
    return esito.ok ? null : `Setter e closer non impostati: ${esito.errore}`
  }

  return definizione({
    description:
      'Registra una vendita: cliente esistente (o nuovo, se il tipo è "nuovo"), prodotto del catalogo o percorso su misura, valore, date. ' +
      'Piano: numero_rate uguali mensili, oppure rate una per una. Le rate già pagate si mettono in rate con incassata_il e metodo ' +
      '(es. pagato tutto subito in contanti: una rata con scadenza e incassata_il = data_vendita). ' +
      'Il pagamento di una rata di una vendita già registrata non è una vendita: usa rata. ' +
      (admin
        ? 'setter e closer: nome o "io"; di default quelli della call, o il setter del cliente. '
        : 'Setter e closer vengono dalla call (call_id) o dal cliente. ') +
      'Un rinnovo è una vendita nuova col suo periodo: quella vecchia resta. Rinnovi e upsell: senza setter, salvo che nascano da una call fissata dal setter.',
    inputSchema: schema,
    anteprima: async (input): Promise<Anteprima> => {
      const v = input as Input
      const x = await prepara(v)
      if (isErrore(x)) return x
      const nomi = await r.nomi([x.setter, x.closer])
      const nome = (id: string | null) => (id ? (nomi.get(id) ?? '?') : 'nessuno')
      const daDove = !x.setter || v.setter ? '' : x.setter === x.call?.setter_id ? ' (dalla call)' : ' (il setter del cliente)'
      const contatti = [
        v.email ? `Email ${v.email}` : null,
        v.telefono ? `Telefono ${v.telefono}` : null,
        v.instagram_handle ? `Instagram ${normalizzaHandle(v.instagram_handle)}` : null,
      ].filter((c): c is string => Boolean(c))
      return anteprima(undefined, [
        x.cliente ? `Cliente già in anagrafica: ${x.cliente.nome}` : 'Cliente nuovo: lo creo con questa vendita',
        x.prodotto ? `Prodotto del catalogo: ${x.prodotto.nome}` : `Percorso su misura: ${v.prodotto}`,
        x.call ? `Dalla call con ${x.call.lead?.nome ?? '?'} del ${quandoCall(x.call)}` : null,
        ...dettagliVendita(v),
        `Setter: ${nome(x.setter)}${daDove}`,
        `Closer: ${nome(x.closer)}`,
        // what a new client is created with; an existing one keeps its own
        ...(x.cliente ? [] : [...contatti, `Fonte: ${fonte(v.fonte ?? x.call?.lead?.fonte ?? 'altro')}`]),
        x.cliente && (contatti.length > 0 || v.fonte)
          ? `Contatti e fonte restano quelli in anagrafica di ${x.cliente.nome}: si cambiano con cliente modifica.`
          : null,
      ])
    },
    execute: async (input) => {
      const v = input as Input
      const x = await prepara(v)
      if (isErrore(x)) return x
      const c = x.cliente

      const [nome, ...cognome] = v.cliente.trim().split(/\s+/)
      const esito = await registraVendita({
        call_id: v.call_id ?? null,
        client_id: c?.id ?? null,
        nome: c ? null : nome,
        cognome: c ? null : cognome.join(' ') || null,
        email: c ? null : (v.email ?? null),
        telefono: c ? null : (v.telefono ?? null),
        instagram_handle: c ? null : (v.instagram_handle ?? null),
        tipo: v.tipo,
        product_id: x.prodotto?.id ?? PERSONALIZZATO,
        prodotto_personalizzato: x.prodotto ? null : v.prodotto,
        data_fine: x.dataFine,
        piano: v.rate?.length ? 'personalizzato' : 'uguale',
        rate: (v.rate ?? []).map((y) => ({ scadenza: y.scadenza, importo: y.importo })),
        valore_contratto: v.valore,
        numero_rate: v.rate?.length || v.numero_rate || 1,
        data_vendita: v.data_vendita,
        data_inizio: v.data_inizio,
        note: v.note ?? null,
      })
      if (!esito.ok) return errore([esito.errore, ...Object.values(esito.campi ?? {})].join(' '))
      const saleId = esito.idVendita
      const avvisi: string[] = []

      // the source of a new client is not a sale field: set it on the client
      if (!c && v.fonte && admin) {
        const { data: s } = await supabase.from('sales').select('client_id').eq('id', saleId).single()
        const { data: nuovo } = s
          ? await supabase
              .from('clients')
              .select('id, nome, cognome, email, telefono, instagram_handle, fonte, setter_id, closer_id, note')
              .eq('id', s.client_id)
              .single()
          : { data: null }
        if (nuovo) {
          const f = await aggiornaCliente({ ...nuovo, fonte: v.fonte })
          if (!f.ok) avvisi.push(`Fonte non salvata: ${f.errore}`)
        }
      }

      // who brought and who closed it, when the admin named others than the call's or the client's
      if (admin && (x.setter !== x.setterDb || x.closer !== x.closerDb)) {
        const cambio = await cambiaPersoneVendita(saleId, x.setter, x.closer)
        if (cambio) avvisi.push(cambio)
      }

      // instalments already paid, matched by due date and amount
      const pagate = (v.rate ?? []).filter((y) => y.incassata_il)
      if (pagate.length > 0) {
        const { data: rate } = await supabase
          .from('payments')
          .select('id, scadenza, importo_previsto')
          .eq('sale_id', saleId)
          .order('numero_rata')
        const libere = [...(rate ?? [])]
        for (const y of pagate) {
          const i = libere.findIndex((z_) => z_.scadenza === y.scadenza && Number(z_.importo_previsto) === y.importo)
          if (i < 0) {
            avvisi.push(`Rata del ${y.scadenza} non trovata: segnala incassata dalla vendita.`)
            continue
          }
          const [rata] = libere.splice(i, 1)
          const incasso = await segnaIncassata({
            payment_id: rata.id,
            incassato_il: y.incassata_il,
            importo: y.importo,
            metodo: y.metodo ?? null,
          })
          if (!incasso.ok) avvisi.push(`Incasso del ${y.incassata_il}: ${incasso.errore}`)
        }
      }
      return { fatto: true, link: `/sales/${saleId}`, cliente_nuovo: !c, avvisi }
    },
  })
}

// ---------------------------------------------------------------------------
// Instalments
// ---------------------------------------------------------------------------
/** Which instalments each action can touch: the same states the app offers the button on. */
const STATI_RATA: Record<string, readonly string[]> = {
  incassa: ['prevista', 'fallita'],
  correggi_incasso: ['incassata'],
  annulla_incasso: ['incassata', 'fallita'],
  fallita: ['prevista'],
  modifica: ['prevista'],
  rimborso: ['incassata'],
  elimina: ['prevista', 'incassata', 'fallita'],
}

function rata(ctx: Contesto): Definizione {
  const { supabase, r } = ctx
  const admin = ctx.profilo.ruolo === 'admin'
  const schema = z.object({
    azione: enumAzioni(ctx, 'rata'),
    cliente: z.string().describe('Nome del cliente'),
    numero: z.number().int().min(1).optional().describe('Numero della rata'),
    mese: z.string().optional().describe('AAAA-MM della scadenza, per scegliere la rata'),
    data: dataISO('Data di incasso o rimborso; default oggi').optional(),
    importo: z.number().positive().optional(),
    metodo: z.enum(METODI).optional(),
    // the closer has no reading that gives a payment_id: number or month pick his instalment
    ...(admin
      ? {
          payment_id: z.string().uuid().optional().describe('Da rate_cliente o da_incassare'),
          scadenza: dataISO('modifica, aggiungi').optional(),
          data_vendita: dataISO('aggiungi: quale vendita, default la più recente').optional(),
          note: z.string().max(300).optional(),
        }
      : {}),
  })
  type Input = z.infer<typeof schema> & { payment_id?: string; scadenza?: string; data_vendita?: string; note?: string }

  const VERBO: Record<string, string> = {
    incassa: 'Segno incassata la',
    correggi_incasso: 'Correggo l’incasso della',
    annulla_incasso: 'Annullo l’incasso della',
    fallita: 'Segno come fallita la',
    modifica: 'Correggo la',
    rimborso: 'Registro un rimborso sulla',
    elimina: 'Elimino la',
  }

  async function bersaglio(v: Input): Promise<Rata | ReturnType<typeof errore>> {
    return r.trovaRata(v.cliente, v, STATI_RATA[v.azione] ?? [])
  }

  async function venditaPerNuovaRata(v: Input) {
    const t = await r.trovaVendita(v.cliente, { data_vendita: v.data_vendita, scelta: 'recente' })
    if (isErrore(t)) return t
    if (!v.scadenza || !v.importo) return errore('Per aggiungere una rata servono scadenza e importo.')
    return t
  }

  return definizione({
    description: admin
      ? 'Una rata di una vendita già registrata, scelta con numero o mese della scadenza (o payment_id). incassa: il cliente ha pagato la rata ' +
        '(data default oggi, importo default il previsto). correggi_incasso, annulla_incasso, fallita. modifica: scadenza o importo di una rata ' +
        'da incassare. rimborso: su una rata incassata. aggiungi: nuova rata (scadenza, importo) sulla vendita più recente o di data_vendita. elimina.'
      : 'Il pagamento di una rata di una tua vendita, scelta con numero o mese della scadenza. incassa: il cliente ha pagato ' +
        '(data default oggi, importo default il previsto). correggi_incasso, annulla_incasso, fallita.',
    inputSchema: schema,
    anteprima: async (input): Promise<Anteprima> => {
      const v = input as Input
      const oggi = oggiRoma()
      if (v.azione === 'aggiungi') {
        const t = await venditaPerNuovaRata(v)
        if (isErrore(t)) return t
        const { data: piano } = await supabase
          .from('v_vendite')
          .select('totale_piano, valore_contratto, rate_totali')
          .eq('sale_id', t.vendita.id)
          .maybeSingle()
        return anteprima(`Aggiungo una rata alla vendita di ${t.cliente.nome} ${etichettaVendita(t.vendita)}`, [
          `Nuova rata: ${formatEuro(v.importo)} con scadenza ${formatData(v.scadenza)}`,
          piano
            ? `Oggi ${piano.rate_totali} ${piano.rate_totali === 1 ? 'rata somma' : 'rate sommano'} ${formatEuro(piano.totale_piano)} su un contratto di ${formatEuro(piano.valore_contratto)}.`
            : null,
          'Le rate si rinumerano in ordine di scadenza.',
        ])
      }
      const x = await bersaglio(v)
      if (isErrore(x)) return x
      const titolo = `${VERBO[v.azione]} ${numeroRata(x)} di ${x.cliente}`
      const prevista = `Prevista: ${formatEuro(x.importo_previsto)}, scadenza ${formatData(x.scadenza)}`
      const incassata = `Incassata: ${formatEuro(x.importo_incassato)} il ${formatData(x.incassato_il)}${x.metodo ? `, ${metodo(x.metodo)}` : ''}`
      switch (v.azione) {
        case 'incassa':
          return anteprima(titolo, [
            prevista,
            `Incasso: ${formatEuro(v.importo ?? x.importo_previsto)} il ${formatData(v.data ?? oggi)}${v.metodo ? `, ${metodo(v.metodo)}` : ''}`,
          ])
        case 'correggi_incasso':
          return anteprima(
            titolo,
            cambi([
              ['Incassata il', x.incassato_il, v.data ?? x.incassato_il, 'data'],
              ['Importo', x.importo_incassato, v.importo ?? x.importo_incassato, 'euro'],
              ['Metodo', metodo(x.metodo), metodo(v.metodo ?? x.metodo)],
            ]),
          )
        case 'annulla_incasso':
          return anteprima(titolo, [x.stato === 'incassata' ? incassata : 'Ora: fallita', 'Torna da incassare.'])
        case 'fallita':
          return anteprima(titolo, [prevista, 'Stato: da incassare → fallita'])
        case 'modifica':
          return anteprima(
            titolo,
            cambi([
              ['Scadenza', x.scadenza, v.scadenza ?? x.scadenza, 'data'],
              ['Importo previsto', x.importo_previsto, v.importo ?? x.importo_previsto, 'euro'],
            ]),
          )
        case 'rimborso':
          return anteprima(titolo, [
            incassata,
            `Rimborso: ${formatEuro(v.importo ?? x.importo_incassato)} il ${formatData(v.data ?? oggi)}`,
            v.note ? `Note: ${v.note}` : null,
            'La provvigione torna indietro nel mese del rimborso.',
          ])
        case 'elimina':
          if (x.rate_totali === 1) return errore('È l’ultima rata: per togliere tutto elimina la vendita.')
          return anteprima(titolo, [x.stato === 'incassata' ? incassata : prevista, ...conseguenzeRata(x.stato, x.importo_incassato)])
      }
      return anteprima(titolo, [])
    },
    execute: async (input) => {
      const v = input as Input
      if (v.azione === 'aggiungi') {
        const t = await venditaPerNuovaRata(v)
        if (isErrore(t)) return t
        const esito = await aggiungiRata({ sale_id: t.vendita.id, scadenza: v.scadenza, importo: v.importo })
        return esito.ok ? { fatto: true, link: `/sales/${t.vendita.id}` } : errore(esito.errore)
      }
      const x = await bersaglio(v)
      if (isErrore(x)) return x
      const id = x.payment_id
      let esito: { ok: true; importo?: number } | { ok: false; errore: string }
      switch (v.azione) {
        case 'incassa':
          esito = await segnaIncassata({ payment_id: id, incassato_il: v.data, importo: v.importo, metodo: v.metodo })
          break
        case 'correggi_incasso':
          esito = await modificaIncasso({
            payment_id: id,
            incassato_il: v.data ?? x.incassato_il,
            importo: v.importo ?? x.importo_incassato,
            metodo: v.metodo ?? x.metodo,
          })
          break
        case 'annulla_incasso':
          esito = await annullaIncasso({ payment_id: id })
          break
        case 'fallita':
          esito = await segnaFallita({ payment_id: id })
          break
        case 'modifica':
          esito = await modificaRata({
            payment_id: id,
            scadenza: v.scadenza ?? x.scadenza,
            importo_previsto: v.importo ?? x.importo_previsto,
          })
          break
        case 'rimborso':
          esito = await registraRimborso({
            payment_id: id,
            data: v.data ?? oggiRoma(),
            importo: v.importo ?? x.importo_incassato,
            note: v.note,
          })
          break
        case 'elimina':
          esito = await eliminaRata({ payment_id: id })
          break
        default:
          return errore('Azione non disponibile.')
      }
      return esito.ok ? { fatto: true, rata: numeroRata(x), link: `/sales/${x.sale_id}` } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------
const MANCA_COSTO = 'Per registrare un costo servono categoria, descrizione e importo.'

function costo(ctx: Contesto): Definizione {
  const { supabase, r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'costo'),
    costo: z.string().optional().describe('Descrizione attuale (modifica, elimina)'),
    id: z.string().uuid().optional().describe('Da costi_periodo'),
    mese: z.string().optional().describe('AAAA-MM: dove cercare il costo; copia_ricorrenti: mese in cui copiare, default questo'),
    data: data.optional(),
    categoria: z.enum(CATEGORIE_COSTO).optional(),
    descrizione: z.string().min(2).max(160).optional(),
    importo: z.number().positive().optional(),
    ricorrente: z.boolean().optional(),
  })
  type Input = z.infer<typeof schema>

  function meseDestinazione(v: Input): string {
    return `${meseDi(v.mese) ?? oggiRoma().slice(0, 7)}-01`
  }

  async function unisci(v: Input) {
    const c = await r.trovaCosto({ id: v.id, costo: v.costo, mese: v.mese })
    if (isErrore(c)) return c
    const dopo = {
      id: c.id,
      data: v.data ?? c.data,
      categoria: v.categoria ?? c.categoria,
      descrizione: v.descrizione ?? c.descrizione,
      importo: v.importo ?? c.importo,
      ricorrente: v.ricorrente ?? c.ricorrente,
    }
    return { attuale: c, dopo }
  }

  return definizione({
    description:
      'Costi. registra: data default oggi. modifica: solo i campi da cambiare. elimina. ' +
      'copia_ricorrenti: copia nel mese i costi ricorrenti del mese prima, saltando quelli che ci sono già.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      if (v.azione === 'registra') {
        return v.categoria && v.descrizione && v.importo ? anteprima(undefined, [], false) : errore(MANCA_COSTO)
      }
      if (v.azione === 'copia_ricorrenti') {
        const mese = meseDestinazione(v)
        const prima = aggiungiMesi(mese, -1)
        const { data: ricorrenti } = await supabase
          .from('expenses')
          .select('descrizione')
          .eq('ricorrente', true)
          .gte('data', prima)
          .lt('data', mese)
          .order('descrizione')
        const nomi = [...new Set((ricorrenti ?? []).map((c) => c.descrizione))]
        return anteprima(`Copio in ${formatMese(mese)} i costi ricorrenti di ${formatMese(prima)}`, [
          nomi.length > 0 ? `Ricorrenti di ${formatMese(prima)}: ${nomi.slice(0, 8).join(', ')}${nomi.length > 8 ? '…' : ''}` : `Nessun costo ricorrente a ${formatMese(prima)}.`,
          'Salto quelli che ci sono già.',
        ])
      }
      if (v.azione === 'elimina') {
        const c = await r.trovaCosto({ id: v.id, costo: v.costo, mese: v.mese })
        if (isErrore(c)) return c
        return anteprima(`Elimino il costo «${c.descrizione}» del ${formatData(c.data)} (${formatEuro(c.importo)})`, conseguenzeCosto(c.data))
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      return anteprima(
        `Correggo il costo «${u.attuale.descrizione}» del ${formatData(u.attuale.data)}`,
        cambi([
          ['Data', u.attuale.data, u.dopo.data, 'data'],
          ['Categoria', u.attuale.categoria, u.dopo.categoria],
          ['Descrizione', u.attuale.descrizione, u.dopo.descrizione],
          ['Importo', u.attuale.importo, u.dopo.importo, 'euro'],
          ['Ricorrente', u.attuale.ricorrente, u.dopo.ricorrente, 'si_no'],
        ]),
      )
    },
    execute: async (v) => {
      if (v.azione === 'registra') {
        if (!v.categoria || !v.descrizione || !v.importo) return errore(MANCA_COSTO)
        const esito = await aggiungiCosto({
          data: v.data ?? oggiRoma(),
          categoria: v.categoria,
          descrizione: v.descrizione,
          importo: v.importo,
          ricorrente: v.ricorrente ?? false,
        })
        return esito.ok ? { fatto: true, link: '/expenses' } : errore(esito.errore)
      }
      if (v.azione === 'copia_ricorrenti') {
        const esito = await copiaRicorrenti({ mese: meseDestinazione(v) })
        return esito.ok ? { fatto: true, copiati: esito.copiati ?? 0, link: '/expenses' } : errore(esito.errore)
      }
      if (v.azione === 'elimina') {
        const c = await r.trovaCosto({ id: v.id, costo: v.costo, mese: v.mese })
        if (isErrore(c)) return c
        const esito = await eliminaCosto({ id: c.id })
        return esito.ok ? { fatto: true, link: '/expenses' } : errore(esito.errore)
      }
      const u = await unisci(v)
      if (isErrore(u)) return u
      const esito = await modificaCosto(u.dopo)
      return esito.ok ? { fatto: true, link: '/expenses' } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Commissions: payouts and rules
// ---------------------------------------------------------------------------
function pagamentoProvvigione(ctx: Contesto): Definizione {
  const { r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'pagamento_provvigione'),
    persona: z.string().describe('Nome del collaboratore'),
    mese: z.string().describe('AAAA-MM a cui si riferisce'),
    id: z.string().uuid().optional().describe('Se nel mese ci sono più pagamenti (da provvigioni)'),
    nuovo_mese: z.string().optional().describe('modifica: il mese giusto, AAAA-MM'),
    importo: z.number().positive().optional(),
    pagato_il: dataISO('Default oggi').optional(),
    metodo: z.enum(METODI).optional(),
    note: z.string().max(300).optional(),
  })
  type Input = z.infer<typeof schema>

  async function risolvi(v: Input) {
    const periodo = meseDi(v.mese)
    if (!periodo) return errore('Dimmi il mese a cui si riferisce il pagamento.')
    const p = await r.persona(v.persona)
    if (isErrore(p)) return p
    return { persona: p, periodo: `${periodo}-01` }
  }

  return definizione({
    description: 'Pagamenti delle provvigioni a un collaboratore, per il mese a cui si riferiscono. registra, modifica, elimina.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      const x = await risolvi(v)
      if (isErrore(x)) return x
      if (v.azione === 'registra') {
        if (!v.importo) return errore('Dimmi l’importo pagato.')
        return anteprima(`Registro il pagamento di ${formatEuro(v.importo)} a ${x.persona.nome} per ${formatMese(x.periodo)}`, [
          `Pagato il ${formatData(v.pagato_il ?? oggiRoma())}${v.metodo ? `, ${metodo(v.metodo)}` : ''}`,
          v.note ? `Note: ${v.note}` : null,
        ])
      }
      const p = await r.trovaPagamento(x.persona.id, x.periodo, v.id)
      if (isErrore(p)) return p
      // the row found (by id too) says its own month, whatever the chat said
      if (v.azione === 'elimina') {
        return anteprima(`Elimino il pagamento a ${x.persona.nome} per ${formatMese(p.periodo)}`, [
          `${formatEuro(p.importo)} pagati il ${formatData(p.pagato_il)}`,
          `Il pagato di ${formatMese(p.periodo)} scende di ${formatEuro(p.importo)}.`,
        ])
      }
      const nuovoMese = meseDi(v.nuovo_mese)
      return anteprima(
        `Correggo il pagamento a ${x.persona.nome} per ${formatMese(p.periodo)}`,
        cambi([
          ['Mese', formatMese(p.periodo), formatMese(nuovoMese ? `${nuovoMese}-01` : p.periodo)],
          ['Importo', p.importo, v.importo ?? p.importo, 'euro'],
          ['Pagato il', p.pagato_il, v.pagato_il ?? p.pagato_il, 'data'],
          ['Metodo', metodo(p.metodo), metodo(v.metodo ?? p.metodo)],
          ['Note', p.note, v.note ?? p.note, 'lungo'],
        ]),
      )
    },
    execute: async (v) => {
      const x = await risolvi(v)
      if (isErrore(x)) return x
      if (v.azione === 'registra') {
        const esito = await registraPagamentoProvvigione({
          profile_id: x.persona.id,
          periodo: x.periodo,
          importo: v.importo,
          pagato_il: v.pagato_il ?? oggiRoma(),
          metodo: v.metodo,
          note: v.note,
        })
        return esito.ok ? { fatto: true, link: '/commissions' } : errore(esito.errore)
      }
      const p = await r.trovaPagamento(x.persona.id, x.periodo, v.id)
      if (isErrore(p)) return p
      const esito =
        v.azione === 'elimina'
          ? await eliminaPagamentoProvvigione({ id: p.id })
          : await modificaPagamentoProvvigione({
              id: p.id,
              periodo: meseDi(v.nuovo_mese) ? `${meseDi(v.nuovo_mese)}-01` : p.periodo,
              importo: v.importo ?? p.importo,
              pagato_il: v.pagato_il ?? p.pagato_il,
              metodo: v.metodo ?? p.metodo,
              note: v.note ?? p.note,
            })
      return esito.ok ? { fatto: true, link: '/commissions' } : errore(esito.errore)
    },
  })
}

function regolaProvvigione(ctx: Contesto): Definizione {
  const { r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'regola_provvigione'),
    persona: z.string().describe('Nome del collaboratore'),
    percentuale: z.number().positive().max(50).optional().describe('In punti: 5 = 5%'),
    applica_a: z.array(z.enum(TIPI_VENDITA)).min(1).optional().describe('Default: nuovo'),
    valida_dal: data.optional(),
    valida_al: dataISO('chiudi: ultimo giorno').optional(),
    alla_data: dataISO('Quale regola: quella valida quel giorno, default oggi').optional(),
  })

  const punti = (frazione: number) => Math.round(frazione * 10000) / 100

  return definizione({
    description:
      'Regole provvigionali (percentuale sull’incasso per tipo di vendita). nuova: dal giorno indicato, chiude quella in vigore. ' +
      'chiudi: la regola finisce valida_al, le provvigioni fino a quel giorno restano. modifica. elimina.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      const p = await r.persona(v.persona)
      if (isErrore(p)) return p
      if (v.azione === 'nuova') {
        if (!v.percentuale) return errore('Dimmi la percentuale.')
        const dal = v.valida_dal ?? oggiRoma()
        const inVigore = await r.trovaRegola(p.id, dal)
        return anteprima(
          `Nuova regola per ${p.nome}: ${String(v.percentuale).replace('.', ',')}% su ${(v.applica_a ?? ['nuovo']).join(', ')} dal ${formatData(dal)}`,
          [isErrore(inVigore) ? null : `Quella in vigore (${etichettaRegola(inVigore)}) si chiude il giorno prima.`],
        )
      }
      const regola = await r.trovaRegola(p.id, v.alla_data)
      if (isErrore(regola)) return regola
      if (v.azione === 'chiudi') {
        if (!v.valida_al) return errore('Dimmi l’ultimo giorno della regola.')
        return anteprima(`Chiudo la regola di ${p.nome} al ${formatData(v.valida_al)}`, [
          `Regola: ${etichettaRegola(regola)}`,
          'Le provvigioni fino a quel giorno restano.',
        ])
      }
      if (v.azione === 'elimina') {
        return anteprima(`Elimino la regola di ${p.nome}: ${etichettaRegola(regola)}`, [...CONSEGUENZE.regola])
      }
      return anteprima(`Correggo la regola di ${p.nome}: ${etichettaRegola(regola)}`, [
        ...cambi([
          ['Percentuale', punti(regola.percentuale), v.percentuale ?? punti(regola.percentuale), 'percento'],
          ['Si applica a', regola.applica_a, v.applica_a ?? regola.applica_a],
          ['Valida dal', regola.valida_dal, v.valida_dal ?? regola.valida_dal, 'data'],
          ['Valida al', regola.valida_al, v.valida_al ?? regola.valida_al, 'data'],
        ]),
        'Le provvigioni maturate con questa regola si ricalcolano, anche nei mesi passati.',
      ])
    },
    execute: async (v) => {
      const p = await r.persona(v.persona)
      if (isErrore(p)) return p
      if (v.azione === 'nuova') {
        const esito = await nuovaRegola({
          profile_id: p.id,
          percentuale: v.percentuale,
          applica_a: v.applica_a ?? ['nuovo'],
          valida_dal: v.valida_dal ?? oggiRoma(),
        })
        return esito.ok ? { fatto: true, link: '/settings/commissions' } : errore(esito.errore)
      }
      const regola = await r.trovaRegola(p.id, v.alla_data)
      if (isErrore(regola)) return regola
      let esito: { ok: true } | { ok: false; errore: string }
      if (v.azione === 'chiudi') {
        if (!v.valida_al) return errore('Dimmi l’ultimo giorno della regola.')
        esito = await chiudiRegola({ rule_id: regola.id, valida_al: v.valida_al })
      } else if (v.azione === 'elimina') {
        esito = await eliminaRegola({ id: regola.id })
      } else {
        esito = await modificaRegola({
          id: regola.id,
          percentuale: v.percentuale ?? punti(regola.percentuale),
          applica_a: v.applica_a ?? regola.applica_a,
          valida_dal: v.valida_dal ?? regola.valida_dal,
          valida_al: v.valida_al ?? regola.valida_al,
        })
      }
      return esito.ok ? { fatto: true, link: '/settings/commissions' } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Targets of the month
// ---------------------------------------------------------------------------
function obiettiviMese(ctx: Contesto): Definizione {
  const { supabase } = ctx
  const schema = z.object({
    mese: z.string().optional().describe('AAAA-MM, default questo mese'),
    cash: z.number().positive().nullable().optional().describe('null toglie l’obiettivo'),
    nuovi_clienti: z.number().int().positive().nullable().optional().describe('null toglie l’obiettivo'),
  })
  type Input = z.infer<typeof schema>

  async function unisci(v: Input) {
    const mese = `${meseDi(v.mese) ?? oggiRoma().slice(0, 7)}-01`
    const { data: attuale } = await supabase.from('obiettivi_mese').select('cash, nuovi_clienti').eq('mese', mese).maybeSingle()
    const prima = { cash: attuale?.cash === undefined || attuale?.cash === null ? null : Number(attuale.cash), nuovi_clienti: attuale?.nuovi_clienti ?? null }
    const dopo = {
      cash: v.cash === undefined ? prima.cash : v.cash,
      nuovi_clienti: v.nuovi_clienti === undefined ? prima.nuovi_clienti : v.nuovi_clienti,
    }
    return { mese, prima, dopo }
  }

  return definizione({
    description: 'Imposta o toglie gli obiettivi del mese: cash e nuovi clienti. Un campo non indicato resta com’è.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      const u = await unisci(v)
      if (u.dopo.cash === null && u.dopo.nuovi_clienti === null) {
        return anteprima(`Tolgo gli obiettivi di ${formatMese(u.mese)}`, [
          `Cash: ${formatEuro(u.prima.cash)}`,
          `Nuovi clienti: ${u.prima.nuovi_clienti ?? '–'}`,
        ])
      }
      return anteprima(
        `Obiettivi di ${formatMese(u.mese)}`,
        cambi([
          ['Cash', u.prima.cash, u.dopo.cash, 'euro'],
          ['Nuovi clienti', u.prima.nuovi_clienti, u.dopo.nuovi_clienti],
        ]),
      )
    },
    execute: async (v) => {
      const u = await unisci(v)
      const esito = await salvaObiettivi({ mese: u.mese, cash: u.dopo.cash, nuovi_clienti: u.dopo.nuovi_clienti })
      return esito.ok ? { fatto: true, link: '/' } : errore(esito.errore)
    },
  })
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
const MANCA_PRODOTTO = 'Per creare un prodotto servono nome, durata in mesi e prezzo di listino.'

function prodotto(ctx: Contesto): Definizione {
  const { r } = ctx
  const schema = z.object({
    azione: enumAzioni(ctx, 'prodotto'),
    prodotto: z.string().optional().describe('Nome attuale (tutto tranne crea)'),
    nome: z.string().min(2).max(80).optional(),
    durata_mesi: z.number().int().min(1).max(36).optional(),
    prezzo_listino: z.number().nonnegative().optional(),
    piano_predefinito: z
      .array(z.object({ mese: z.number().int().min(0).max(60), importo: z.number().positive() }))
      .nullable()
      .optional()
      .describe('Piano rate abituale: mesi dopo la vendita e importo; null lo toglie'),
  })
  type Input = z.infer<typeof schema>
  type Piano = { mese: number; importo: number }[] | null

  const piano = (p: Piano | undefined) =>
    p && p.length > 0 ? p.map((x) => `${formatEuro(x.importo)} al mese ${x.mese}`).join(' · ') : null

  async function unisci(v: Input) {
    const p = await r.trovaProdotto(v.prodotto ?? '')
    if (isErrore(p)) return p
    const attuale = { ...p, piano_predefinito: (p.piano_predefinito ?? null) as Piano }
    const dopo = {
      id: p.id,
      nome: v.nome ?? p.nome,
      durata_mesi: v.durata_mesi ?? p.durata_mesi,
      prezzo_listino: v.prezzo_listino ?? p.prezzo_listino,
      attivo: p.attivo,
      piano_predefinito: v.piano_predefinito === undefined ? attuale.piano_predefinito : v.piano_predefinito,
    }
    return { attuale, dopo }
  }

  return definizione({
    description:
      'Prodotti del catalogo. crea (nome, durata_mesi, prezzo_listino, piano). modifica: solo i campi da cambiare. ' +
      'fuori_vendita: resta nello storico ma non si offre più; in_vendita. elimina: le vendite passate tengono il nome.',
    inputSchema: schema,
    anteprima: async (v): Promise<Anteprima> => {
      if (v.azione === 'crea') {
        return v.nome && v.durata_mesi && v.prezzo_listino !== undefined ? anteprima(undefined, [], false) : errore(MANCA_PRODOTTO)
      }
      if (v.azione === 'modifica') {
        const u = await unisci(v)
        if (isErrore(u)) return u
        return anteprima(
          `Correggo il prodotto «${u.attuale.nome}»`,
          cambi([
            ['Nome', u.attuale.nome, u.dopo.nome],
            ['Durata in mesi', u.attuale.durata_mesi, u.dopo.durata_mesi],
            ['Prezzo di listino', u.attuale.prezzo_listino, u.dopo.prezzo_listino, 'euro'],
            ['Piano abituale', piano(u.attuale.piano_predefinito), piano(u.dopo.piano_predefinito)],
          ]),
        )
      }
      const p = await r.trovaProdotto(v.prodotto ?? '')
      if (isErrore(p)) return p
      if (v.azione === 'elimina') {
        return anteprimaConConseguenze(`Elimino il prodotto «${p.nome}»`, 'prodotto', p.id, CONSEGUENZE.prodotto)
      }
      return v.azione === 'fuori_vendita'
        ? anteprima(`Metto fuori vendita «${p.nome}»`, ['Resta nello storico, ma non si offre nelle nuove vendite.'])
        : anteprima(`Rimetto in vendita «${p.nome}»`, [])
    },
    execute: async (v) => {
      if (v.azione === 'crea') {
        if (!v.nome || !v.durata_mesi || v.prezzo_listino === undefined) return errore(MANCA_PRODOTTO)
        const esito = await salvaProdotto({
          nome: v.nome,
          durata_mesi: v.durata_mesi,
          prezzo_listino: v.prezzo_listino,
          attivo: true,
          piano_predefinito: v.piano_predefinito ?? null,
        })
        return esito.ok ? { fatto: true, link: '/settings/products' } : errore(esito.errore)
      }
      if (v.azione === 'modifica') {
        const u = await unisci(v)
        if (isErrore(u)) return u
        const esito = await salvaProdotto(u.dopo)
        return esito.ok ? { fatto: true, link: '/settings/products' } : errore(esito.errore)
      }
      const p = await r.trovaProdotto(v.prodotto ?? '')
      if (isErrore(p)) return p
      const esito =
        v.azione === 'elimina'
          ? await eliminaProdotto({ id: p.id })
          : await cambiaAttivoProdotto({ id: p.id, attivo: v.azione === 'in_vendita' })
      return esito.ok ? { fatto: true, link: '/settings/products' } : errore(esito.errore)
    },
  })
}

export function scrittureEconomics(ctx: Contesto) {
  return {
    cliente: cliente(ctx),
    vendita: vendita(ctx),
    registra_vendita: registraVenditaStrumento(ctx),
    rata: rata(ctx),
    costo: costo(ctx),
    pagamento_provvigione: pagamentoProvvigione(ctx),
    regola_provvigione: regolaProvvigione(ctx),
    obiettivi_mese: obiettiviMese(ctx),
    prodotto: prodotto(ctx),
  }
}
