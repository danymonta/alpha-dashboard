/**
 * Local-only email + password sign-in for the seed users: Playwright and the
 * screenshot script need it. It must never exist in a production build, so the
 * flag is checked against NODE_ENV as well as the opt-in variable.
 *
 * No 'server-only' here on purpose: the function is pure and unit tested.
 * In a client bundle ENABLE_DEV_LOGIN is undefined, so it returns false.
 */
export function isDevLoginEnabled(
  env: { ENABLE_DEV_LOGIN?: string; NODE_ENV?: string } = process.env,
): boolean {
  return env.ENABLE_DEV_LOGIN === 'true' && env.NODE_ENV !== 'production'
}
