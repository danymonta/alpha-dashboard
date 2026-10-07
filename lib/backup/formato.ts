/**
 * The backup file (lib/backup/crea.ts) and the SQL that restores it
 * (scripts/backup-in-sql.ts). Pure: tested in tests/backup.test.ts.
 */
export type Backup = {
  formato: 1
  creato_il: string
  /** table name -> its rows, as Postgres serialised them (to_jsonb) */
  tabelle: Record<string, Record<string, unknown>[]>
  utenti: { id: string; email: string | null; user_metadata: Record<string, unknown>; created_at: string }[]
}

/** Rows per table, largest first: the summary in the email. */
export function conteggi(backup: Backup): { tabella: string; righe: number }[] {
  return Object.entries(backup.tabelle)
    .map(([tabella, righe]) => ({ tabella, righe: righe.length }))
    .sort((a, b) => b.righe - a.righe || a.tabella.localeCompare(b.tabella))
}

// Restore order: whoever is pointed at comes first (with triggers off it is
// not strictly needed, but it reads right and helps a partial restore).
const ORDINE = [
  'profiles',
  'invites',
  'products',
  'commission_rules',
  'commission_payouts',
  'leads',
  'calls',
  'call_pitch',
  'clients',
  'sales',
  'payments',
  'expenses',
  'setter_daily_reports',
  'pm_reparti',
  'pm_modelli',
  'pm_modelli_voci',
  'pm_progetti',
  'pm_membri',
  'pm_tasklist',
  'pm_task',
  'pm_task_assegnatari',
  'pm_tempo',
  'pm_note',
  'audit_log',
]

const TAG = '$alpha_backup$'

function nomeSicuro(nome: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(nome)) throw new Error(`Nome di tabella non valido: ${nome}`)
  return nome
}

function letterale(valore: unknown): string {
  const json = JSON.stringify(valore)
  if (json.includes(TAG)) throw new Error('Il backup contiene la sequenza usata per le stringhe SQL')
  return `${TAG}${json}${TAG}`
}

/**
 * Backups taken before 29/09/2026 keep a task's one assignee in
 * pm_task.assegnatario_id, a column that is gone: jsonb_populate_recordset
 * skips it, so the pairs go into pm_task_assegnatari here, as the migration
 * did (only for members of the task's project, only the missing ones).
 */
function sqlAssegnatariVecchi(task: Record<string, unknown>[]): string | null {
  const coppie = task
    .filter((t) => typeof t.assegnatario_id === 'string' && t.assegnatario_id)
    .map((t) => ({ id: t.id, assegnatario_id: t.assegnatario_id, updated_at: t.updated_at ?? null }))
  if (coppie.length === 0) return null
  return [
    '-- tasks from before 29/09/2026: their one assignee was a column of pm_task',
    'insert into public.pm_task_assegnatari (task_id, profile_id, created_at)',
    'select t.id, r.assegnatario_id, coalesce(r.updated_at, now())',
    `from jsonb_to_recordset(${letterale(coppie)}::jsonb)`,
    '  as r(id uuid, assegnatario_id uuid, updated_at timestamptz)',
    'join public.pm_task t on t.id = r.id',
    'where exists (',
    '  select 1 from public.pm_membri m where m.progetto_id = t.progetto_id and m.profile_id = r.assegnatario_id',
    ')',
    'on conflict (task_id, profile_id) do nothing;',
  ].join('\n')
}

/**
 * Backups taken before 07/10/2026 have no calls.importata: the calls imported
 * from Dany's call sheet were then the ones without author, as the migration
 * marked them (20261007120000: no author, and the import's lead or its
 * strategy type). Here the same rule, so a restored imported call never asks
 * for its sale; the column's default (false) would. Only the rows without the key.
 */
function chiamateVecchie(calls: Record<string, unknown>[], leadImportati: Set<unknown>): Record<string, unknown>[] {
  return calls.map((c) =>
    'importata' in c
      ? c
      : { ...c, importata: c.created_by == null && (c.tipo === 'strategy' || leadImportati.has(c.lead_id)) },
  )
}

/** The leads the call sheet import created (scripts/import-prospect.ts). */
const NOTA_IMPORT_CALL = 'Importato dal foglio delle call'

/**
 * Inserts the rows of one table, in the restore's transaction. Only the
 * columns the backup has and the table has now (never a generated one): a
 * column added since takes its default (a NOT NULL with a default included,
 * such as calls.volte_spostata or calls.di_follow_up), a column dropped since
 * is skipped, and so is a table dropped since. jsonb_populate_recordset alone
 * would give the new columns an explicit NULL (refused by NOT NULL before any
 * conflict is looked for), and the generated ones a value Postgres refuses
 * (setter_daily_reports.dm_totali).
 */
const FUNZIONE_RIPRISTINA = `create function pg_temp.alpha_ripristina(p_tabella text, p_righe jsonb)
returns void
language plpgsql
as $alpha_ripristina$
declare
  v_colonne text;
begin
  -- a table dropped since the backup: nothing to put back
  if to_regclass(format('public.%I', p_tabella)) is null then
    raise notice 'Tabella % non più presente: saltata', p_tabella;
    return;
  end if;
  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_colonne
  from pg_attribute a
  where a.attrelid = format('public.%I', p_tabella)::regclass
    and a.attnum > 0
    and not a.attisdropped
    and a.attgenerated = ''
    and a.attname in (select k from jsonb_array_elements(p_righe) r, jsonb_object_keys(r) k);
  if v_colonne is null then
    return;
  end if;
  execute format(
    'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict do nothing',
    p_tabella, v_colonne
  ) using p_righe;
end;
$alpha_ripristina$;`

/**
 * SQL that puts the backup back: only the missing rows (on conflict do
 * nothing), triggers off (session_replication_role = replica) so that no plan
 * is generated twice and no audit row is written, all in one transaction.
 * Every table through pg_temp.alpha_ripristina, so a backup older than a
 * column still goes back. Run it in the Supabase SQL editor or with psql.
 */
export function sqlRipristino(backup: Backup): string {
  if (backup.formato !== 1) throw new Error(`Formato di backup sconosciuto: ${String(backup.formato)}`)
  const tabelle = Object.keys(backup.tabelle).map(nomeSicuro)
  const ordinate = [...ORDINE.filter((t) => tabelle.includes(t)), ...tabelle.filter((t) => !ORDINE.includes(t)).sort()]

  const righe = [
    `-- Ripristino del backup Alpha Management del ${backup.creato_il}`,
    '-- Inserisce solo le righe che mancano: quelle presenti restano come sono.',
    'begin;',
    'set local session_replication_role = replica;',
    '',
    '-- accounts: people sign in with Google as before',
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, coalesce(u.user_metadata, '{}'::jsonb),
  u.created_at, u.created_at, u.created_at, '', '', '', ''
from jsonb_to_recordset(${letterale(backup.utenti)}::jsonb)
  as u(id uuid, email text, user_metadata jsonb, created_at timestamptz)
on conflict (id) do nothing;`,
    '',
    '-- every table: only the columns the backup has (a column added since takes its default)',
    FUNZIONE_RIPRISTINA,
  ]
  const leadImportati = new Set(
    (backup.tabelle.leads ?? []).filter((l) => l.note === NOTA_IMPORT_CALL).map((l) => l.id),
  )
  for (const tabella of ordinate) {
    const grezzi = backup.tabelle[tabella]
    if (!grezzi?.length) continue
    const dati = tabella === 'calls' ? chiamateVecchie(grezzi, leadImportati) : grezzi
    righe.push('', `select pg_temp.alpha_ripristina('${tabella}', ${letterale(dati)}::jsonb);`)
    const vecchi = tabella === 'pm_task' ? sqlAssegnatariVecchi(dati) : null
    if (vecchi) righe.push('', vecchi)
  }
  righe.push('', 'commit;', '')
  return righe.join('\n')
}
