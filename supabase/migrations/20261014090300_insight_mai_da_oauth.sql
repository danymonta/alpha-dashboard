-- The Insight (1.35.0) next to Claude connected through the MCP server (1.34.0,
-- 20261010090000_mcp_oauth.sql, CLAUDE.md sections 28 and 29). An OAuth token
-- of Claude reaches only the content calendar: every table this release
-- created gets the restrictive <table>_mai_da_oauth policy, with the same
-- expression as the MCP migration, so a token of Claude never reads nor writes
-- a recap, a chat, a profile, an AI block or card, a Fatto switch, a run, the
-- automation, the Messenger Page and its exclusions, or the leads per post and
-- their counted days, whatever its owner sees in the app. vede_marketing()
-- stays true for an admin, editor or marketing token, so for
-- instagram_contenuti_dm and instagram_contenuti_dm_giorni this policy is what
-- keeps the counts from Claude. Web sessions, the service role, the cron, the
-- seed and the import (no client_id) work as before.
--
-- The definer functions of this release that authenticated may call
-- (insight_stato, insight_imposta_automazione, insight_richiedi,
-- insight_ruota_chiave, insight_chat_messenger, insight_dimentica,
-- messenger_imposta_token, messenger_togli_token, messenger_token_presente)
-- need no change: each checks is_admin() or insight_puo_leggere() first, both
-- false for an OAuth token (current_role() is null for it), and answers 42501;
-- none acts on auth.uid() before that check. They are listed in
-- supabase/tests/00_schema.sql and tried in 75_mcp_oauth.sql.
do $$
declare
  t text;
begin
  foreach t in array array[
    'insight_impostazioni', 'insight_esecuzioni', 'insight_chat', 'insight_profili', 'insight_blocchi',
    'insight_schede', 'insight_recap', 'insight_fatto', 'messenger_collegamento', 'messenger_esclusi',
    'instagram_contenuti_dm', 'instagram_contenuti_dm_giorni'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()))',
      t || '_mai_da_oauth', t);
  end loop;
end $$;
