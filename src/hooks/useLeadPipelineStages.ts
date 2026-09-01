'use client'

import { useEffect, useState, useRef } from 'react'
import { PipelineStage } from '@/lib/types'
import { demoStages } from '@/lib/demoData'

const DEMO_STAGE_IDS = new Set(demoStages.map(s => s.id))

export function useLeadPipelineStages(stageId: string | undefined | null) {
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(false)
  const cachedPipelineId = useRef<string | null>(null)

  useEffect(() => {
    if (!stageId) { setStages([]); cachedPipelineId.current = null; return }
    // TEMPORÁRIO: etapas demo do bypass de login não existem no banco. Reverter
    // junto com AuthGuard/middleware.
    if (DEMO_STAGE_IDS.has(stageId)) { setStages(demoStages); return }
    if (stages.length > 0 && stages.some(s => s.id === stageId)) return
    fetchStages()
  }, [stageId])

  async function fetchStages() {
    setLoading(true)
    try {
      const stageRes = await fetch(`/api/pipelines/stages/${stageId}`)
      if (!stageRes.ok) { setStages([]); return }
      const { data: stageRow } = await stageRes.json()
      if (!stageRow?.pipeline_id && !stageRow?.pipelineId) { setStages([]); return }

      const pipelineId = stageRow.pipeline_id || stageRow.pipelineId
      if (pipelineId === cachedPipelineId.current && stages.length > 0) { setLoading(false); return }
      cachedPipelineId.current = pipelineId

      const res = await fetch(`/api/pipelines/${pipelineId}/stages`)
      if (!res.ok) { setStages([]); return }
      const { data } = await res.json()
      setStages(data || [])
    } catch (err) {
      console.error('Failed to fetch lead pipeline stages:', err)
      setStages([])
    } finally {
      setLoading(false)
    }
  }

  return { stages, loading }
}
