import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { stessaOrigine } from '@/lib/auth/stessa-origine'
import { contestoCall } from '@/lib/call/accesso'
import { FRASI_FATHOM } from '@/lib/fathom/frasi'
import { risolviLink } from '@/lib/fathom/risolvi'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }

const corpoSchema = z.object({ call_id: z.string().uuid(), url: z.string().min(1).max(500) })

/**
 * «Verifica il link» of the outcome sheet and of the call's card (1.37.0, CLAUDE.md section
 * 31): finds the recording behind the pasted link through Fathom's API, with the admin's key
 * (Vault), looking only at a window around the call; writes what Fathom answered (id,
 * length, start) in call_registrazioni and tells the sheet the title, the day and the
 * length, only to show them: they are not stored. A POST route and never a server action
 * (Next sends the actions of a tab one at a time and this one waits for Fathom).
 *
 * The session decides first (admin, or the call's closer: RLS); only then the service role is
 * created here. At most 3 requests to Fathom. Nothing but the outcome in the log.
 */
export async function POST(request: NextRequest) {
  if (!stessaOrigine(request)) {
    return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 403, headers: NO_STORE })
  }
  const letto = corpoSchema.safeParse(await request.json().catch(() => null))
  if (!letto.success) return NextResponse.json({ errore: 'Richiesta non valida.' }, { status: 400, headers: NO_STORE })

  const contesto = await contestoCall(letto.data.call_id)
  if (contesto === 'vietato') {
    return NextResponse.json({ errore: 'La registrazione la collegano il closer della call e l’admin.' }, { status: 403, headers: NO_STORE })
  }
  if (contesto === 'sparita') return NextResponse.json({ errore: 'Call non trovata.' }, { status: 404, headers: NO_STORE })

  const db = createAdminClient()
  const avvio = Date.now()
  const esito = await risolviLink({
    db,
    callId: contesto.call.id,
    link: letto.data.url,
    programmataIl: contesto.call.programmata_il,
  })
  console.info('[fathom] cerca', esito.esito, `${Math.round((Date.now() - avvio) / 100) / 10}s`)

  switch (esito.esito) {
    case 'trovata':
      await db.rpc('fathom_segna_esito', { p_errore: null as never })
      return NextResponse.json(
        {
          esito: 'trovata',
          link: esito.link,
          titolo: esito.riunione.titolo,
          inizio: esito.riunione.inizio,
          durata_minuti: esito.riunione.durata_secondi ? Math.round(esito.riunione.durata_secondi / 60) : null,
        },
        { headers: NO_STORE },
      )
    case 'non_trovata':
    case 'non_fathom':
      return NextResponse.json({ esito: esito.esito, link: esito.link }, { headers: NO_STORE })
    case 'link_non_valido':
      return NextResponse.json({ esito: 'link_non_valido', errore: esito.errore }, { headers: NO_STORE })
    case 'non_collegato':
      return NextResponse.json({ esito: 'non_collegato', errore: FRASI_FATHOM.non_collegato }, { headers: NO_STORE })
    case 'errore':
      if (esito.errore.tipo === 'chiave') await db.rpc('fathom_segna_esito', { p_errore: FRASI_FATHOM.chiave })
      return NextResponse.json({ esito: 'errore', tipo: esito.errore.tipo, errore: esito.errore.message }, { headers: NO_STORE })
  }
}
