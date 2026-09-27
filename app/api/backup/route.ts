import { creaBackup, fileBackup } from '@/lib/backup/crea'
import { getProfilo } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** The admin downloads the same backup the Monday email carries, whenever they want. */
export async function GET() {
  const profilo = await getProfilo()
  if (!profilo || !profilo.attivo || profilo.ruolo !== 'admin') {
    return Response.json({ errore: 'Solo l’admin scarica il backup.' }, { status: 403 })
  }
  try {
    const file = fileBackup(await creaBackup(createAdminClient()))
    return new Response(new Uint8Array(file.contenuto), {
      headers: {
        'content-type': 'application/gzip',
        'content-disposition': `attachment; filename="${file.nome}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[backup]', e)
    return Response.json({ errore: 'Backup non riuscito. Riprova.' }, { status: 500 })
  }
}
