'use client'

/**
 * As linhas de WhatsApp conectadas (os números).
 *
 * Só os canais de WhatsApp: Instagram e webhook não são "número" e não têm
 * lugar no menu de linhas do Kanban.
 *
 * Passar `organizationId` vazio desliga a busca — é assim que só a coluna de
 * atendimento humano paga por ela, em vez de toda coluna do quadro pedir a
 * mesma lista.
 */
import { useEffect, useState } from 'react'

export interface LinhaConectada {
  id: string
  name?: string | null
  type?: string | null
}

const TIPOS_DE_WHATSAPP = [
  'whatsapp_zapi',
  'whatsapp_evolution',
  'whatsapp_cloud_official',
  'whatsapp_lite',
]

export function useLinhasDeWhatsapp(organizationId: string) {
  const [linhas, setLinhas] = useState<LinhaConectada[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    let cancelado = false
    setCarregando(true)
    fetch('/api/integrations')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => {
        if (cancelado) return
        const lista: LinhaConectada[] = (data || []).filter((i: LinhaConectada) =>
          TIPOS_DE_WHATSAPP.includes(String(i.type))
        )
        setLinhas(lista)
      })
      .catch(() => { if (!cancelado) setLinhas([]) })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [organizationId])

  return { linhas, carregando }
}
