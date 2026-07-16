'use client'

import { useCallback, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  PlayCircle,
  ChatCircleDots,
  HourglassSimple,
  GitBranch,
  FlagCheckered,
  Plus,
  Trash,
  X,
} from '@phosphor-icons/react'

export interface FunnelBlockData {
  blockType: 'trigger' | 'message' | 'wait' | 'condition' | 'end'
  config: Record<string, any>
  [key: string]: unknown
}

type FlowNode = Node<FunnelBlockData>

const TRIGGER_LABELS: Record<string, string> = {
  novo_pago: 'Novo Pago',
  novo_recuperacao: 'Novo Recuperação',
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  respondeu: 'Respondeu mensagem',
  clique_pagina: 'Clicou no link / viu a página',
  pagamento: 'Pagamento confirmado',
}

const TRIGGER_WEBHOOKS: Record<string, string> = {
  novo_pago: '/api/webhooks/recuperacao (pago)',
  novo_recuperacao: '/api/webhooks/recuperacao',
}

const CONDITION_WEBHOOKS: Record<string, string> = {
  pagamento: '/api/webhooks/recuperacao (confirmação)',
}

// ── Custom Nodes ────────────────────────────────────────────────────────────

function NodeShell({ selected, color, icon, title, children, hasTarget = true, hasSource = true }: {
  selected?: boolean
  color: string
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
  hasTarget?: boolean
  hasSource?: boolean
}) {
  return (
    <div
      className={`rounded-xl border-2 shadow-sm w-56 overflow-hidden transition-shadow ${selected ? 'ring-2 ring-blue-400' : ''}`}
      style={{ borderColor: color }}
    >
      {hasTarget && <Handle type="target" position={Position.Left} style={{ background: color, width: 10, height: 10 }} />}
      <div className="px-3 py-2 flex items-center gap-2 font-semibold text-sm text-gray-800" style={{ background: `${color}22` }}>
        {icon}
        {title}
      </div>
      {children && <div className="px-3 py-2 text-xs text-gray-600 bg-white">{children}</div>}
      {hasSource && <Handle type="source" position={Position.Right} style={{ background: color, width: 10, height: 10 }} />}
    </div>
  )
}

function TriggerNode({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config || {}
  const webhook = TRIGGER_WEBHOOKS[config.trigger]
  return (
    <NodeShell selected={selected} color="#8b5cf6" icon={<PlayCircle size={16} weight="fill" style={{ color: '#8b5cf6' }} />} title="Gatilho de outro app" hasTarget={true}>
      {TRIGGER_LABELS[config.trigger] || 'Selecione o gatilho'}
      {webhook && <p className="mt-1 text-[10px] text-violet-500 font-mono break-all">📡 {webhook}</p>}
    </NodeShell>
  )
}

function MessageNode({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config || {}
  const text = (config.text || '').trim()
  return (
    <NodeShell selected={selected} color="#3b82f6" icon={<ChatCircleDots size={16} weight="fill" style={{ color: '#3b82f6' }} />} title="Mensagem">
      {text ? <p className="line-clamp-3 whitespace-pre-wrap">{text}</p> : <span className="italic text-gray-400">Sem texto definido</span>}
      {config.trackableUrl && <p className="mt-1 text-blue-500 truncate">🔗 {config.trackableUrl}</p>}
    </NodeShell>
  )
}

function WaitNode({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config || {}
  const unitLabels: Record<string, string> = { seconds: 'segundos', minutes: 'minutos', hours: 'horas', days: 'dias' }
  return (
    <NodeShell selected={selected} color="#f59e0b" icon={<HourglassSimple size={16} weight="fill" style={{ color: '#f59e0b' }} />} title="Espera Minha Mensagem">
      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-700">
        <span>⏰</span>
        <span>Espera {config.value ?? 0} {unitLabels[config.unit] || 'minutos'}</span>
      </div>
    </NodeShell>
  )
}

function ConditionNode({ data, selected }: NodeProps<FlowNode>) {
  const config = data.config || {}
  const unitLabels: Record<string, string> = { minutes: 'minutos', hours: 'horas', days: 'dias' }
  return (
    <div className={`rounded-xl border-2 shadow-sm w-56 overflow-hidden transition-shadow ${selected ? 'ring-2 ring-blue-400' : ''}`} style={{ borderColor: '#f97316' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#f97316', width: 10, height: 10 }} />
      <div className="px-3 py-2 flex items-center gap-2 font-semibold text-sm text-gray-800" style={{ background: '#f9731622' }}>
        <GitBranch size={16} weight="fill" style={{ color: '#f97316' }} />
        Espera Mensagem Dele
      </div>
      <div className="px-3 py-2 text-xs text-gray-600 bg-white">
        <p className="truncate">{CONDITION_TYPE_LABELS[config.conditionType] || CONDITION_TYPE_LABELS.respondeu}</p>
        {CONDITION_WEBHOOKS[config.conditionType] && (
          <p className="mt-1 text-[10px] text-orange-500 font-mono break-all">📡 {CONDITION_WEBHOOKS[config.conditionType]}</p>
        )}
      </div>
      <div className="px-3 pb-2 bg-white">
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-700">
          <span>⏰</span>
          <span>Espera {config.value ?? 0} {unitLabels[config.unit] || 'minutos'}</span>
        </div>
      </div>
      <div className="relative flex justify-between px-4 py-1.5 bg-gray-50 text-[11px] font-semibold">
        <span className="text-emerald-600">Sim</span>
        <span className="text-red-500">Não</span>
      </div>
      <Handle type="source" position={Position.Right} id="yes" style={{ background: '#10b981', width: 10, height: 10, top: '35%' }} />
      <Handle type="source" position={Position.Right} id="no" style={{ background: '#ef4444', width: 10, height: 10, top: '65%' }} />
    </div>
  )
}

function EndNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <NodeShell selected={selected} color="#6b7280" icon={<FlagCheckered size={16} weight="fill" style={{ color: '#6b7280' }} />} title="Fim" hasSource={false} />
  )
}

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  wait: WaitNode,
  condition: ConditionNode,
  end: EndNode,
}

// ── Block Editor Panel ──────────────────────────────────────────────────────

function BlockEditorPanel({ node, onChange, onDelete, onClose }: {
  node: FlowNode
  onChange: (config: Record<string, any>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const config = node.data.config || {}

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-gray-200 shadow-xl z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">
          {node.data.blockType === 'trigger' && 'Gatilho'}
          {node.data.blockType === 'message' && 'Mensagem'}
          {node.data.blockType === 'wait' && 'Espera Minha Mensagem'}
          {node.data.blockType === 'condition' && 'Espera Mensagem Dele'}
          {node.data.blockType === 'end' && 'Fim'}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {node.data.blockType === 'trigger' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Gatilho</label>
            <select
              value={config.trigger || 'novo_recuperacao'}
              onChange={(e) => onChange({ ...config, trigger: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="novo_recuperacao">Novo Recuperação</option>
              <option value="novo_pago">Novo Pago</option>
            </select>
          </div>
        )}

        {node.data.blockType === 'message' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Texto da mensagem</label>
              <textarea
                value={config.text || ''}
                onChange={(e) => onChange({ ...config, text: e.target.value })}
                rows={6}
                placeholder="Ex: Olá {nome}, tudo bem?"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Use <code className="bg-gray-100 px-1 rounded">{'{nome}'}</code> para o nome do lead e <code className="bg-gray-100 px-1 rounded">{'{link}'}</code> para o link rastreável.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Link rastreável (opcional)</label>
              <input
                type="text"
                value={config.trackableUrl || ''}
                onChange={(e) => onChange({ ...config, trackableUrl: e.target.value })}
                placeholder="https://exemplo.com/oferta"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Será usado quando a mensagem contiver <code className="bg-gray-100 px-1 rounded">{'{link}'}</code>. Os cliques são registrados.
              </p>
            </div>
          </>
        )}

        {node.data.blockType === 'condition' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">O que verificar</label>
            <select
              value={config.conditionType || 'respondeu'}
              onChange={(e) => onChange({ ...config, conditionType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {Object.entries(CONDITION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {(node.data.blockType === 'wait' || node.data.blockType === 'condition') && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {node.data.blockType === 'wait' ? 'Espera Minha Mensagem' : 'Espera Mensagem Dele'}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={config.value ?? 0}
                onChange={(e) => onChange({ ...config, value: Number(e.target.value) })}
                className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <select
                value={config.unit || 'minutes'}
                onChange={(e) => onChange({ ...config, unit: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {node.data.blockType === 'wait' && <option value="seconds">Segundos</option>}
                <option value="minutes">Minutos</option>
                <option value="hours">Horas</option>
                <option value="days">Dias</option>
              </select>
            </div>
            {node.data.blockType === 'condition' && (
              <p className="text-[11px] text-gray-400 mt-1">
                Se a condição acima for satisfeita dentro desse período, segue pelo ramo "Sim". Caso contrário, pelo "Não".
              </p>
            )}
          </div>
        )}

        {node.data.blockType === 'end' && (
          <p className="text-xs text-gray-500">Este bloco encerra a execução do funil para o lead.</p>
        )}
      </div>

      {node.data.blockType !== 'trigger' && (
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 w-full text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg py-2 transition-colors"
          >
            <Trash size={16} />
            Remover bloco
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Editor ──────────────────────────────────────────────────────────────

export interface FunnelEditorHandle {
  getFlow: () => { nodes: FlowNode[]; edges: Edge[] }
}

export default function FunnelEditor({
  initialNodes,
  initialEdges,
  onChange,
}: {
  initialNodes: FlowNode[]
  initialEdges: Edge[]
  onChange: (nodes: FlowNode[], edges: Edge[]) => void
}) {
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes)
  const [edges, setEdges] = useState<Edge[]>(initialEdges)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const emit = useCallback((n: FlowNode[], e: Edge[]) => {
    onChange(n, e)
  }, [onChange])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => {
      const next = applyNodeChanges(changes, prev) as FlowNode[]
      emit(next, edges)
      return next
    })
  }, [edges, emit])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((prev) => {
      const next = applyEdgeChanges(changes, prev)
      emit(nodes, next)
      return next
    })
  }, [nodes, emit])

  const onConnect = useCallback((connection: Connection) => {
    const label = connection.sourceHandle === 'yes' ? 'Sim' : connection.sourceHandle === 'no' ? 'Não' : undefined
    const color = connection.sourceHandle === 'yes' ? '#10b981' : connection.sourceHandle === 'no' ? '#ef4444' : '#94a3b8'
    setEdges((prev) => {
      const next = addEdge({ ...connection, label, style: { stroke: color }, labelStyle: { fill: color, fontWeight: 700, fontSize: 11 } }, prev)
      emit(nodes, next)
      return next
    })
  }, [nodes, emit])

  const updateNodeConfig = useCallback((id: string, config: Record<string, any>) => {
    setNodes((prev) => {
      const next = prev.map((n) => n.id === id ? { ...n, data: { ...n.data, config } } : n)
      emit(next, edges)
      return next
    })
  }, [edges, emit])

  const deleteNode = useCallback((id: string) => {
    setNodes((prev) => {
      const next = prev.filter((n) => n.id !== id)
      setEdges((prevEdges) => {
        const nextEdges = prevEdges.filter((e) => e.source !== id && e.target !== id)
        emit(next, nextEdges)
        return nextEdges
      })
      return next
    })
    setSelectedId(null)
  }, [emit])

  const addNode = useCallback((blockType: FunnelBlockData['blockType']) => {
    const id = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const defaultConfig: Record<string, Record<string, any>> = {
      message: { text: '', trackableUrl: '' },
      wait: { value: 5, unit: 'minutes' },
      condition: { value: 60, unit: 'minutes' },
      end: {},
      trigger: {},
    }
    const position = { x: 100 + nodes.length * 300, y: 100 + Math.random() * 80 }
    const newNode: FlowNode = { id, type: blockType, position, data: { blockType, config: defaultConfig[blockType] || {} } }
    setNodes((prev) => {
      const next = [...prev, newNode]
      emit(next, edges)
      return next
    })
  }, [nodes.length, edges, emit])

  const selectedNode = nodes.find((n) => n.id === selectedId) || null

  return (
    <ReactFlowProvider>
      <div className="relative w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background />
          <Controls />
        </ReactFlow>

        {/* Toolbar to add new blocks */}
        <div className="absolute top-3 left-3 z-10 bg-white border border-gray-200 rounded-xl shadow-sm p-2 flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1.5 mb-0.5">Adicionar bloco</p>
          <button onClick={() => addNode('message')} className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg px-2 py-1.5 transition-colors">
            <Plus size={14} /> <ChatCircleDots size={14} weight="fill" style={{ color: '#3b82f6' }} /> Mensagem
          </button>
          <button onClick={() => addNode('wait')} className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:bg-amber-50 hover:text-amber-600 rounded-lg px-2 py-1.5 transition-colors">
            <Plus size={14} /> <HourglassSimple size={14} weight="fill" style={{ color: '#f59e0b' }} /> Espera Minha Mensagem
          </button>
          <button onClick={() => addNode('condition')} className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:bg-orange-50 hover:text-orange-600 rounded-lg px-2 py-1.5 transition-colors">
            <Plus size={14} /> <GitBranch size={14} weight="fill" style={{ color: '#f97316' }} /> Espera Mensagem Dele
          </button>
          <button onClick={() => addNode('end')} className="flex items-center gap-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg px-2 py-1.5 transition-colors">
            <Plus size={14} /> <FlagCheckered size={14} weight="fill" style={{ color: '#6b7280' }} /> Fim
          </button>
        </div>

        {selectedNode && (
          <BlockEditorPanel
            node={selectedNode}
            onChange={(config) => updateNodeConfig(selectedNode.id, config)}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </ReactFlowProvider>
  )
}
