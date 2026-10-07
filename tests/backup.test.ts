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
    // the accounts, then one call per table with rows: on conflict do nothing inside the function
    expect(sql.match(/on conflict \(id\) do nothing;/g)).toHaveLength(1)
    expect(sql.match(/select pg_temp\.alpha_ripristina\(/g)).toHaveLength(4)
    expect(sql).toContain('on conflict do nothing')
  })

  it('solo le colonne del backup: una colonna nuova prende il suo default, una generata non si scrive', () => {
    const funzione = sql.slice(sql.indexOf('create function pg_temp.alpha_ripristina'), sql.indexOf('$alpha_ripristina$;'))
    expect(funzione).toContain("a.attgenerated = ''")
    expect(funzione).toContain('jsonb_object_keys(r)')
    expect(funzione).toContain('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict do nothing')
    // a table dropped since: skipped, never the whole restore lost
    expect(funzione).toContain("to_regclass(format('public.%I', p_tabella)) is null")
    // before the first table, inside the transaction
    expect(sql.indexOf('create function pg_temp.alpha_ripristina')).toBeGreaterThan(sql.indexOf('begin;'))
    expect(sql.indexOf('create function pg_temp.alpha_ripristina')).toBeLessThan(sql.indexOf("alpha_ripristina('clients'"))
  })

  it('prima chi è puntato: clienti, poi vendite, poi rate; le tabelle nuove in fondo', () => {
    const pos = (t: string) => sql.indexOf(`select pg_temp.alpha_ripristina('${t}',`)
    expect(pos('clients')).toBeLessThan(pos('sales'))
    expect(pos('sales')).toBeLessThan(pos('payments'))
    expect(pos('payments')).toBeLessThan(pos('tabella_nuova'))
    expect(sql).not.toContain("alpha_ripristina('expenses'")
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
    expect(pos('insert into public.pm_task_assegnatari')).toBeGreaterThan(pos("alpha_ripristina('pm_task',"))
    expect(pos("alpha_ripristina('pm_task',")).toBeGreaterThan(pos("alpha_ripristina('pm_membri',"))
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
    expect(recente.match(/insert into public\.pm_task_assegnatari/g)).toBeNull()
    expect(recente.match(/alpha_ripristina\('pm_task_assegnatari',/g)).toHaveLength(1)
    expect(recente).not.toContain('assegnatario_id')
    expect(recente.indexOf("alpha_ripristina('pm_task',")).toBeLessThan(recente.indexOf("alpha_ripristina('pm_task_assegnatari',"))
  })
})

describe('ripristino di un backup di prima della call di follow-up (07/10/2026)', () => {
  // the Monday backup of 05/10/2026: calls without volte_spostata, di_follow_up and importata
  const vecchio: Backup = {
    ...backup,
    tabelle: {
      leads: [
        { id: 'l1', nome: 'Importato', note: 'Importato dal foglio delle call' },
        { id: 'l2', nome: 'Dall’app', note: null },
      ],
      calls: [
        { id: 'c1', lead_id: 'l1', tipo: 'discovery', created_by: null },
        { id: 'c2', lead_id: 'l2', tipo: 'strategy', created_by: null },
        { id: 'c3', lead_id: 'l2', tipo: 'discovery', created_by: null },
        { id: 'c4', lead_id: 'l2', tipo: 'discovery', created_by: 'u1' },
      ],
    },
  }
  const sql = sqlRipristino(vecchio)
  const righeCall = () => {
    const riga = sql.split('\n').find((r) => r.startsWith("select pg_temp.alpha_ripristina('calls',"))!
    return JSON.parse(riga.slice(riga.indexOf('$alpha_backup$') + 14, riga.lastIndexOf('$alpha_backup$'))) as Record<string, unknown>[]
  }

  it('le colonne che mancano non si nominano: prendono il loro default', () => {
    const call = righeCall()
    expect(call.every((c) => !('volte_spostata' in c) && !('di_follow_up' in c))).toBe(true)
  })

  it('le call importate restano importate, come le ha segnate la migration', () => {
    expect(Object.fromEntries(righeCall().map((c) => [c.id, c.importata]))).toEqual({ c1: true, c2: true, c3: false, c4: false })
  })

  it('un backup nuovo tiene il segno com’è', () => {
    const recente = sqlRipristino({
      ...backup,
      tabelle: { calls: [{ id: 'c1', tipo: 'strategy', created_by: null, importata: false }] },
    })
    expect(recente).toContain('"importata":false')
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
