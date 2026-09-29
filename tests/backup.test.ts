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

describe('ripristino di un backup con l’assegnatario unico (prima del 29/09/2026)', () => {
  const vecchio: Backup = {
    ...backup,
    tabelle: {
      pm_task: [
        { id: 't1', progetto_id: 'pr1', titolo: 'Montaggio', assegnatario_id: 'u1', updated_at: '2026-09-20T10:00:00+00:00' },
        { id: 't2', progetto_id: 'pr1', titolo: 'Senza nessuno', assegnatario_id: null },
      ],
      pm_membri: [{ id: 'm1', progetto_id: 'pr1', profile_id: 'u1' }],
    },
  }
  const sql = sqlRipristino(vecchio)
  const blocco = sql.slice(sql.indexOf('insert into public.pm_task_assegnatari'))
  const coppie = blocco.slice(0, blocco.indexOf(';') + 1)

  it('la colonna diventa una riga di pm_task_assegnatari, dopo membri e task', () => {
    const pos = (testo: string) => sql.indexOf(testo)
    expect(pos('insert into public.pm_task_assegnatari')).toBeGreaterThan(pos('insert into public.pm_task\n'))
    expect(pos('insert into public.pm_task\n')).toBeGreaterThan(pos('insert into public.pm_membri\n'))
    expect(coppie).toContain('"id":"t1","assegnatario_id":"u1","updated_at":"2026-09-20T10:00:00+00:00"')
  })

  it('solo i task che avevano qualcuno, solo tra i membri del progetto, solo le coppie che mancano', () => {
    expect(coppie).not.toContain('t2')
    expect(coppie).toContain('from public.pm_membri m where m.progetto_id = t.progetto_id and m.profile_id = r.assegnatario_id')
    expect(coppie.endsWith('on conflict (task_id, profile_id) do nothing;')).toBe(true)
  })

  it('un backup recente ha già la tabella: nessuna riga in più', () => {
    const recente = sqlRipristino({
      ...backup,
      tabelle: {
        pm_task_assegnatari: [{ task_id: 't1', profile_id: 'u1' }],
        pm_task: [{ id: 't1', progetto_id: 'pr1', titolo: 'Montaggio' }],
      },
    })
    expect(recente.match(/insert into public\.pm_task_assegnatari/g)).toHaveLength(1)
    expect(recente).not.toContain('assegnatario_id')
    expect(recente.indexOf('insert into public.pm_task\n')).toBeLessThan(recente.indexOf('insert into public.pm_task_assegnatari\n'))
  })
})

describe('email del backup', () => {
  it('dice cosa c’è dentro e come si rimette', () => {
    const { oggetto, testo } = emailBackup(backup, 'backup-alpha-2026-09-28.json.gz')
    expect(oggetto).toBe('Backup settimanale Alpha Management · 28/09/2026')
    expect(testo).toContain('Vendite: 1')
    expect(testo).toContain('Rate e incassi: 1')
    expect(testo).toContain('npm run backup:sql -- backup-alpha-2026-09-28.json.gz ripristino.sql')
  })

  it('conteggi dal più grande', () => {
    expect(conteggi(backup)[0].righe).toBe(1)
    expect(conteggi(backup).at(-1)).toEqual({ tabella: 'expenses', righe: 0 })
  })
})
