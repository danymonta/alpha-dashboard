import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Alfire's answers, as Markdown. Links inside the app close the panel; links
 * outside open a new tab. Never an image: the browser would fetch it by
 * itself, with no tap, and a file read into the chat could ask the model for
 * one whose address carries the data it read (Alfire only reads text).
 */
export function Markdown({ testo, chiudi }: { testo: string; chiudi: () => void }) {
  return (
    <div className="prosa-alfire text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('/') ? (
              <Link href={href} onClick={chiudi} className="font-medium underline underline-offset-4">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium underline underline-offset-4">
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-border px-2 py-1 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="num border-b border-border px-2 py-1">{children}</td>,
          ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          h2: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          h3: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          code: ({ children }) => <code className="rounded bg-muted px-1">{children}</code>,
          img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        }}
      >
        {testo}
      </ReactMarkdown>
    </div>
  )
}
