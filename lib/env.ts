/**
 * Public environment. NEXT_PUBLIC_* must be read as static literals so Next can
 * inline them at build time: never index process.env dynamically here.
 */
function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Variabile d'ambiente mancante: ${name}. In locale copia .env.example in .env.local; ` +
        `su Vercel aggiungila in Settings > Environment Variables per Production e rifai il deploy.`,
    )
  }
  return value
}

export const publicEnv = {
  get supabaseUrl() {
    return required(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  },
  get supabasePublishableKey() {
    return required(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    )
  },
  get appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  },
}
