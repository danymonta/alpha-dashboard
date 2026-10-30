import 'server-only'

import { configCalendar, type ConfigCalendar } from '@/lib/google/calendar'

/**
 * The reminder's configuration for this request, read at request time like the
 * Picker's (configPickerRichiesta): the card hands it only to the call's closer
 * and the admin, on a follow-up by chat. Never inlined in every page's bundle,
 * and changing it on Vercel needs no rebuild.
 */
export function configCalendarRichiesta(): ConfigCalendar {
  return configCalendar(process.env)
}
