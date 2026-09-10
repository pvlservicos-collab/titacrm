/**
 * Importa as conversas da Z-API — mesma lógica de
 * src/app/api/integrations/zapi/chats/route.ts, rodada daqui porque aquela rota
 * exige sessão de navegador.
 */
import { build } from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'

const out = path.resolve('.tmp-claude/bimp.mjs')
await build({
  entryPoints: ['src/lib/zapi.ts', 'src/lib/leadSources.ts'],
  bundle: true, format: 'esm', platform: 'node', outdir: path.resolve('.tmp-claude'),
  alias: { '@': path.resolve('src') }, external: ['pg', '@vercel/blob'], logLevel: 'error',
})
const { fetchZapiChats } = await import(pathToFileURL(path.resolve('.tmp-claude/zapi.js')).href)
const { normalizePhone } = await import(pathToFileURL(path.resolve('.tmp-claude/leadSources.js')).href)

const ORG = '4bf15db2-4f23-463f-b970-1737dd75688d'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const q = (s, p) => pool.query(s, p).then(r => r.rows)

const [integ] = await q(`select id from integrations where organization_id=$1 and type='whatsapp_zapi' and deleted_at is null`, [ORG])

let criados = 0, existentes = 0, grupos = 0, semTelefone = 0, pagina = 1
for (let volta = 0; volta < 60; volta++) {
  const conversas = await fetchZapiChats(ORG, pagina, 50)
  if (conversas.length === 0) break

  for (const c of conversas) {
    if (c.isGroup) { grupos++; continue }
    const phone = normalizePhone(c.phone)
    if (!phone) { semTelefone++; continue }

    const [existe] = await q(`select id from leads where organization_id=$1 and phone=$2 and deleted_at is null`, [ORG, phone])
    if (existe) { existentes++; continue }

    const quando = Number(c.lastMessageTime)
    try {
      await q(
        `insert into leads (organization_id, title, phone, integration_id, stage_id, last_activity_at, custom_attributes)
         values ($1,$2,$3,$4,null,$5,$6)`,
        [ORG, (c.name || '').trim() || phone, phone, integ.id,
         Number.isFinite(quando) && quando > 0 ? new Date(quando) : null,
         JSON.stringify({ origem: 'conversa_whatsapp' })]
      )
      criados++
    } catch (e) {
      if (e.code === '23505') existentes++
      else throw e
    }
  }

  if (conversas.length < 50) break
  pagina++
}

console.log({ criados, ja_existiam: existentes, grupos_ignorados: grupos, sem_telefone: semTelefone })
console.log('\nconversas no chat (sem etapa, fora do Kanban):',
  (await q(`select count(*)::int t from leads where organization_id=$1 and deleted_at is null and stage_id is null`, [ORG]))[0].t)
console.log('leads no funil (com etapa):',
  (await q(`select count(*)::int t from leads where organization_id=$1 and deleted_at is null and stage_id is not null`, [ORG]))[0].t)
await pool.end()
