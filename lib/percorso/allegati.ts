import { CAMPI_ALLEGATO, TIPI_ALLEGATO, type CampoAllegato, type TipoAllegato } from '@/lib/validation/questionario'

/**
 * The files of the questionnaire as the client's page uses them (release B1b): read from
 * questionario_cliente(), allegato_togli() and allegato_conferma(). Pure, shared by the server
 * and the browser. A row that does not read is dropped, never shown raw.
 */
export type AllegatoCliente = { id: string; campo: CampoAllegato; nomeFile: string; tipo: TipoAllegato; byte: number }

function record(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function leggiAllegati(v: unknown): AllegatoCliente[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((x) => {
    const a = record(x)
    if (
      typeof a.id !== 'string' ||
      !(CAMPI_ALLEGATO as readonly unknown[]).includes(a.campo) ||
      !(TIPI_ALLEGATO as readonly unknown[]).includes(a.tipo) ||
      typeof a.nome_file !== 'string'
    ) {
      return []
    }
    const byte = typeof a.byte === 'number' ? a.byte : Number(a.byte ?? 0)
    return [
      {
        id: a.id,
        campo: a.campo as CampoAllegato,
        nomeFile: a.nome_file,
        tipo: a.tipo as TipoAllegato,
        byte: Number.isFinite(byte) ? byte : 0,
      },
    ]
  })
}

/** «1,2 MB», «340 KB»: the size of a file in words. */
export function dimensioneInParole(byte: number): string {
  if (byte >= 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(byte / 1024))} KB`
}
