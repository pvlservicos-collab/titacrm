'use client'

import { ETIQUETAS_ORIGEM, type ChaveOrigem } from '@/lib/etiquetasOrigem'

const ORDEM: ChaveOrigem[] = ['agenda', 'formulario_agenda', 'site', 'formulario_site']

interface FiltroOrigemProps {
  selecionadas: ChaveOrigem[]
  /** Quantos leads do pipeline têm cada etiqueta (sem contar este filtro). */
  contagens: Record<ChaveOrigem, number>
  onChange: (proximas: ChaveOrigem[]) => void
}

/**
 * Filtro do Pipeline pelas etiquetas quadradas de origem (Agenda / Formulário
 * Agenda / Site / Formulário Site). Multi-seleção: marcar duas mostra os leads
 * de qualquer uma das duas; sem nenhuma marcada, mostra todos.
 *
 * Os chips repetem a forma e as cores da etiqueta do card (EtiquetaOrigem) —
 * é a mesma coisa que a pessoa vê no card, agora clicável.
 */
export default function FiltroOrigem({ selecionadas, contagens, onChange }: FiltroOrigemProps) {
  const alternar = (chave: ChaveOrigem) =>
    onChange(selecionadas.includes(chave) ? selecionadas.filter((c) => c !== chave) : [...selecionadas, chave])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Origem</span>
      {ORDEM.map((chave) => {
        const etiqueta = ETIQUETAS_ORIGEM[chave]
        const ativa = selecionadas.includes(chave)
        return (
          <button
            key={chave}
            type="button"
            onClick={() => alternar(chave)}
            aria-pressed={ativa}
            className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-[3px] border text-[10px] font-bold uppercase tracking-wide leading-[14px] whitespace-nowrap transition-all ${
              ativa ? 'shadow-[0_0_0_1px_currentColor]' : 'opacity-60 hover:opacity-100'
            }`}
            style={
              ativa
                ? { color: etiqueta.cor, backgroundColor: etiqueta.fundo, borderColor: etiqueta.borda }
                : {
                    // "Formulário Site" tem texto escuro (é sólido quando ativo); sem
                    // o fundo, esse texto some no tema escuro — usa o dourado do fundo.
                    color: etiqueta.chave === 'formulario_site' ? etiqueta.fundo : etiqueta.cor,
                    borderColor: etiqueta.borda,
                    backgroundColor: 'transparent',
                  }
            }
            title={ativa ? `Tirar filtro: ${etiqueta.rotulo}` : `Mostrar só: ${etiqueta.rotulo}`}
          >
            {etiqueta.rotulo}
            <span className="tabular-nums opacity-80">{contagens[chave] ?? 0}</span>
          </button>
        )
      })}
      {selecionadas.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[11px] text-muted hover:text-ink underline underline-offset-2 transition-colors"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
