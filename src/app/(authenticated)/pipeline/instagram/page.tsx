'use client'

import { useAuth, usePipeline } from '@/hooks'
import { usePipelineFilters } from '@/contexts/FilterContext'
import { PipelineBoard } from '@/components/Pipeline'
import NotAuthorized from '@/components/Shared/NotAuthorized'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

/**
 * "Pipeline Instagram": o Kanban dos leads que chegam pela DM do Instagram.
 * É um pipeline à parte (pipelines.settings.origem = 'instagram'), com as etapas
 * dele — o de Atendimento continua sendo o do WhatsApp.
 */
export default function PipelineInstagramPage() {
  const { organizationId, loading, permissions, isMaster, roleName } = useAuth()
  const { filters } = usePipelineFilters()
  const { pipelines, loading: pipelinesLoading } = usePipeline(organizationId || '')

  const isAdmin = isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner' || permissions?.['*']
  if (!loading && !isAdmin && permissions && !permissions.settings?.view_pipeline) {
    return <NotAuthorized />
  }

  if (loading || pipelinesLoading || (!isAdmin && !permissions)) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <LoadingSpinner text="Carregando..." size="lg" />
      </div>
    )
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <p className="text-muted">Nenhuma organização encontrada.</p>
      </div>
    )
  }

  const pipelineDoInstagram = pipelines.find((p) => (p.settings as { origem?: string } | undefined)?.origem === 'instagram')
  if (!pipelineDoInstagram) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <p className="text-muted">O Pipeline Instagram ainda não foi criado.</p>
      </div>
    )
  }

  return <PipelineBoard organizationId={organizationId} filters={filters} pipelineId={pipelineDoInstagram.id} />
}
