'use client'

import { etiquetaDeOrigem } from '@/lib/etiquetasOrigem'

/**
 * Etiqueta quadrada de origem (Agenda / Formulário Agenda / Site / Formulário
 * Site), no canto de cima à direita do card do Pipeline e da conversa no chat.
 * Quadrada de propósito: as redondas são de quem atende e de pagamento, e a
 * forma diferente separa "de onde veio" de "quem cuida".
 */
export default function EtiquetaOrigem({ atributos }: { atributos: Record<string, unknown> | null | undefined }) {
  const etiqueta = etiquetaDeOrigem(atributos)
  if (!etiqueta) return null
  return (
    <span
      className="inline-flex items-center px-1.5 py-[1px] rounded-[3px] border text-[9px] font-bold uppercase tracking-wide leading-[14px] whitespace-nowrap flex-shrink-0"
      style={{ color: etiqueta.cor, backgroundColor: etiqueta.fundo, borderColor: etiqueta.borda }}
      title={etiqueta.rotulo}
    >
      {etiqueta.rotulo}
    </span>
  )
}
