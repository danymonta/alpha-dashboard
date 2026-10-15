/**
 * Copy a text to the clipboard, from a tap («Copia», «Copia chat»). The
 * Clipboard API first, called synchronously from the click: iOS Safari and
 * the installed app drop the user's gesture after an await. Without it (an
 * http page, a refusal) a hidden textarea and execCommand('copy'), appended
 * next to the button and not on <body>, so a focus trap (a sheet) keeps it;
 * then the focus goes back to the button. Never throws: false when nothing
 * was copied.
 */
export async function copiaNegliAppunti(testo: string, ancora?: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(testo)
    return true
  } catch {
    // the fallback below
  }
  try {
    const area = document.createElement('textarea')
    area.value = testo
    area.setAttribute('readonly', '')
    area.setAttribute('aria-hidden', 'true')
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
    ;(ancora?.parentElement ?? document.body).appendChild(area)
    area.focus()
    area.select()
    // iOS needs the range
    area.setSelectionRange(0, testo.length)
    const fatto = document.execCommand('copy')
    area.remove()
    ancora?.focus({ preventScroll: true })
    return fatto
  } catch {
    return false
  }
}
