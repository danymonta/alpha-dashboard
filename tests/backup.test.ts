import { describe, expect, it } from 'vitest'

import { conteggi, sqlRipristino, type Backup } from '@/lib/backup/formato'
import { emailBackup } from '@/lib/email/backup'

const backup: Backup = {
  formato: 1,
  creato_il: '2026-09-28T06:00:00.000Z',
  tabelle: {
    payments: [{ id: 'p1', sale_id: 's1', importo_previsto: 2500 }],
    sales: [{ id: 's1', client_id: 'c1' }],
    clients: [{ id: 'c1', nome: 'Loris', note: "l'annuale" }],
    expenses: [],
    tabella_nuova: [{ id: 'x' }],
  },
  utenti: [{ id: 'u1', email: 'dany@example.com', user_metadata: {}, created_at: '2026-09-26T10:00:00Z' }],
}

describe('ripristino del backup', () => {
  const sql = sqlRipristino(backup)

  it('una transazione, trigger spenti, solo righe mancanti', () => {
    expect(sql).toContain('begin;')
    expect(sql).toContain('set local session_replication_role = replica;')
    expect(sql.trim().endsWith('commit;')).toBe(true)
    expect(sql.match(/on conflict do nothing;/g)).toHaveLength(4)
  })

  it('prima chi è puntato: clienti, poi vendite, poi rate; le tabelle nuove in fondo', () => {
    const pos = (t: string) => sql.indexOf(`insert into public.${t}\n`)
    expect(pos('clients')).toBeLessThan(pos('sales'))
    expect(pos('sales')).toBeLessThan(pos('payments'))
    expect(pos('payments')).toBeLessThan(pos('tabella_nuova'))
    expect(sql).not.toContain('insert into public.expenses')
  })

  it('i testi con apici passano intatti, gli account tornano', () => {
    expect(sql).toContain(`"note":"l'annuale"`)
    expect(sql).toContain('insert into auth.users')
    expect(sql).toContain('dany@example.com')
  })

  it('rifiuta nomi di tabella strani e formati sconosciuti', () => {
    expect(() => sqlRipristino({ ...backup, tabelle: { 'x; drop table y': [] } })).toThrow('Nome di tabella non valido')
    expect(() => sqlRipristino({ ...backup, formato: 2 as 1 })).toThrow('Formato di backup sconosciuto')
    expect(() => sqlRipristino({ ...backup, tabelle: { clients: [{ note: '$alpha_backup$' }] } })).toThrow()
  })
})

describe('email del backup', () => {
  it('dice cosa c’è dentro e come si rimette', () => {
    const { oggetto, testo } = emailBackup(backup, 'backup-alpha-2026-09-28.json.gz')
    expect(oggetto).toBe('Backup settimanale Alpha Economics · 28/09/2026')
    expect(testo).toContain('Vendite: 1')
    expect(testo).toContain('Rate e incassi: 1')
    expect(testo).toContain('npm run backup:sql -- backup-alpha-2026-09-28.json.gz ripristino.sql')
  })

  it('conteggi dal più grande', () => {
    expect(conteggi(backup)[0].righe).toBe(1)
    expect(conteggi(backup).at(-1)).toEqual({ tabella: 'expenses', righe: 0 })
  })
})
