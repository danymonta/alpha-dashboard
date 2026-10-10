/**
 * The id of the content panel's own toaster (app/layout.tsx). Its toasts sit
 * at the bottom right: inside the panel they never cover its sticky header,
 * and once the panel closes they never cover the bottom bar (on a phone they
 * stay above it, --toast-pannello-basso in globals.css). A plain module: the
 * root layout, a server component, reads it too.
 */
export const TOASTER_PANNELLO = 'pannello'
