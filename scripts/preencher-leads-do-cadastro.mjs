/**
 * Uso pontual (22/09/2026): acerta os leads que ficaram para trás do próprio
 * cadastro. Simula por padrão; grava só com `--aplicar`.
 *
 *   node --env-file=.env.local scripts/preencher-leads-do-cadastro.mjs [--aplicar]
 *
 * Por quê: até 16/09 o reenvio da Agenda (quiz que avançou, formulário do fim)
 * atualizava só a linha do cadastro (lead_source_submissions), e o lead do CRM
 * ficava com o primeiro envio — "só se cadastrou", sem profissão, sem horários.
 * O filtro da aba Leads já contorna isso, mas o card do grupo, a etiqueta
 * dourada, as mensagens personalizadas e o funil leem o lead.
 *
 * 1) PREENCHE no lead os campos que estão vazios lá e existem no cadastro.
 *    Nunca sobrescreve valor que o lead já tem. A fase só avança (w1 → done).
 *    Grava em `preenchido_do_cadastro` quais chaves vieram daqui e quando.
 *
 * 2) POE NO PIPELINE ("Em aguardo") quem preencheu a Agenda ou o site mas já
 *    existia no CRM antes (lista antiga ou conversa do WhatsApp) e por isso
 *    ficou sem etapa. Só move: não dispara funil, não manda mensagem, não
 *    manda card no grupo.
 *
 * Tudo numa transação: ou entra inteiro ou nada.
 */
import pg from 'pg'

const APLICAR = process.argv.includes('--aplicar')
const ORG = '4bf15db2-4f23-463f-b970-1737dd75688d'

/**
 * Só o que é resposta da pessoa. Ficam de fora os blocos brutos da agenda
 * (a1, real, blocos) — a aba Leads lê direto do cadastro — e o lixo do
 * Elementor ("No Label tel", "Remote IP"...).
 */
const CHAVES = [
  'area', 'aumento', 'investimento',
  'objetivo_profissional', 'qualidade_vida', 'acompanhante',
  'sono', 'trabalho', 'deslocamento', 'reunioes', 'cafe', 'almoco', 'jantar',
  'treino', 'pessoas', 'procrastinacao', 'uid', 'criado_em', 'quiz_padrao',
]

const vazio = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query('BEGIN')

try {
  // ── 1. preencher ────────────────────────────────────────────────────────
  // Todos os cadastros de cada lead, do mais novo pro mais velho: o mais novo
  // ganha quando dois cadastros trazem a mesma chave.
  const { rows: cadastros } = await c.query(`
    SELECT s.lead_id, s.payload, s.updated_at, l.custom_attributes attrs
    FROM lead_source_submissions s JOIN leads l ON l.id = s.lead_id
    WHERE s.organization_id = $1 AND l.deleted_at IS NULL
    ORDER BY s.lead_id, s.updated_at DESC`, [ORG])

  const porLead = new Map()
  for (const cad of cadastros) {
    if (!porLead.has(cad.lead_id)) porLead.set(cad.lead_id, { attrs: cad.attrs || {}, novos: {} })
    const alvo = porLead.get(cad.lead_id)
    const p = cad.payload || {}
    for (const chave of CHAVES) {
      if (chave in alvo.novos) continue
      if (vazio(alvo.attrs[chave]) && !vazio(p[chave])) alvo.novos[chave] = p[chave]
    }
    // Fase: só avança. 'done' no cadastro vence 'w1' (ou nada) no lead.
    for (const chave of ['phase', 'fase']) {
      if (chave in alvo.novos) continue
      const noLead = alvo.attrs[chave]
      if (p[chave] === 'done' && (vazio(noLead) || noLead === 'w1')) alvo.novos[chave] = 'done'
    }
  }

  const aPreencher = [...porLead].filter(([, v]) => Object.keys(v.novos).length > 0)
  const contagem = {}
  for (const [, v] of aPreencher) for (const k of Object.keys(v.novos)) contagem[k] = (contagem[k] || 0) + 1
  console.log(`1) leads a preencher: ${aPreencher.length}`)
  console.log('   campos:', JSON.stringify(contagem))

  for (const [leadId, v] of aPreencher) {
    const marca = { em: new Date().toISOString(), chaves: Object.keys(v.novos) }
    await c.query(
      `UPDATE leads SET custom_attributes = coalesce(custom_attributes, '{}'::jsonb) || $2::jsonb || jsonb_build_object('preenchido_do_cadastro', $3::jsonb)
       WHERE id = $1`,
      [leadId, JSON.stringify(v.novos), JSON.stringify(marca)]
    )
  }

  // ── 2. pôr no Pipeline quem ficou sem etapa ─────────────────────────────
  const { rows: [emAguardo] } = await c.query(
    `SELECT id, name FROM pipeline_stages WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY rank LIMIT 1`, [ORG])

  const { rows: semEtapa } = await c.query(`
    SELECT DISTINCT ON (l.id) l.id, l.title, l.custom_attributes->>'lead_source' fonte, s.source, s.name
    FROM lead_source_submissions s JOIN leads l ON l.id = s.lead_id
    WHERE s.organization_id = $1 AND s.source IN ('agenda_ascensao', 'site_evento')
      AND l.deleted_at IS NULL AND l.stage_id IS NULL AND NOT coalesce(l.is_group, false)
    ORDER BY l.id, s.received_at ASC`, [ORG])

  console.log(`\n2) sem etapa, para "${emAguardo.name}": ${semEtapa.length}`)
  for (const l of semEtapa) {
    // Fonte: a do canal ao vivo por onde chegou, se o lead não tinha fonte ou
    // era da lista antiga. Nome: o do cadastro, se o do lead é só o número.
    const trocaFonte = !l.fonte || l.fonte === 'agenda_antigos'
    const trocaNome = !/\p{L}/u.test(l.title || '') && l.name
    const extra = {
      ...(trocaFonte ? { lead_source: l.source } : {}),
      ...(l.fonte === 'agenda_antigos' ? { fonte_anterior: 'agenda_antigos' } : {}),
    }
    console.log(`   ${trocaNome ? l.name + ' (era "' + l.title + '")' : l.title} — fonte ${l.fonte ?? 'nenhuma'} → ${trocaFonte ? l.source : l.fonte}`)
    await c.query(
      `UPDATE leads SET stage_id = $2, custom_attributes = coalesce(custom_attributes, '{}'::jsonb) || $3::jsonb,
         title = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE title END, updated_at = now()
       WHERE id = $1 AND stage_id IS NULL`,
      [l.id, emAguardo.id, JSON.stringify(extra), trocaNome ? l.name : null]
    )
    await c.query(
      `INSERT INTO lead_stage_history (organization_id, lead_id, from_stage_id, to_stage_id) VALUES ($1, $2, NULL, $3)`,
      [ORG, l.id, emAguardo.id]
    )
  }

  // ── conferência ─────────────────────────────────────────────────────────
  const { rows: [v] } = await c.query(`
    SELECT custom_attributes->>'phase' fase, custom_attributes->>'area' area, custom_attributes->>'procrastinacao' proc
    FROM leads WHERE title = 'Vanessa Handa' AND organization_id = $1`, [ORG])
  console.log('\nconferência — Vanessa:', JSON.stringify(v))

  if (APLICAR) {
    await c.query('COMMIT')
    console.log('\nGRAVADO.')
  } else {
    await c.query('ROLLBACK')
    console.log('\nsimulação — nada gravado. Rode com --aplicar para gravar.')
  }
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ERRO, nada gravado:', err)
  process.exitCode = 1
} finally {
  await c.end()
}
