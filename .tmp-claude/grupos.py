# -*- coding: utf-8 -*-
import io

# ── entrada: grupo vira conversa de chat, com autor identificado ────────────
p = 'src/lib/zapiInbound.ts'
s = io.open(p, encoding='utf-8').read()

old = u"""  const messageId: string | undefined = body?.messageId
  const phoneBruto: string = String(body?.phone || '')
  // Grava sempre com o nono dígito e procura pelas duas formas: o JID do
  // WhatsApp pode vir sem o 9 (ver telefoneVariantes) e, sem isso, a mesma
  // pessoa vira um lead e uma conversa separados.
  const variantes = telefoneVariantes(phoneBruto)
  const phone = telefoneCanonico(phoneBruto) || phoneBruto.replace(/\\D/g, '')
  if (!phone) return { status: 'skipped', reason: 'sem telefone' }

  // Mesma política da Evolution: grupo não vira conversa no CRM. Uma mensagem de
  // grupo mistura várias pessoas num "contato" só, com risco real de dado de um
  // cliente aparecer na conversa de outro.
  if (body?.isGroup) return { status: 'skipped', reason: 'grupo' }"""
new = u"""  const messageId: string | undefined = body?.messageId
  const phoneBruto: string = String(body?.phone || '')
  const ehGrupo = !!body?.isGroup

  /*
   * Grupo é conversa, nunca lead.
   *
   * O identificador do grupo ("1203...-group") entra no lugar do telefone: é o
   * que a Z-API manda em `phone` e é o mesmo valor que ela aceita pra responder.
   * Não passa por telefoneVariantes — não é celular e inventar variante dele
   * daria um destinatário que não existe.
   *
   * A conversa de grupo nasce e continua FORA do funil (sem etapa, ver mais
   * abaixo): num grupo escrevem várias pessoas, e tratar isso como "um lead"
   * misturaria gente diferente num card só. O autor de cada mensagem fica em
   * `sender_name`/`participant_phone`, que é o que permite ler a conversa
   * sabendo quem falou.
   */
  const variantes = ehGrupo ? [phoneBruto] : telefoneVariantes(phoneBruto)
  const phone = ehGrupo
    ? phoneBruto
    : (telefoneCanonico(phoneBruto) || phoneBruto.replace(/\\D/g, ''))
  if (!phone) return { status: 'skipped', reason: 'sem telefone' }"""
assert old in s
s = s.replace(old, new, 1)

# criação do lead: marca grupo e não dá etapa pra ele
old = u"""    const [firstStage] = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.organizationId, orgId), isNull(pipelineStages.deletedAt)))
      .orderBy(asc(pipelineStages.rank))
      .limit(1)

    try {
      const [novo] = await db
        .insert(leads)
        .values({
          organizationId: orgId,
          // Em fromMe o senderName é o dono do WhatsApp, não o contato — aí o
          // telefone é o único nome honesto que temos.
          title: isFromMe ? phone : (senderName || phone),
          phone,
          integrationId: integration?.id || null,
          stageId: firstStage?.id || null,
          lastActivityAt: new Date(),
        })"""
new = u"""    const [firstStage] = ehGrupo
      ? [undefined]
      : await db
          .select({ id: pipelineStages.id })
          .from(pipelineStages)
          .where(and(eq(pipelineStages.organizationId, orgId), isNull(pipelineStages.deletedAt)))
          .orderBy(asc(pipelineStages.rank))
          .limit(1)

    try {
      const [novo] = await db
        .insert(leads)
        .values({
          organizationId: orgId,
          // Grupo se chama pelo nome do grupo. Em fromMe o senderName é o dono do
          // WhatsApp, não o contato — aí o telefone é o único nome honesto.
          title: ehGrupo
            ? (body?.chatName || phone)
            : (isFromMe ? phone : (senderName || phone)),
          phone,
          isGroup: ehGrupo,
          integrationId: integration?.id || null,
          stageId: firstStage?.id || null,
          lastActivityAt: new Date(),
        })"""
assert old in s
s = s.replace(old, new, 1)

# metadata: quem escreveu no grupo
old = u"""  if (!isFromMe) metadata.sender_name = senderName"""
new = u"""  if (ehGrupo) {
    metadata.is_group = true
    // Sem isto a conversa de grupo vira um monte de mensagem sem dono e não dá
    // pra saber quem disse o quê.
    if (body?.participantPhone) metadata.participant_phone = String(body.participantPhone)
  }
  if (!isFromMe) metadata.sender_name = senderName"""
assert old in s
s = s.replace(old, new, 1)

# não mexer em etapa de grupo quando o time responde
old = u"""  } else if (lead.stageId) {"""
new = u"""  } else if (lead.stageId && !ehGrupo) {"""
assert old in s
s = s.replace(old, new, 1)

# o webhook de saída já recebia isGroup fixo em false
old = u"""    fromMe: isFromMe,
    isGroup: false,
    chatLid: null,"""
new = u"""    fromMe: isFromMe,
    isGroup: ehGrupo,
    chatLid: null,"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('inbound ok')

# ── adapter passa a aceitar grupo ───────────────────────────────────────────
p = 'src/lib/channels/zapi.ts'
s = io.open(p, encoding='utf-8').read()
old = u"""/**
 * Z-API como canal do CRM.
 *
 * `supportsGroups: false` de propósito: a entrada (zapiInbound) descarta mensagem
 * de grupo, então não existe conversa de grupo vinda daqui pra responder. Marcar
 * true faria o CRM aceitar um envio que não tem destinatário do outro lado.
 */
export const zapiAdapter: ChannelAdapter = {
  metadataIdKey: 'zapi_message_id',
  supportsGroups: false,"""
new = u"""/**
 * Z-API como canal do CRM.
 *
 * `supportsGroups: true`: a Z-API endereça grupo pelo mesmo campo `phone`,
 * usando o id do grupo ("1203...-group") no lugar do número — que é exatamente
 * o valor que a entrada guarda em `leads.phone` pra conversa de grupo. Então
 * responder um grupo é o mesmo caminho de responder uma pessoa.
 */
export const zapiAdapter: ChannelAdapter = {
  metadataIdKey: 'zapi_message_id',
  supportsGroups: true,"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('adapter ok')

# ── importação: traz os grupos também ───────────────────────────────────────
p = 'src/app/api/integrations/zapi/chats/route.ts'
s = io.open(p, encoding='utf-8').read()
old = u""" * Não sobrescreve lead que já existe (o nome no CRM costuma ser melhor que o
 * nome da agenda do celular) e nunca importa grupo, pela mesma razão da entrada
 * de mensagens: grupo mistura várias pessoas num contato só.
 */"""
new = u""" * Não sobrescreve lead que já existe: o nome no CRM costuma ser melhor que o
 * nome da agenda do celular.
 *
 * Grupo entra também, pelo id dele ("1203...-group") no lugar do telefone e
 * marcado com `is_group`. Como toda conversa importada, fica sem etapa — o que
 * importa aqui é o grupo nunca virar card de funil, já que num grupo escrevem
 * várias pessoas e o card seria de quem, afinal?
 */"""
assert old in s
s = s.replace(old, new, 1)

old = u"""      for (const conversa of conversas) {
        if (conversa.isGroup) {
          grupos++
          continue
        }
        const phone = normalizePhone(conversa.phone)
        if (!phone) continue"""
new = u"""      for (const conversa of conversas) {
        // Grupo é endereçado pelo id, não por telefone — normalizePhone o
        // destruiria (ele só entende dígitos).
        const phone = conversa.isGroup
          ? String(conversa.phone || '').trim()
          : normalizePhone(conversa.phone)
        if (!phone) continue
        if (conversa.isGroup) grupos++"""
assert old in s
s = s.replace(old, new, 1)

old = u"""            title: (conversa.name || '').trim() || phone,
            phone,
            integrationId: integration.id,"""
new = u"""            title: (conversa.name || '').trim() || phone,
            phone,
            isGroup: !!conversa.isGroup,
            integrationId: integration.id,"""
assert old in s
s = s.replace(old, new, 1)

s = s.replace(u"      grupos_ignorados: grupos,", u"      grupos: grupos,", 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('import ok')
