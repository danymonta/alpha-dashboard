import type { AppRole } from '@/lib/auth/roles'
import { VERSIONI, type Intestazione, type Pubblico, type Versione, type Voce } from '@/lib/changelog/versioni'

/**
 * Who reads what in the changelog (CLAUDE.md section 23). The admin reads
 * everything; every other role reads the items tagged for its work, the
 * Projects area (every role has it) and the whole team. The Marketing area
 * (1.32.0) is the video editor's and marketing's.
 */
export const PUBBLICI_DEL_RUOLO: Record<AppRole, readonly Pubblico[]> = {
  admin: ['admin', 'setter', 'closer', 'marketing', 'progetti', 'tutti'],
  setter: ['setter', 'progetti', 'tutti'],
  closer: ['closer', 'progetti', 'tutti'],
  coach: ['progetti', 'tutti'],
  editor: ['marketing', 'progetti', 'tutti'],
  marketing: ['marketing', 'progetti', 'tutti'],
  nutrizione: ['progetti', 'tutti'],
  dev: ['progetti', 'tutti'],
}

export function leggePubblico(ruolo: AppRole, per: readonly Pubblico[]): boolean {
  const suoi = PUBBLICI_DEL_RUOLO[ruolo]
  return per.some((p) => suoi.includes(p))
}

export type VoceVisibile = {
  testo: string
  /** Only in the admin's view: who else reads the item. */
  per?: readonly Pubblico[]
}

export type VersioneVisibile = {
  versione: string
  data: string
  /** null: the heading speaks of what this role does not read; the page shows a neutral one. */
  intestazione: Intestazione | null
  novita: VoceVisibile[]
  correzioni: VoceVisibile[]
}

/**
 * The changelog as one role reads it: only its items, in the team's words
 * when the admin's speak to Dany, and only the versions with at least one of
 * them. Computed on the server: what a role does not read never reaches its
 * browser.
 */
export function versioniPer(ruolo: AppRole, versioni: readonly Versione[] = VERSIONI): VersioneVisibile[] {
  const admin = ruolo === 'admin'
  const scegli = (voci: readonly Voce[] = []): VoceVisibile[] =>
    voci
      .filter((voce) => leggePubblico(ruolo, voce.per))
      .map((voce) => (admin ? { testo: voce.testo, per: voce.per } : { testo: voce.testoTeam ?? voce.testo }))

  const risultato: VersioneVisibile[] = []
  for (const v of versioni) {
    const novita = scegli(v.novita)
    const correzioni = scegli(v.correzioni)
    if (novita.length + correzioni.length === 0) continue

    let intestazione: Intestazione | null = null
    if (admin) intestazione = { titolo: v.titolo, riassunto: v.riassunto }
    else if (leggePubblico(ruolo, v.intestazionePer)) {
      intestazione = v.intestazioneTeam ?? { titolo: v.titolo, riassunto: v.riassunto }
    }

    risultato.push({ versione: v.versione, data: v.data, intestazione, novita, correzioni })
  }
  return risultato
}
