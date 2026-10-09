import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { remarkACapo } from '@/lib/marketing/a-capo'

/**
 * A section of a content (script, caption, comments), written in Markdown as
 * in Notion. Never raw HTML (no rehype-raw: the text is the team's, and React
 * escapes it). Single line breaks stay line breaks (remarkACapo turns them
 * into <br>), so "Hook: / Line: / CTA:" reads one per line like in Notion;
 * never preserved whitespace, which would show the newlines between the
 * blocks of a list item as empty lines. Never an image: the browser would fetch it by itself; the
 * import leaves "[Immagine: è nella pagina su Notion]" in its place, and an
 * image someone writes shows its alt text. Links open in a new tab.
 */
export function MarkdownContenuto({ testo }: { testo: string }) {
  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkACapo]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              {children}
            </a>
          ),
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <p className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</p>,
          h2: ({ children }) => <p className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</p>,
          h3: ({ children }) => <p className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</p>,
          h4: ({ children }) => <p className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</p>,
          h5: ({ children }) => <p className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</p>,
          h6: ({ children }) => <p className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</p>,
          hr: () => <hr className="my-3 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-border px-2 py-1 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b border-border px-2 py-1">{children}</td>,
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">{children}</pre>
          ),
          code: ({ children }) => <code className="rounded bg-muted px-1">{children}</code>,
          img: ({ alt }) => (alt ? <span className="text-muted-foreground italic">{alt}</span> : null),
        }}
      >
        {testo}
      </ReactMarkdown>
    </div>
  )
}
