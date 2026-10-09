import { redirect } from 'next/navigation'

/** The Marketing area has one page for now: the content calendar. */
export default function MarketingPage() {
  redirect('/marketing/contenuti')
}
