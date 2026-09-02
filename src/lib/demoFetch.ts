'use client'

// TEMPORÁRIO: enquanto o login estiver desativado (AuthGuard/middleware), essa
// interceptação evita que cada hook (notificações, busca, tags, etc.) fique
// esperando uma resposta real da API/banco pra só então falhar — troca por uma
// resposta instantânea, sem nenhuma chamada de rede. Os hooks já preparados
// especificamente (LeadsContext, usePipeline, useLeadActivities) nem chegam a
// cair aqui, porque já retornam os dados demo antes de chamar fetch. Isso é só
// a rede de segurança pro resto do app. Reverter junto com AuthGuard/middleware.
import { demoLeads, demoActivitiesByLeadId, demoPipeline, demoStages, demoFunnels, demoFunnelSummaries } from './demoData'

let demoModeActive = false
let installed = false

export function setDemoMode(active: boolean) {
  demoModeActive = active
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function buildDemoResponse(path: string, method: string): Response {
  if (path === '/api/leads' && method === 'GET') {
    return jsonResponse({ data: demoLeads })
  }

  const leadMatch = path.match(/^\/api\/leads\/([^/]+)(\/.*)?$/)
  if (leadMatch) {
    const leadId = leadMatch[1]
    const sub = leadMatch[2] || ''
    if (sub === '/messages' && method === 'GET') {
      return jsonResponse({ data: demoActivitiesByLeadId[leadId] || [] })
    }
    if (sub === '/messages' && method === 'POST') {
      return jsonResponse({ data: {}, send_status: 'sent' })
    }
    if (sub === '' && method === 'GET') {
      const lead = demoLeads.find((l) => l.id === leadId)
      return lead ? jsonResponse({ data: lead }) : jsonResponse({ error: 'not found' }, 404)
    }
    if (sub === '' && method === 'PATCH') {
      return jsonResponse({ data: {} })
    }
    // stage-history, tags, activities, pinned-messages, history — vazio é uma resposta válida
    return jsonResponse({ data: [] })
  }

  if (path === '/api/pipelines' && method === 'GET') {
    return jsonResponse({ data: [{ ...demoPipeline, stages: demoStages }] })
  }
  if (/^\/api\/pipelines\/[^/]+\/stages$/.test(path) && method === 'GET') {
    return jsonResponse({ data: demoStages })
  }
  const stageMatch = path.match(/^\/api\/pipelines\/stages\/([^/]+)$/)
  if (stageMatch && method === 'GET') {
    const stage = demoStages.find((s) => s.id === stageMatch[1])
    return stage ? jsonResponse({ data: stage }) : jsonResponse({ error: 'not found' }, 404)
  }

  if (path === '/api/funnels' && method === 'GET') {
    return jsonResponse({ data: demoFunnelSummaries })
  }
  const funnelMatch = path.match(/^\/api\/funnels\/([^/]+)$/)
  if (funnelMatch && method === 'GET') {
    const funnel = demoFunnels.find((f) => f.id === funnelMatch[1])
    return funnel ? jsonResponse({ data: funnel }) : jsonResponse({ error: 'not found' }, 404)
  }
  if (funnelMatch && (method === 'PATCH' || method === 'PUT')) {
    return jsonResponse({ data: {} })
  }

  // Fallback genérico — qualquer outra rota de API vira uma resposta vazia
  // instantânea em vez de bater no banco de verdade.
  if (method === 'GET') return jsonResponse({ data: [] })
  return jsonResponse({ data: {} })
}

export function installDemoFetchInterceptor() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url

    // Nunca intercepta rotas do NextAuth (precisa continuar resolvendo sessão
    // de verdade) nem nada fora de /api — só as chamadas de dados do app.
    if (demoModeActive && url.startsWith('/api/') && !url.startsWith('/api/auth/')) {
      const path = url.split('?')[0]
      const method = (init?.method || 'GET').toUpperCase()
      return buildDemoResponse(path, method)
    }

    return originalFetch(input, init)
  }) as typeof window.fetch
}
