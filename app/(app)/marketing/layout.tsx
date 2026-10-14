import type { ReactNode } from 'react'

import { SchedeMarketing } from '@/components/marketing/schede-marketing'
import { RUOLI_MARKETING } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/** "Da collegare": a post with proposals or without a content (v_instagram_post). */
const DA_COLLEGARE = ['proposto', 'senza_contenuto']

/**
 * The Marketing area (1.33.0): its tabs stay still between its pages
 * («Contenuti», «Post di Instagram»; «Analisi» from 1.36.0). The admin, the
 * video editor and marketing (every page checks it again). The number on
 * «Post di Instagram» is a head count under RLS; when it does not read, no
 * number. Every action of the area revalidates this layout: the number
 * follows the taps.
 */
export default async function LayoutMarketing({ children }: { children: ReactNode }) {
  await requireRuolo(RUOLI_MARKETING)
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('v_instagram_post')
    .select('shortcode', { count: 'exact', head: true })
    .in('stato_collegamento', DA_COLLEGARE)

  return (
    <div>
      <SchedeMarketing daCollegare={error ? 0 : (count ?? 0)} />
      {children}
    </div>
  )
}
