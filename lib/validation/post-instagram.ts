import { z } from 'zod'

/**
 * The taps on the posts of Instagram (1.33.0): link a post to a content,
 * unlink it, make a content from it, leave it out of the calendar. Only the
 * shortcode and the content's id come from the browser: the permalink is read
 * from instagram_contenuti by the action, never taken from the input.
 */

/** The same rule as the table's check (instagram_contenuti_shortcode). */
export const RE_SHORTCODE_POST = /^[A-Za-z0-9_-]{5,40}$/

const shortcode = z
  .string({ required_error: 'Post non valido.', invalid_type_error: 'Post non valido.' })
  .regex(RE_SHORTCODE_POST, 'Post non valido.')

const contenutoId = z.string({ invalid_type_error: 'Contenuto non valido.' }).uuid('Contenuto non valido.')

export const coppiaPostSchema = z.object({ shortcode, contenuto_id: contenutoId })
export type CoppiaPostInput = z.input<typeof coppiaPostSchema>

export const postSchema = z.object({ shortcode })
export type PostInput = z.input<typeof postSchema>
