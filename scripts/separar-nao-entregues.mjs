/**
 * Separa quem NÃO recebeu mensagem enquanto a instância esteve fora do ar.
 *
 *   node --env-file=.env.local scripts/separar-nao-entregues.mjs           (ensaio)
 *   node --env-file=.env.local scripts/separar-nao-entregues.mjs --aplicar (grava)
 *
 * CONTEXTO
 * --------
 * A Z-API caiu e o CRM continuou "enviando": até 17/09 ela ACEITAVA as
 * mensagens (devolvia id) e depois passou a recusar ("Enqueue message is
 * disabled for this instance when whatsapp is disconnected"). O sinal de que a
 * entrega parou é outro, e é inequívoco: nenhuma mensagem RECEBIDA desde
 * 11/09 19:36 — nem de pessoas, nem do grupo, que tinha movimento diário.
 *
 * Então o corte é esse instante. Tudo que saiu depois dele é tratado como não
 * entregue: o lead vai pra etapa "Link manual" (contato manual por link do
 * WhatsApp) e a conversa some do chat, como se o CRM nunca tivesse falado com
 * essa pessoa — porque, de fato, não falou.
 *
 * O QUE ESTE SCRIPT NÃO FAZ
 * -------------------------
 * Não apaga nada. As mensagens continuam no banco, marcadas com
 * `nao_entregue`, e o app é que deixa de mostrá-las. O estado anterior de cada
 * lead (última mensagem, etapa) fica guardado em `custom_attributes.backup_fila`,
 * então dá pra desfazer se o diagnóstico estiver errado.
 */
import pg from 'pg'

const ORG = '4bf15db2-4f23-463f-b970-1737dd75688d'
const ETAPA_LINK_MANUAL = '6d286d2d-731e-4e8b-b23a-e20ece9040b6'
/** Última mensagem recebida de alguém. Daqui pra frente, sem sinal de entrega. */
const CORTE = '2026-09-11T22:36:07Z'
/** Quem está além do atendimento inicial não é mexido: já tem conversa real. */
const ETAPAS_AVANCADAS = [
  'fb3d09ff-d884-488d-be32-4890e3e7bc12', // Call com SDR
  '7a75a267-2fc7-41b6-acdb-cafd06cd524d', // Call com Augusto
  'cdf40fea-dd1b-47d2-b678-22f00ca20b9e', // Comprou produto
]

const aplicar = process.argv.includes('--aplicar')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query('BEGIN')

try {
  // ── quem foi atingido ─────────────────────────────────────────────────────
  const { rows: leads } = await c.query(
    `SELECT l.id, l.title, l.phone, l.stage_id, l.is_group,
            l.last_message_content, l.last_message_sender_type, l.last_activity_type, l.last_activity_at,
            count(a.id)::int AS mensagens_na_janela,
            (SELECT count(*)::int FROM lead_activities b
              WHERE b.lead_id = l.id AND b.created_at <= $2::timestamptz
                AND b.metadata->>'direction' = 'outbound') AS contato_antes,
            (SELECT count(*)::int FROM lead_activities b
              WHERE b.lead_id = l.id AND b.metadata->>'direction' = 'inbound') AS ja_respondeu_alguma_vez
     FROM leads l
     JOIN lead_activities a ON a.lead_id = l.id
     WHERE l.organization_id = $1
       AND l.deleted_at IS NULL
       AND coalesce(l.is_group, false) = false
       AND a.metadata->>'direction' = 'outbound'
       AND a.created_at > $2::timestamptz
     GROUP BY l.id
     ORDER BY l.title`,
    [ORG, CORTE]
  )

  const avancados = leads.filter((l) => ETAPAS_AVANCADAS.includes(l.stage_id))
  const alvos = leads.filter((l) => !ETAPAS_AVANCADAS.includes(l.stage_id))
  const semContatoReal = alvos.filter((l) => l.contato_antes === 0)
  const comContatoAntes = alvos.filter((l) => l.contato_antes > 0)

  console.log('CORTE:', CORTE, '(última mensagem recebida de alguém)')
  console.log('\nLEADS ATINGIDOS:', leads.length)
  console.log('   vão para "Link manual":', alvos.length)
  console.log('      sem nenhum contato entregue antes (conversa some inteira):', semContatoReal.length)
  console.log('      com conversa real anterior (só as mensagens da janela somem):', comContatoAntes.length)
  console.log('   ficam como estão (já em call/compra):', avancados.length)
  if (avancados.length) console.log('     ', avancados.map((l) => l.title).join(', '))

  const { rows: [msgs] } = await c.query(
    `SELECT count(*)::int total,
            count(*) FILTER (WHERE metadata->>'send_status' = 'failed')::int ja_falhas,
            count(*) FILTER (WHERE coalesce(metadata->>'automated','') = 'true')::int automaticas
     FROM lead_activities
     WHERE organization_id = $1 AND metadata->>'direction' = 'outbound' AND created_at > $2::timestamptz`,
    [ORG, CORTE]
  )
  console.log('\nMENSAGENS NA JANELA:', msgs.total, '| automáticas:', msgs.automaticas,
    '| manuais:', msgs.total - msgs.automaticas, '| já marcadas como falha:', msgs.ja_falhas)

  console.log('\nAMOSTRA (10 primeiros que vão pro Link manual):')
  console.table(alvos.slice(0, 10).map((l) => ({
    lead: String(l.title).slice(0, 26),
    telefone: l.phone,
    msgs_janela: l.mensagens_na_janela,
    tinha_contato_antes: l.contato_antes > 0 ? 'sim' : 'não',
    ja_respondeu: l.ja_respondeu_alguma_vez > 0 ? 'sim' : 'não',
  })))

  if (!aplicar) {
    console.log('\n=== ENSAIO: nada foi gravado. Rode com --aplicar pra valer. ===')
    await c.query('ROLLBACK')
    await c.end()
    process.exit(0)
  }

  // ── 1. marca as mensagens da janela como não entregues ───────────────────
  const marcadas = await c.query(
    `UPDATE lead_activities
        SET metadata = metadata
              || jsonb_build_object(
                   'nao_entregue', true,
                   'motivo_nao_entrega', 'Instância da Z-API desconectada — sem sinal de entrega desde 11/09 19:36',
                   'send_status_anterior', metadata->>'send_status')
              || jsonb_build_object('send_status', 'failed')
      WHERE organization_id = $1
        AND metadata->>'direction' = 'outbound'
        AND created_at > $2::timestamptz
        AND coalesce((metadata->>'nao_entregue')::boolean, false) = false
      RETURNING id`,
    [ORG, CORTE]
  )
  console.log('\nmensagens marcadas como não entregues:', marcadas.rowCount)

  // ── 2. guarda o estado anterior de cada lead ─────────────────────────────
  const ids = alvos.map((l) => l.id)
  await c.query(
    `UPDATE leads
        SET custom_attributes = custom_attributes || jsonb_build_object('backup_fila', jsonb_build_object(
              'em', now(),
              'stage_id', stage_id,
              'last_message_content', last_message_content,
              'last_message_sender_type', last_message_sender_type,
              'last_activity_type', last_activity_type,
              'last_activity_at', last_activity_at))
      WHERE id = ANY($1::uuid[])`,
    [ids]
  )

  // ── 3. conversa some do chat ─────────────────────────────────────────────
  // Sem contato real antes: o lead volta a ser "nunca contatado".
  const semContato = semContatoReal.map((l) => l.id)
  if (semContato.length) {
    await c.query(
      `UPDATE leads SET last_message_content = NULL, last_message_sender_type = NULL,
                        last_activity_type = NULL, is_unread = false, updated_at = now()
        WHERE id = ANY($1::uuid[])`,
      [semContato]
    )
  }
  // Com conversa real antes: a prévia volta pra última mensagem que saiu de verdade.
  for (const lead of comContatoAntes) {
    await c.query(
      `UPDATE leads l
          SET last_message_content = u.content,
              last_message_sender_type = CASE WHEN u.metadata->>'direction' = 'inbound' THEN 'lead'
                                              WHEN coalesce(u.metadata->>'automated','') = 'true' THEN 'automated'
                                              ELSE 'human' END,
              last_activity_at = u.created_at,
              updated_at = now()
         FROM (SELECT content, metadata, created_at FROM lead_activities
                WHERE lead_id = $1 AND created_at <= $2::timestamptz
                ORDER BY created_at DESC LIMIT 1) u
        WHERE l.id = $1`,
      [lead.id, CORTE]
    )
  }

  // ── 4. todos vão pra etapa "Link manual" ─────────────────────────────────
  const movidos = await c.query(
    `UPDATE leads SET stage_id = $2, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id`,
    [ids, ETAPA_LINK_MANUAL]
  )
  console.log('leads movidos para "Link manual":', movidos.rowCount)

  await c.query('COMMIT')
  console.log('\n=== APLICADO ===')
} catch (err) {
  await c.query('ROLLBACK')
  console.error('nada foi gravado:', err.message)
  throw err
} finally {
  await c.end()
}
