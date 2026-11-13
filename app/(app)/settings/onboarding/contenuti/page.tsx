import { EditorContenuti, type GruppoContenuti, type RigaBlocco } from '@/components/onboarding/editor-contenuti'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { requireRuolo } from '@/lib/auth/session'
import { getLingua } from '@/lib/i18n/server'
import { ONBOARDING, titoloPasso } from '@/lib/i18n/testi/onboarding'
import { ULTIMO_PASSO_SERVITO } from '@/lib/percorso/blocchi'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Impostazioni › Onboarding › Contenuti (release B1a): the minimal CMS of the client's area.
 * The blocks of every step of the flow and of the page after the launch, each with its
 * form and a preview drawn by the very components of the client's area. Admin only: the
 * reads and the writes go with the admin's session under RLS.
 */
export default async function ContenutiOnboardingPage() {
  await requireRuolo(['admin'])
  const lingua = await getLingua()
  const t = ONBOARDING[lingua].contenuti
  const supabase = await createClient()
  const [passi, blocchi] = await Promise.all([
    supabase.from('onboarding_passi_def').select('chiave, titolo, ordine, attore').eq('versione', 1).order('ordine'),
    supabase
      .from('contenuti_blocchi')
      .select('id, pagina, passo, ordine, tipo, titolo, corpo, youtube_id, url, obbligatorio, pubblicato')
      .eq('versione_flusso', 1)
      .order('ordine')
      .order('created_at'),
  ])
  if (passi.error || blocchi.error) throw new Error(t.errore)

  const righe = (blocchi.data ?? []) as RigaBlocco[]
  // null: every step is served (B2)
  const ordineServito =
    ULTIMO_PASSO_SERVITO === null
      ? Number.POSITIVE_INFINITY
      : (passi.data?.find((p) => p.chiave === ULTIMO_PASSO_SERVITO)?.ordine ?? 0)
  const gruppi: GruppoContenuti[] = [
    // every step of the version, the team's too (call, programma): B2 seeds their blocks, and a
    // step not served yet says so (servito), so the page does not change when B2 arrives
    ...(passi.data ?? [])
      .map((p) => ({
        chiave: p.chiave,
        pagina: 'passo' as const,
        titolo: titoloPasso(p.chiave, p.titolo, lingua),
        titoloCliente: p.titolo,
        servito: p.ordine <= ordineServito,
        blocchi: righe.filter((b) => b.pagina === 'passo' && b.passo === p.chiave),
      })),
    {
      chiave: 'dopo_lancio',
      pagina: 'dopo_lancio' as const,
      titolo: t.dopoLancio,
      titoloCliente: '',
      servito: ULTIMO_PASSO_SERVITO === null,
      blocchi: righe.filter((b) => b.pagina === 'dopo_lancio'),
    },
  ]

  return (
    <div className="max-w-4xl space-y-6">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
        indietro={{ href: '/settings/onboarding', etichetta: t.indietro }}
      />
      <EditorContenuti gruppi={gruppi} />
    </div>
  )
}
