import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@/lib/utils'

/**
 * The text of a block of the CMS (contenuti_blocchi.corpo), as Markdown, never HTML: the
 * raw HTML of the text stays text. No image (the browser would fetch it by itself, and
 * the area allows images only from the app), only https links, in a new tab. «[Nome]»
 * becomes the client's first name, as the seed of the welcome writes it.
 */
export function MarkdownCliente({ testo, nome, className }: { testo: string; nome?: string; className?: string }) {
  const conNome = nome ? testo.replaceAll('[Nome]', nome) : testo
  return (
    <div className={cn('space-y-2 text-[0.95rem] leading-relaxed text-foreground/90', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) =>
            href?.startsWith('https://') ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-foreground underline decoration-primary-light underline-offset-4 hover:decoration-foreground"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          h1: ({ children }) => <p className="font-semibold text-foreground">{children}</p>,
          h2: ({ children }) => <p className="font-semibold text-foreground">{children}</p>,
          h3: ({ children }) => <p className="font-semibold text-foreground">{children}</p>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-primary pl-3 italic">{children}</blockquote>,
          code: ({ children }) => <code className="rounded bg-muted px-1">{children}</code>,
          img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        }}
      >
        {conNome}
      </ReactMarkdown>
    </div>
  )
}
