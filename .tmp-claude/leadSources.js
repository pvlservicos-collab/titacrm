// src/lib/agenda.ts
var AGENDA_WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "S\xE1b", "Dom"];
var AGENDA_QUIZ_LABELS = [
  { key: "bed", label: "Vai dormir" },
  { key: "wake", label: "Acorda" },
  { key: "ws", label: "In\xEDcio do expediente" },
  { key: "we", label: "Fim do expediente" },
  { key: "wdays", label: "Dias que trabalha", hint: "0=seg \u2026 6=dom" },
  { key: "commute", label: "Deslocamento at\xE9 o trabalho", hint: "min por trecho (0 = trabalha em casa)" },
  { key: "meetAM", label: "Reuni\xE3o de manh\xE3", hint: "minutos" },
  { key: "meetPM", label: "Reuni\xE3o \xE0 tarde", hint: "minutos" },
  { key: "meetEve", label: "Reuni\xE3o \xE0 noite", hint: "minutos" },
  { key: "bfT", label: "Caf\xE9 da manh\xE3 \u2014 hor\xE1rio" },
  { key: "bfD", label: "Caf\xE9 da manh\xE3 \u2014 dura\xE7\xE3o" },
  { key: "lunchT", label: "Almo\xE7o \u2014 hor\xE1rio" },
  { key: "lunchD", label: "Almo\xE7o \u2014 dura\xE7\xE3o" },
  { key: "dinT", label: "Jantar \u2014 hor\xE1rio" },
  { key: "dinD", label: "Jantar \u2014 dura\xE7\xE3o" },
  { key: "train", label: "Treina atualmente" },
  { key: "trainDays", label: "Dias de treino" },
  { key: "trainT", label: "Treino \u2014 hor\xE1rio" },
  { key: "trainD", label: "Treino \u2014 dura\xE7\xE3o" },
  { key: "trainCom", label: "Deslocamento at\xE9 o treino", hint: "min por trecho" },
  { key: "ppl", label: "Tem momentos fixos com pessoas importantes" },
  { key: "pplWkDays", label: "Pessoas (semana) \u2014 dias" },
  { key: "pplWkT", label: "Pessoas (semana) \u2014 hor\xE1rio" },
  { key: "pplWkD", label: "Pessoas (semana) \u2014 dura\xE7\xE3o" },
  { key: "pplWeDays", label: "Pessoas (fim de semana) \u2014 dias" },
  { key: "pplWeT", label: "Pessoas (fim de semana) \u2014 hor\xE1rio" },
  { key: "pplWeD", label: "Pessoas (fim de semana) \u2014 dura\xE7\xE3o" },
  { key: "vazAM", label: "Procrastina\xE7\xE3o de manh\xE3", hint: "minutos" },
  { key: "vazAMp", label: "Procrastina\xE7\xE3o de manh\xE3 \u2014 posi\xE7\xE3o", hint: "come\xE7o / fim" },
  { key: "vazPM", label: "Procrastina\xE7\xE3o \xE0 tarde", hint: "minutos" },
  { key: "vazPMp", label: "Procrastina\xE7\xE3o \xE0 tarde \u2014 posi\xE7\xE3o", hint: "come\xE7o / fim" }
];
var AGENDA_BLOCK_CATEGORIES = {
  f1: { label: "Farol 1 \xB7 rumo \xE0s metas", desc: "Trabalho e progresso financeiro direto", color: "#f2c744" },
  f2: { label: "Farol 2 \xB7 ser a sua palavra", desc: "Compromissos com outras pessoas \u2014 reuni\xF5es, calls", color: "#7aa2f7" },
  f3: { label: "Farol 3 \xB7 autossustent\xE1vel", desc: "Rotina que mant\xE9m a pessoa funcionando", color: "#5fd39b" },
  sono: { label: "Sono", desc: "Sono", color: "#8b7ff5" },
  desvio: { label: "Desvio de rota", desc: "Necess\xE1rio, mas fora dos Far\xF3is \u2014 deslocamento, burocracia", color: "#9a9a94" },
  vaz: { label: "Procrastina\xE7\xE3o", desc: "Tempo perdido", color: "#e0705a" }
};
var AGENDA_A1_PADRAO = {
  bed: "23:00",
  wake: "07:00",
  ws: "09:00",
  we: "18:00",
  wdays: [0, 1, 2, 3, 4],
  commute: 15,
  meetAM: 60,
  meetPM: 60,
  meetEve: 0,
  lunchT: "12:00",
  lunchD: 60,
  bfT: "07:00",
  bfD: 30,
  dinT: "21:00",
  dinD: 60,
  train: true,
  trainDays: [0, 2, 4],
  trainT: "18:30",
  trainD: 60,
  trainCom: 15,
  ppl: true,
  pplWkDays: [0, 1, 2, 3, 4],
  pplWkT: "20:00",
  pplWkD: 180,
  pplWeDays: [5, 6],
  pplWeT: "11:00",
  pplWeD: 420,
  vazAM: 90,
  vazAMp: "come\xE7o",
  vazPM: 90,
  vazPMp: "come\xE7o"
};
function quizNaoRespondido(a1, phase) {
  if (!a1 || typeof a1 !== "object")
    return false;
  if (phase === "done")
    return false;
  return Object.entries(AGENDA_A1_PADRAO).every(
    ([chave, valor]) => JSON.stringify(a1[chave]) === JSON.stringify(valor)
  );
}
function formatDuration(minutes) {
  const total = Number(minutes) || 0;
  if (total < 60)
    return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
function formatWeekdays(value) {
  if (!Array.isArray(value) || value.length === 0)
    return "\u2014";
  return value.slice().sort((a, b) => Number(a) - Number(b)).map((i) => AGENDA_WEEKDAYS[Number(i)] ?? "?").join(",");
}
function resumoAgenda(a1) {
  if (!a1 || typeof a1 !== "object")
    return {};
  const resumo = {};
  const p\u00F5e = (chave, valor) => {
    if (valor && valor !== "\u2014")
      resumo[chave] = valor;
  };
  p\u00F5e("sono", a1.bed && a1.wake ? `${a1.bed}\u2013${a1.wake}` : "\u2014");
  p\u00F5e("trabalho", a1.ws && a1.we ? `${a1.ws}\u2013${a1.we} (${formatWeekdays(a1.wdays)})` : "\u2014");
  p\u00F5e("deslocamento", a1.commute ? `${formatDuration(a1.commute)}/trecho` : "\u2014");
  const reunioes = [];
  if (Number(a1.meetAM) > 0)
    reunioes.push(`manh\xE3 ${formatDuration(a1.meetAM)}`);
  if (Number(a1.meetPM) > 0)
    reunioes.push(`tarde ${formatDuration(a1.meetPM)}`);
  if (Number(a1.meetEve) > 0)
    reunioes.push(`noite ${formatDuration(a1.meetEve)}`);
  p\u00F5e("reunioes", reunioes.join(", "));
  const refeicao = (hora, dur) => hora ? `${hora} (${formatDuration(dur)})` : "\u2014";
  p\u00F5e("cafe", refeicao(a1.bfT, a1.bfD));
  p\u00F5e("almoco", refeicao(a1.lunchT, a1.lunchD));
  p\u00F5e("jantar", refeicao(a1.dinT, a1.dinD));
  resumo.treino = a1.train ? `${formatWeekdays(a1.trainDays)} ${a1.trainT ?? ""} (${formatDuration(a1.trainD)})`.trim() : "N\xE3o";
  if (!a1.ppl) {
    resumo.pessoas = "N\xE3o";
  } else {
    const pessoas = [];
    if (Array.isArray(a1.pplWkDays) && a1.pplWkDays.length) {
      pessoas.push(`${formatWeekdays(a1.pplWkDays)} ${a1.pplWkT ?? ""}`.trim());
    }
    if (Array.isArray(a1.pplWeDays) && a1.pplWeDays.length) {
      pessoas.push(`${formatWeekdays(a1.pplWeDays)} ${a1.pplWeT ?? ""}`.trim());
    }
    resumo.pessoas = pessoas.length ? pessoas.join(" / ") : "Sim";
  }
  const procrastinacao = [];
  if (Number(a1.vazAM) > 0)
    procrastinacao.push(`manh\xE3 ${formatDuration(a1.vazAM)}`);
  if (Number(a1.vazPM) > 0)
    procrastinacao.push(`tarde ${formatDuration(a1.vazPM)}`);
  p\u00F5e("procrastinacao", procrastinacao.join(", "));
  return resumo;
}

// src/lib/leadSources.ts
function digitsOnly(value) {
  if (value === null || value === void 0)
    return null;
  const digits = String(value).replace(/\D/g, "");
  return digits || null;
}
function normalizePhone(value) {
  const digits = digitsOnly(value);
  if (!digits)
    return null;
  if (digits.length === 11 && digits[2] !== "9")
    return digits;
  if (digits.length === 10 || digits.length === 11)
    return "55" + digits;
  return digits;
}
function telefoneVariantes(value) {
  const digits = normalizePhone(value);
  if (!digits || !digits.startsWith("55"))
    return digits ? [digits] : [];
  const resto = digits.slice(2);
  const ddd = resto.slice(0, 2);
  const numero = resto.slice(2);
  if (numero.length === 9 && numero.startsWith("9")) {
    return [digits, `55${ddd}${numero.slice(1)}`];
  }
  if (numero.length === 8 && /^[6-9]/.test(numero)) {
    return [`55${ddd}9${numero}`, digits];
  }
  return [digits];
}
function telefoneCanonico(value) {
  const variantes = telefoneVariantes(value);
  return variantes[0] ?? null;
}
function trimmed(value) {
  if (value === null || value === void 0)
    return null;
  const s = String(value).trim();
  return s || null;
}
var ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
function dataCadastro(value) {
  const s = trimmed(value);
  if (!s)
    return null;
  if (!ISO_RE.test(s))
    return s;
  const data = new Date(s);
  if (Number.isNaN(data.getTime()))
    return s;
  return data.toLocaleString("pt-BR", {
    // Fuso fixo, não o do servidor: a Vercel roda em UTC, e sem isto o mesmo
    // cadastro apareceria 3 horas antes do que a planilha (exportada de um
    // navegador no Brasil) mostrou pra mesma pessoa.
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function normalizeInstagram(value) {
  const s = trimmed(value);
  if (!s)
    return null;
  const handle = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "").replace(/^@/, "").trim();
  return handle ? `@${handle}` : null;
}
var siteEvento = {
  key: "site_evento",
  label: "Site Evento",
  description: "Formul\xE1rio de captura do site do evento.",
  // Sem campo obrigatório de propósito: é um formulário de WordPress, onde os
  // nomes dos campos mudam a cada edição e quem preenche não tem culpa da
  // configuração. Melhor gravar incompleto (e completar depois) do que recusar
  // e perder o lead. A fonte agenda_ascensao continua exigindo id/nome/whatsapp
  // porque ali quem chama é um sistema nosso, e faltar campo é bug, não acaso.
  required: [],
  columns: [
    { key: "name", label: "Nome", width: 220 },
    { key: "email", label: "E-mail", format: "email", width: 240 },
    { key: "phone", label: "WhatsApp", format: "phone", width: 160 },
    { key: "received_at", label: "Recebido em", format: "datetime", width: 170 }
  ],
  normalize: (body) => {
    const extras = {};
    for (const [chave, valor] of Object.entries(body)) {
      if (["source", "nome", "email", "whatsapp", "instagram", "key", "token", "resync"].includes(chave))
        continue;
      extras[chave] = valor;
    }
    return {
      // O site não manda id próprio, então quem identifica o lead é o telefone
      // (ver dedupeKeyFor) — reenvio do mesmo formulário atualiza, não duplica.
      externalId: null,
      name: trimmed(body.nome) || "Sem nome",
      email: trimmed(body.email),
      phone: normalizePhone(body.whatsapp),
      instagram: normalizeInstagram(body.instagram),
      fields: extras
    };
  }
};
var AGENDA_AREAS = ["Empres\xE1rio", "Profissional Aut\xF4nomo", "CLT", "Outro"];
var AGENDA_AUMENTO = [
  "Mais de R$50.000/m\xEAs",
  "R$25.000-R$50.000/m\xEAs",
  "R$10.000-R$25.000/m\xEAs",
  "R$1.000-R$10.000/m\xEAs",
  "Menos de R$1.000/m\xEAs"
];
var AGENDA_INVESTIMENTO = [
  "Mais de R$50.000",
  "R$31.000 \xE0 R$50.000",
  "R$16.000 \xE0 R$30.000",
  "R$5.000 \xE0 R$15.000",
  "At\xE9 R$4.000",
  "N\xE3o fiz esse tipo de investimento"
];
var COLUNAS_RESUMO_AGENDA = [
  { key: "sono", label: "Sono", width: 130 },
  { key: "trabalho", label: "Trabalho", width: 240 },
  { key: "deslocamento", label: "Deslocamento", width: 130 },
  { key: "reunioes", label: "Reuni\xF5es", width: 150 },
  { key: "cafe", label: "Caf\xE9 da manh\xE3", width: 140 },
  { key: "almoco", label: "Almo\xE7o", width: 140 },
  { key: "jantar", label: "Jantar", width: 140 },
  { key: "treino", label: "Treino", width: 220 },
  { key: "pessoas", label: "Pessoas importantes", width: 240 },
  { key: "procrastinacao", label: "Procrastina\xE7\xE3o", width: 170 }
];
function camposDaAgenda(body) {
  const agenda = body.agenda ?? {};
  const a1 = agenda.a1 ?? null;
  const blocks = Array.isArray(agenda.real) ? agenda.real : [];
  return {
    agenda,
    perfil: {
      area: trimmed(body.area) ?? trimmed(agenda.area),
      aumento: trimmed(body.aumento) ?? trimmed(agenda.aumento),
      investimento: trimmed(body.investimento) ?? trimmed(agenda.investimento)
    },
    instagram: normalizeInstagram(body.instagram ?? agenda.instagram),
    // "done" = quiz completo com agenda pronta; "w1" = parou no meio.
    phase: trimmed(agenda.phase),
    // Só entra no payload o que existe: um `a1: null` sobrescrevendo o `a1` que
    // já estava gravado apagaria a agenda de quem foi reenviado incompleto.
    //
    // Quando o `a1` é o padrão do site inteiro, o resumo NÃO é derivado: ele
    // viraria "Sono 23:00–07:00, Treino Seg/Qua/Sex…" nas colunas da planilha,
    // indistinguível de quem respondeu isso de verdade. Guarda o `a1` cru (é o
    // que o site mandou, e some daqui seria pior) marcado com `quiz_padrao`,
    // que é o que as telas usam pra dizer "não respondeu" em vez de inventar.
    quiz: a1 ? quizNaoRespondido(a1, trimmed(agenda.phase)) ? { a1, quiz_padrao: true } : { a1, ...resumoAgenda(a1) } : {},
    blocos: blocks.length > 0 ? { real: blocks, blocos: blocks.length } : {}
  };
}
var agendaAscensao = {
  key: "agenda_ascensao",
  label: "Agenda Ascens\xE3o",
  description: "Quiz da Agenda Ascens\xE3o \u2014 contato, perfil profissional e agenda montada.",
  required: ["id", "nome", "whatsapp"],
  columns: [
    { key: "external_id", label: "ID", format: "number", width: 80 },
    { key: "name", label: "Nome", width: 200 },
    { key: "phone", label: "WhatsApp", format: "phone", width: 150 },
    { key: "instagram", label: "Instagram", format: "instagram", width: 150 },
    { key: "email", label: "E-mail", format: "email", width: 200 },
    { key: "area", label: "\xC1rea", format: "badge", width: 170 },
    { key: "aumento", label: "Aumento esperado", width: 190 },
    { key: "investimento", label: "J\xE1 investiu", width: 190 },
    { key: "phase", label: "Quiz", format: "badge", width: 110 },
    { key: "blocos", label: "Blocos", format: "number", width: 80 },
    ...COLUNAS_RESUMO_AGENDA,
    { key: "criado_em", label: "Criado em", format: "datetime", width: 170 },
    { key: "received_at", label: "Recebido em", format: "datetime", width: 170 }
  ],
  normalize: (body) => {
    const { perfil, instagram, phase, quiz, blocos, agenda } = camposDaAgenda(body);
    return {
      externalId: trimmed(body.id),
      name: trimmed(body.nome) || "Sem nome",
      // O formulário da Agenda hoje não tem campo de e-mail e manda string
      // vazia; trimmed() já converte pra null, então a coluna fica vazia em vez
      // de guardar "".
      email: trimmed(body.email),
      phone: normalizePhone(body.whatsapp),
      instagram,
      fields: {
        ...perfil,
        criado_em: trimmed(body.criado_em),
        phase,
        uid: agenda.uid ?? null,
        // Quiz e blocos inteiros pro painel de detalhe, junto do resumo em
        // texto que alimenta as colunas da planilha.
        ...quiz,
        ...blocos
      }
    };
  }
};
var agendaAntigos = {
  key: "agenda_antigos",
  label: "Agenda \u2014 lista antiga",
  description: "Leads da Agenda anteriores \xE0 integra\xE7\xE3o autom\xE1tica.",
  // Lista histórica, não aquisição: fica fora do dashboard e da coluna "Fonte:"
  // do Kanban mesmo depois de o site reenviar esses leads com a agenda completa.
  isAcquisitionChannel: false,
  // Sem obrigatório: entrou por planilha (scripts/importar-csv-leads.mjs) e hoje
  // é reenviada pelo próprio site. Recusar linha aqui só faria perder lead de uma
  // lista que já é histórica.
  required: [],
  columns: [
    { key: "external_id", label: "ID", format: "number", width: 80 },
    { key: "name", label: "Nome", width: 190 },
    { key: "phone", label: "WhatsApp", format: "phone", width: 150 },
    { key: "instagram", label: "Instagram", format: "instagram", width: 160 },
    { key: "email", label: "E-mail", format: "email", width: 180 },
    { key: "criado_em", label: "Cadastro", width: 150 },
    { key: "fase", label: "Quiz", format: "badge", width: 110 },
    { key: "area", label: "\xC1rea", width: 150 },
    { key: "aumento", label: "Aumento esperado", width: 170 },
    { key: "investimento", label: "J\xE1 investiu", width: 170 },
    { key: "blocos", label: "Blocos", format: "number", width: 80 },
    ...COLUNAS_RESUMO_AGENDA
  ],
  /**
   * Aceita os dois formatos em que essa lista chega.
   *
   * A planilha exportada do site traz tudo em texto já legível ("22:00–05:00",
   * "noite 1h") e nenhuma agenda montada — foi assim que os 644 leads
   * históricos entraram. A ressincronização manda o mesmo lead no formato cru
   * (`agenda.a1` + `agenda.real`), que é o único jeito de o CRM montar a semana
   * dele bloco a bloco.
   *
   * Com o formato cru, o resumo em texto é derivado de `a1` — dá as mesmas
   * frases da planilha, então as colunas continuam preenchidas — e os campos
   * soltos do corpo seguem sendo lidos, pro reenvio nunca apagar o que a
   * planilha havia trazido.
   */
  normalize: (body) => {
    const { perfil, instagram, phase, quiz, blocos } = camposDaAgenda(body);
    const daPlanilha = [
      "fase",
      "sono",
      "trabalho",
      "deslocamento",
      "reunioes",
      "cafe",
      "almoco",
      "jantar",
      "treino",
      "pessoas",
      "procrastinacao"
    ];
    const fields = {};
    for (const chave of daPlanilha) {
      const valor = trimmed(body[chave]);
      if (valor && valor !== "\u2014")
        fields[chave] = valor;
    }
    for (const [chave, valor] of Object.entries(perfil)) {
      if (valor)
        fields[chave] = valor;
    }
    const cadastro = trimmed(body.criado_em);
    if (cadastro)
      fields.criado_em = dataCadastro(cadastro);
    return {
      externalId: trimmed(body.id),
      name: trimmed(body.nome) || "Sem nome",
      email: trimmed(body.email) === "\u2014" ? null : trimmed(body.email),
      phone: normalizePhone(body.whatsapp),
      instagram,
      fields: {
        ...fields,
        ...phase ? { fase: phase } : {},
        ...quiz,
        ...blocos
      }
    };
  }
};
var indicacao = {
  key: "indicacao",
  label: "Indica\xE7\xE3o",
  description: "Lead que algu\xE9m indicou, cadastrado \xE0 m\xE3o por quem atende.",
  // Único ponto de entrada preenchido por gente, não por sistema. Nome e
  // WhatsApp são exigidos porque quem digita está com a pessoa em mãos: um
  // lead de indicação sem telefone não dá pra trabalhar, e aceitar pela metade
  // só empurraria o problema pra frente.
  required: ["nome", "whatsapp"],
  columns: [
    { key: "name", label: "Nome", width: 200 },
    { key: "phone", label: "WhatsApp", format: "phone", width: 150 },
    { key: "instagram", label: "Instagram", format: "instagram", width: 150 },
    { key: "email", label: "E-mail", format: "email", width: 200 },
    { key: "indicado_por", label: "Indicado por", width: 190 },
    { key: "observacao", label: "Observa\xE7\xE3o", width: 280 },
    { key: "cadastrado_por", label: "Cadastrado por", width: 160 },
    { key: "received_at", label: "Cadastrado em", format: "datetime", width: 170 }
  ],
  normalize: (body) => ({
    // Sem id próprio: quem identifica é o telefone (ver dedupeKeyFor), então
    // cadastrar a mesma pessoa duas vezes atualiza a linha em vez de duplicar —
    // o que acontece de verdade quando dois agentes recebem a mesma indicação.
    externalId: null,
    name: trimmed(body.nome) || "Sem nome",
    email: trimmed(body.email),
    phone: normalizePhone(body.whatsapp),
    instagram: normalizeInstagram(body.instagram),
    fields: {
      indicado_por: trimmed(body.indicado_por),
      observacao: trimmed(body.observacao),
      cadastrado_por: trimmed(body.cadastrado_por),
      // O formulário deixa acrescentar qualquer campo que exista em outra fonte
      // (ver CAMPOS_ADICIONAVEIS). Guardar o que veio, em vez de uma lista fixa,
      // é o que faz esse botão valer alguma coisa: um campo novo lá não precisa
      // de mudança aqui pra sobreviver à gravação.
      ...camposExtras(body)
    }
  })
};
var CAMPOS_PROPRIOS_INDICACAO = /* @__PURE__ */ new Set([
  "source",
  "key",
  "token",
  "resync",
  "id",
  "nome",
  "whatsapp",
  "email",
  "instagram",
  "indicado_por",
  "observacao",
  "cadastrado_por"
]);
function camposExtras(body) {
  const extras = {};
  for (const [chave, valor] of Object.entries(body)) {
    if (CAMPOS_PROPRIOS_INDICACAO.has(chave))
      continue;
    const texto = trimmed(valor);
    if (texto)
      extras[chave] = texto;
  }
  return extras;
}
var LEAD_SOURCES = {
  agenda_ascensao: agendaAscensao,
  site_evento: siteEvento,
  indicacao,
  agenda_antigos: agendaAntigos
};
var LEAD_SOURCE_ORDER = ["agenda_ascensao", "site_evento", "indicacao", "agenda_antigos"];
var ACQUISITION_SOURCE_ORDER = LEAD_SOURCE_ORDER.filter(
  (key) => LEAD_SOURCES[key].isAcquisitionChannel !== false
);
var CHAVES_FIXAS = /* @__PURE__ */ new Set([
  "name",
  "email",
  "phone",
  "instagram",
  "external_id",
  "received_at",
  "updated_at"
]);
var CHAVES_DERIVADAS = /* @__PURE__ */ new Set(["phase", "fase", "blocos", "criado_em"]);
function camposAdicionaveis(excluir = []) {
  const fora = new Set(excluir);
  const porChave = /* @__PURE__ */ new Map();
  for (const chave of LEAD_SOURCE_ORDER) {
    const def = LEAD_SOURCES[chave];
    for (const coluna of def.columns) {
      if (CHAVES_FIXAS.has(coluna.key) || CHAVES_DERIVADAS.has(coluna.key) || fora.has(coluna.key))
        continue;
      const atual = porChave.get(coluna.key);
      if (atual) {
        if (!atual.fontes.includes(def.label))
          atual.fontes.push(def.label);
        continue;
      }
      porChave.set(coluna.key, { key: coluna.key, label: coluna.label, fontes: [def.label] });
    }
  }
  return [...porChave.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
function isLeadSourceKey(value) {
  return typeof value === "string" && value in LEAD_SOURCES;
}
function getLeadSource(key) {
  return isLeadSourceKey(key) ? LEAD_SOURCES[key] : null;
}
function dedupeKeyFor(source, normalized) {
  if (source === "agenda_ascensao")
    return normalized.externalId;
  if (source === "agenda_antigos")
    return normalized.externalId;
  if (source === "site_evento")
    return normalized.phone;
  if (source === "indicacao")
    return normalized.phone;
  return null;
}
export {
  ACQUISITION_SOURCE_ORDER,
  AGENDA_AREAS,
  AGENDA_AUMENTO,
  AGENDA_BLOCK_CATEGORIES,
  AGENDA_INVESTIMENTO,
  AGENDA_QUIZ_LABELS,
  AGENDA_WEEKDAYS,
  LEAD_SOURCES,
  LEAD_SOURCE_ORDER,
  camposAdicionaveis,
  dedupeKeyFor,
  digitsOnly,
  getLeadSource,
  isLeadSourceKey,
  normalizePhone,
  telefoneCanonico,
  telefoneVariantes
};
