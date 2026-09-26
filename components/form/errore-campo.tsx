/** Field-level error, linked to its input through aria-describedby. */
export function ErroreCampo({ id, messaggio }: { id: string; messaggio?: string }) {
  if (!messaggio) return null
  return (
    <p id={id} role="alert" className="text-sm text-status-critical">
      {messaggio}
    </p>
  )
}
