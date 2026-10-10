import type { StatusContenuto, TipoContenuto } from '@/lib/marketing/etichette'
import type { PostInstagram } from '@/lib/marketing/post-del-contenuto'

/** A content proposed for a post, as the card shows it. */
export type PropostaPost = {
  contenuto_id: string
  nome: string
  tipo: TipoContenuto
  stato: StatusContenuto
  post_date: string | null
  motivi: string[]
}

/** A post of «Da collegare»: proposals (at most 3) or none. */
export type PostDaCollegare = PostInstagram & { proposte: PropostaPost[] }

/** A post of «Collegati»: its content, and whether the run linked it. */
export type PostCollegato = PostInstagram & {
  contenuto_id: string
  contenuto_nome: string
  daSolo: boolean
}

/** A content «Scegli un contenuto» offers: without URL, not Canceled. */
export type ContenutoScelta = {
  id: string
  nome: string
  tipo: TipoContenuto
  stato: StatusContenuto
  post_date: string | null
}
