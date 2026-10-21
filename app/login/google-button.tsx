'use client'

import { LoaderCircle } from 'lucide-react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.62l4.01 3.09C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  )
}

export function GoogleButton() {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      className="h-12 w-full gap-3 text-sm font-semibold shadow-[0_12px_32px_-14px_var(--brand-fire-ember)] hover:bg-primary-light"
      disabled={pending}
    >
      {/* Google's mark needs a light ground to keep its four colours legible */}
      <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background chiaro:bg-primary-foreground chiaro:text-foreground">
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleLogo />
        )}
      </span>
      {pending ? 'Apertura di Google…' : 'Accedi con Google'}
    </Button>
  )
}
