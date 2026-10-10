/**
 * A content of the calendar made from a post of Instagram ("Crea il
 * contenuto", 1.33.0): a reel nobody planned, a carousel posted on the fly.
 * Pure: the action passes it through contenutoSchema like every content.
 *
 * Status Posted, the Post Date the Rome day the post went out, the URL its
 * permalink (so instagram_shortcode links it). The Name is the caption's first
 * line that says something (no hashtags, mentions or links), at most 120
 * characters cut at a word; without a caption "Reel del 03/10/2026" or "Post
 * del 03/10/2026". Reel Type, Format and the sections stay empty: no
 * "Hook / Line / CTA" draft, the reel is already made.
 */
import { tipoDelPost } from '@/lib/marketing/abbinamento'
import { formatData } from '@/lib/format'
import { giornoRoma } from '@/lib/setting/conteggio-dm'
import type { ContenutoInput } from '@/lib/validation/contenuto'

/** The longest Name made from a caption, the ellipsis included. */
export const NOME_DA_POST_MAX = 120

const RE_RUMORE = /https?:\/\/\S+|www\.\S+|@[\p{L}\p{N}._]+|#[\p{L}\p{N}_]+/gu

export type PostPerContenuto = {
  media_type: string
  reel: boolean
  pubblicato_il: string
  permalink: string
  didascalia: string | null
}

/** "Lorem ipsum…" at most `max` code points, cut at the last space when there is one in the second half. */
function taglia(testo: string, max: number): string {
  const caratteri = [...testo]
  if (caratteri.length <= max) return testo
  const primi = caratteri.slice(0, max - 1).join('')
  const spazio = primi.lastIndexOf(' ')
  const corto = spazio >= Math.floor(primi.length / 2) ? primi.slice(0, spazio) : primi
  return `${corto.replace(/[\s,;:.\u2013\u2014-]+$/u, '')}…`
}

/** The caption's first line that is not only hashtags, mentions or links; null when none is. */
export function nomeDaDidascalia(didascalia: string | null | undefined): string | null {
  if (!didascalia) return null
  for (const riga of didascalia.split(/\r?\n/u)) {
    const pulita = riga.replace(RE_RUMORE, ' ').replace(/\s+/gu, ' ').trim()
    if (pulita !== '' && /[\p{L}\p{N}]/u.test(pulita)) return taglia(pulita, NOME_DA_POST_MAX)
  }
  return null
}

/** The content a post becomes, as contenutoSchema reads it. */
export function contenutoDaPost(post: PostPerContenuto): ContenutoInput {
  const tipo = tipoDelPost(post) === 'reel' ? 'reel' : 'carousel'
  const giorno = giornoRoma(post.pubblicato_il)
  const nome =
    nomeDaDidascalia(post.didascalia) ??
    `${tipo === 'reel' ? 'Reel' : 'Post'} del ${giorno ? formatData(giorno) : 'giorno sconosciuto'}`
  return {
    tipo,
    nome,
    stato: 'posted',
    post_date: giorno,
    url: post.permalink,
    reel_type: null,
    formato: null,
    inspiration: null,
    audio: null,
    view_count: null,
  }
}
