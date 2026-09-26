import Link from 'next/link'
import type { ComponentProps } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = ComponentProps<typeof Link> & {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
}

/**
 * Navigation styled as a button. A real <a>, so screen readers announce a
 * link: <Button render={<Link/>}> would give an anchor role="button".
 */
export function LinkBottone({ variant = 'default', className, ...props }: Props) {
  return <Link className={cn(buttonVariants({ variant }), 'h-11', className)} {...props} />
}
