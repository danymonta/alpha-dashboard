import 'server-only'

import { cookies } from 'next/headers'

import { COOKIE_PICKER_E2E, configPickerPer, type ConfigPicker } from '@/lib/google/picker'

/**
 * The Picker's configuration for this request, read at request time: the
 * server hands the three public values to the admin's client sheet only (they
 * are not inlined in every page's bundle), and changing them needs no rebuild.
 */
export async function configPickerRichiesta(): Promise<ConfigPicker | null> {
  const biscotti = await cookies()
  return configPickerPer(process.env, biscotti.get(COOKIE_PICKER_E2E)?.value)
}
