/**
 * Uso pontual (22/09/2026): tira do "Link manual" quem JÁ tinha sido contatado
 * de verdade antes da queda da Z-API. Simula por padrão; grava com `--aplicar`.
 *
 * O Link manual é pra quem nunca recebeu nada nosso. A separação de hoje levou
 * pra lá também 42 pessoas que receberam mensagem entregue antes de 11/09
 * 19:36 e só não responderam — o que não entregou foi o follow-up depois.
 *
 *   mensagem da equipe entregue  → "Em follow up" (onde o time põe quem não respondeu)
 *   só a automática entregue     → "Contactado por IA"
 *
 * Quem respondeu alguma vez não está no Link manual (conferido: zero). Só
 * muda a etapa e registra no histórico. Nada é enviado.
 */
import pg from 'pg'

const APLICAR = process.argv.includes('--aplicar')
const ORG = '4bf15db2-4f23-463f-b970-1737dd75688d'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query('BEGIN')
try {
  const etapa = async (nome) => (await c.query(
    `SELECT id FROM pipeline_stages WHERE organization_id=$1 AND deleted_at IS NULL AND name=$2`, [ORG, nome])).rows[0].id
  const linkManual = await etapa('Link manual')
  const followUp = await etapa('Em follow up')
  const contactado = await etapa('Contactado por IA')

  const entregue = `x.metadata->>'direction'='outbound' AND coalesce(x.metadata->>'nao_entregue','false')<>'true' AND coalesce(x.metadata->>'send_status','')<>'failed'`
  const { rows } = await c.query(`
    SELECT l.id, l.title,
      count(*) FILTER (WHERE x.metadata->>'direction'='inbound') inb,
      count(*) FILTER (WHERE ${entregue} AND x.metadata->>'source'='human') equipe,
      count(*) FILTER (WHERE ${entregue} AND coalesce(x.metadata->>'source','')<>'human') auto
    FROM leads l LEFT JOIN lead_activities x ON x.lead_id=l.id
    WHERE l.organization_id=$1 AND l.deleted_at IS NULL AND l.stage_id=$2
    GROUP BY l.id, l.title`, [ORG, linkManual])

  const mover = rows.filter((r) => r.inb == 0 && (r.equipe > 0 || r.auto > 0))
  const respondeu = rows.filter((r) => r.inb > 0)
  if (respondeu.length) throw new Error(`há ${respondeu.length} no Link manual que responderam — revisar antes`)

  let nFollow = 0, nContactado = 0
  for (const r of mover) {
    const destino = r.equipe > 0 ? followUp : contactado
    destino === followUp ? nFollow++ : nContactado++
    await c.query(`UPDATE leads SET stage_id=$2, updated_at=now() WHERE id=$1 AND stage_id=$3`, [r.id, destino, linkManual])
    await c.query(`INSERT INTO lead_stage_history (organization_id, lead_id, from_stage_id, to_stage_id) VALUES ($1,$2,$3,$4)`, [ORG, r.id, linkManual, destino])
    console.log(`  ${r.title} → ${destino === followUp ? 'Em follow up' : 'Contactado por IA'} (equipe ${r.equipe}, automática ${r.auto})`)
  }
  const { rows: [{ n }] } = await c.query(`SELECT count(*) n FROM leads WHERE stage_id=$1 AND deleted_at IS NULL`, [linkManual])
  console.log(`\nEm follow up: ${nFollow} | Contactado por IA: ${nContactado} | ficam no Link manual: ${n}`)

  if (APLICAR) { await c.query('COMMIT'); console.log('GRAVADO.') }
  else { await c.query('ROLLBACK'); console.log('simulação — nada gravado.') }
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ERRO, nada gravado:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
