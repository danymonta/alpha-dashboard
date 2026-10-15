import 'server-only'

/**
 * The ICP of Percorso Alpha (Dany, 10/10/2026) in the Insight's prompt
 * (1.35.0, D24): right after the setter's instructions, it decides who is in
 * target, the words and pains of the suggested messages and the content part,
 * while the flow and every rule on messages stay with the setter's
 * instructions.
 *
 * One text since the merge with the MCP server (1.34.0): lib/marketing/icp.ts
 * (`ICP`, the anonymous version, without prices or payment terms), the same
 * one Claude connected to the content calendar reads with the icp tool. This
 * file only re-exports it under the Insight's name, so the prompt and its
 * tests import it from here and nothing copies it. A change of the ICP is a
 * change of lib/marketing/icp.ts, and of VERSIONE_PROMPT
 * (lib/insight/prompt/index.ts). Prices never reach a suggested message
 * anyway (lib/insight/controllo-finale.ts).
 */
export { ICP as ICP_PERCORSO_ALPHA } from '@/lib/marketing/icp'
