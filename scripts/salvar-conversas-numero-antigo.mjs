/**
 * Guarda na lista "Número antigo" (aba Leads) as conversas do número que estava
 * na Z-API, antes da troca pela API Oficial.
 *
 *   node --env-file=.env.local scripts/salvar-conversas-numero-antigo.mjs [--aplicar]
 *
 * Por quê: trocar o número deixa essas conversas sem dono — elas continuam no
 * chat, mas ninguém pode mais responder por elas, porque o número que falou com
 * aquelas pessoas não existe mais. A lista fica com o telefone, o resumo e o
 * texto inteiro do que foi dito, então o histórico não depende de uma conversa
 * que já não dá pra continuar.
 *
 * Simula por padrão; grava só com `--aplicar`. Rodar de novo atualiza as linhas
 * (dedupe por telefone), então dá pra rodar antes e depois da troca.
 *
 * Nada é apagado e nada é enviado: só escreve em lead_source_submissions.
 */
import pg from 'pg'

const APLICAR = process.argv.includes('--aplicar')
const ORG = '4bf15db2-4f23-463f-b970-1737dd75688d'
const FONTE = 'numero_antigo'
/** Teto por conversa: a maior aqui tem 62 mensagens; 500 é folga, não corte. */
const MAX_MENSAGENS = 500

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query('BEGIN')

try {
  const { rows: [zapi] } = await c.query(
    `SELECT id FROM integrations WHERE organization_id = $1 AND type = 'whatsapp_zapi' AND deleted_at IS NULL`,
    [ORG]
  )

  /*
   * Quem conversou pelo número da Z-API: a mensagem diz o canal (`channel`) ou
   * veio pelo webhook dele (`source = zapi`); o lead ligado à integração cobre
   * quem só recebeu. Grupo fica de fora: grupo não tem número pra guardar em
   * lista de contatos, e continua no chat do mesmo jeito.
   */
  const { rows: conversas } = await c.query(`
    SELECT
      l.id,
      l.title,
      l.phone,
      l.email,
      coalesce(l.custom_attributes->>'instagram_username', '') AS instagram,
      max(a.created_at) AS ultima_conversa
    FROM leads l
    JOIN lead_activities a ON a.lead_id = l.id
    WHERE l.organization_id = $1
      AND l.deleted_at IS NULL
      AND NOT coalesce(l.is_group, false)
      AND a.type = 'whatsapp'
      AND (a.metadata->>'channel' = 'whatsapp_zapi' OR a.metadata->>'source' = 'zapi' OR l.integration_id = $2)
    GROUP BY l.id, l.title, l.phone, l.email, l.custom_attributes
    ORDER BY max(a.created_at) DESC`, [ORG, zapi?.id ?? null])
  // As contagens saem da conversa guardada, logo abaixo, e não desta consulta:
  // aqui o filtro é "quem falou pelo número da Z-API", e a conversa guardada é a
  // da pessoa inteira. Contar em lugares diferentes fazia a coluna "Mensagens"
  // discordar do texto guardado (811 contra 928, medido em 24/09).

  console.log(`conversas encontradas: ${conversas.length}`)

  let gravadas = 0
  let mensagensGuardadas = 0
  let semTelefone = 0

  for (const conv of conversas) {
    // Sem telefone não há o que guardar numa lista de números (é o caso de lead
    // que só existiu como conversa importada sem número). A conversa continua no
    // chat do mesmo jeito.
    if (!conv.phone) { semTelefone++; continue }
    const { rows: msgs } = await c.query(`
      SELECT a.created_at, a.content, a.metadata
      FROM lead_activities a
      WHERE a.lead_id = $1 AND a.type = 'whatsapp'
      ORDER BY a.created_at
      LIMIT $2`, [conv.id, MAX_MENSAGENS])

    const conversa = msgs.map((m) => {
      const meta = m.metadata || {}
      const entrando = meta.direction === 'inbound'
      return {
        em: m.created_at.toISOString(),
        // 'lead' | 'equipe' | 'automacao' — quem escreveu, do jeito que a tela lê.
        quem: entrando ? 'lead' : meta.automated || meta.source === 'funnel' ? 'automacao' : 'equipe',
        texto: m.content || (meta.media_type ? `[${meta.media_type}]` : ''),
        ...(meta.nao_entregue ? { nao_entregue: true } : {}),
      }
    })
    const ultima = conversa[conversa.length - 1]
    const primeira = conversa[0]

    const payload = {
      origem: 'numero_antigo_zapi',
      mensagens: conversa.length,
      deles: conversa.filter((m) => m.quem === 'lead').length,
      nossas: conversa.filter((m) => m.quem !== 'lead').length,
      nao_entregues: conversa.filter((m) => m.nao_entregue).length,
      primeira_em: primeira?.em ?? null,
      ultima_em: ultima?.em ?? null,
      ultima_mensagem: (ultima?.texto || '').slice(0, 300),
      ultimo_quem: ultima ? (ultima.quem === 'lead' ? 'Lead' : ultima.quem === 'automacao' ? 'Automação' : 'Equipe') : null,
      conversa,
    }
    mensagensGuardadas += conversa.length

    // Dedupe pelo telefone (external_id): rodar de novo atualiza a linha em vez
    // de criar outra.
    await c.query(`
      INSERT INTO lead_source_submissions
        (organization_id, source, external_id, name, email, phone, instagram, payload, lead_id, received_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, now())
      -- O índice único é PARCIAL (só quando external_id não é nulo), e o
      -- ON CONFLICT precisa repetir a condição — senão o Postgres não acha o
      -- índice e recusa a instrução inteira.
      ON CONFLICT (organization_id, source, external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET name = excluded.name, email = excluded.email, phone = excluded.phone,
                    instagram = excluded.instagram, payload = excluded.payload,
                    lead_id = excluded.lead_id, updated_at = now()`,
      [
        ORG, FONTE, conv.phone, conv.title || 'Sem nome', conv.email, conv.phone,
        conv.instagram || null, JSON.stringify(payload), conv.id, primeira?.em ?? new Date(),
      ]
    )
    gravadas++
  }

  console.log(`linhas na lista: ${gravadas} · mensagens guardadas: ${mensagensGuardadas}`)
  if (semTelefone) console.log(`sem telefone, fora da lista: ${semTelefone}`)
  const { rows: [conta] } = await c.query(
    `SELECT count(*)::int total FROM lead_source_submissions WHERE organization_id = $1 AND source = $2`, [ORG, FONTE]
  )
  console.log(`total na lista "Número antigo": ${conta.total}`)

  if (APLICAR) {
    await c.query('COMMIT')
    console.log('GRAVADO.')
  } else {
    await c.query('ROLLBACK')
    console.log('simulação — nada gravado. Rode com --aplicar para gravar.')
  }
} catch (err) {
  await c.query('ROLLBACK')
  console.error('ERRO, nada gravado:', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
