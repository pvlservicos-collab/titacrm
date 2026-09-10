'use client'

/**
 * O "plin" de lead novo — toca em qualquer tela do CRM.
 *
 * Mora no layout autenticado, e não numa página, porque quem está atendendo
 * costuma ficar no Chat ou no Pipeline: um aviso que só tocasse na tela Início
 * não avisaria ninguém.
 *
 * São DOIS avisos: um pequeno pra lead novo e um grande pra quando o lead
 * responde a automação — o segundo é o que exige alguém agora.
 *
 * O som é sintetizado na hora (WebAudio), sem arquivo de áudio. Dois motivos:
 * não acrescenta um binário ao repositório nem uma requisição a cada carga da
 * página, e o volume/tom ficam sob controle — um mp3 de "notificação" qualquer
 * costuma vir alto demais para tocar a cada lead num escritório.
 *
 * Silenciável: a preferência fica no localStorage do navegador de cada pessoa,
 * porque é escolha de quem está ouvindo, não configuração da organização.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { usePusherChannel } from '@/hooks/usePusher'
import { useAuth } from '@/hooks'
import { channels, events } from '@/lib/realtime'

const CHAVE_PREFERENCIA = 'crm:som-novo-lead'

interface Nota {
  hz: number
  /** Segundos depois do início do toque. */
  em: number
  duracao: number
  volume: number
}

/**
 * Dois avisos com peso diferente, de propósito.
 *
 * LEAD NOVO é informação: alguém entrou, será atendido em algum momento. Duas
 * notinhas curtas e baixas, do tipo que não interrompe quem está no meio de uma
 * conversa.
 *
 * RESPOSTA À AUTOMAÇÃO é urgência: a pessoa que a IA abordou respondeu, e a
 * janela pra um humano entrar é agora. Toca mais alto, mais grave e mais longo —
 * três notas subindo, que é o padrão que o ouvido lê como "vem cá".
 *
 * Os volumes (0.14 e 0.42) foram escolhidos pra diferença ser óbvia sem o
 * segundo assustar: é um escritório, isso vai tocar o dia inteiro.
 */
const PLIN_LEAD_NOVO: Nota[] = [
  { hz: 784, em: 0, duracao: 0.15, volume: 0.14 },   // Sol5
  { hz: 1047, em: 0.08, duracao: 0.18, volume: 0.12 }, // Dó6
]

const TOQUE_RESPOSTA: Nota[] = [
  { hz: 523, em: 0, duracao: 0.28, volume: 0.42 },    // Dó5
  { hz: 659, em: 0.15, duracao: 0.28, volume: 0.42 }, // Mi5
  { hz: 880, em: 0.30, duracao: 0.55, volume: 0.40 }, // Lá5, sustentado
]

function tocar(ctx: AudioContext, notas: Nota[]) {
  const agora = ctx.currentTime

  for (const nota of notas) {
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = nota.hz

    // Envelope: sobe quase instantâneo e cai suave. Sem isso o corte seco do
    // oscilador estala (o famoso "click" de WebAudio).
    const inicio = agora + nota.em
    ganho.gain.setValueAtTime(0.0001, inicio)
    ganho.gain.exponentialRampToValueAtTime(nota.volume, inicio + 0.012)
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + nota.duracao)

    osc.connect(ganho)
    ganho.connect(ctx.destination)
    osc.start(inicio)
    osc.stop(inicio + nota.duracao + 0.02)
  }
}

export default function SomNovoLead() {
  const { organizationId } = useAuth()
  const [ligado, setLigado] = useState(true)
  const [montado, setMontado] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)

  // Lê a preferência só no cliente — no servidor não existe localStorage, e ler
  // no primeiro render causaria divergência de hidratação.
  useEffect(() => {
    setMontado(true)
    try {
      setLigado(localStorage.getItem(CHAVE_PREFERENCIA) !== 'off')
    } catch {
      /* navegador com armazenamento bloqueado: fica ligado, que é o padrão */
    }
  }, [])

  /**
   * O navegador só deixa tocar áudio depois de algum clique/tecla na página.
   * Criar (ou retomar) o AudioContext no primeiro gesto deixa ele pronto pra
   * quando o lead chegar — sem isso, o primeiro "plin" do dia seria engolido em
   * silêncio, justamente o que a pessoa está esperando ouvir.
   */
  useEffect(() => {
    const preparar = () => {
      try {
        if (!ctxRef.current) {
          const Ctx = window.AudioContext || (window as any).webkitAudioContext
          if (Ctx) ctxRef.current = new Ctx()
        }
        if (ctxRef.current?.state === 'suspended') ctxRef.current.resume()
      } catch {
        /* sem áudio disponível — o resto do app segue normal */
      }
    }
    window.addEventListener('pointerdown', preparar, { once: false })
    window.addEventListener('keydown', preparar, { once: false })
    return () => {
      window.removeEventListener('pointerdown', preparar)
      window.removeEventListener('keydown', preparar)
    }
  }, [])

  const avisar = useCallback((notas: Nota[]) => {
    if (!ligado) return
    const ctx = ctxRef.current
    if (!ctx) return
    try {
      if (ctx.state === 'suspended') ctx.resume()
      tocar(ctx, notas)
    } catch {
      /* falha ao tocar nunca pode derrubar a tela */
    }
  }, [ligado])

  usePusherChannel(organizationId ? channels.orgLeads(organizationId) : '', {
    [events.LEAD_CREATED]: () => avisar(PLIN_LEAD_NOVO),
    [events.LEAD_REPLIED_AUTOMATION]: () => avisar(TOQUE_RESPOSTA),
  })

  function alternar() {
    const novo = !ligado
    setLigado(novo)
    try {
      localStorage.setItem(CHAVE_PREFERENCIA, novo ? 'on' : 'off')
    } catch {
      /* sem armazenamento: vale só para esta sessão */
    }
    // Toca ao LIGAR pra pessoa ouvir o que acabou de habilitar — e, de quebra,
    // isso confirma que o áudio do navegador está liberado.
    if (novo && ctxRef.current) {
      try { tocar(ctxRef.current, PLIN_LEAD_NOVO) } catch { /* ignora */ }
    }
  }

  if (!montado) return null

  return (
    <button
      onClick={alternar}
      title={ligado ? 'Som de lead novo ligado — clique para silenciar' : 'Som de lead novo silenciado'}
      aria-label={ligado ? 'Silenciar som de lead novo' : 'Ativar som de lead novo'}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 right-4 z-40 w-9 h-9 rounded-full glass-raised flex items-center justify-center text-muted hover:text-ink transition-colors"
    >
      {ligado ? <SpeakerHigh size={15} weight="bold" /> : <SpeakerSlash size={15} weight="bold" />}
    </button>
  )
}
