'use client'

/**
 * O "plin" de lead novo — toca em qualquer tela do CRM.
 *
 * Mora no layout autenticado, e não numa página, porque quem está atendendo
 * costuma ficar no Chat ou no Pipeline: um aviso que só tocasse na tela Início
 * não avisaria ninguém.
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

/** Toca o "plin": duas notas curtas, a segunda mais aguda. */
function tocarPlin(ctx: AudioContext) {
  const agora = ctx.currentTime
  // Sol5 e Dó6 — intervalo de quarta, que soa como "aviso" e não como alarme.
  const notas = [
    { hz: 784, em: 0, duracao: 0.18 },
    { hz: 1047, em: 0.09, duracao: 0.22 },
  ]

  for (const nota of notas) {
    const osc = ctx.createOscillator()
    const ganho = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = nota.hz

    // Envelope: sobe quase instantâneo e cai suave. Sem isso o corte seco do
    // oscilador estala (o famoso "click" de WebAudio).
    const inicio = agora + nota.em
    ganho.gain.setValueAtTime(0.0001, inicio)
    ganho.gain.exponentialRampToValueAtTime(0.18, inicio + 0.012)
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

  const aoCriarLead = useCallback(() => {
    if (!ligado) return
    const ctx = ctxRef.current
    if (!ctx) return
    try {
      if (ctx.state === 'suspended') ctx.resume()
      tocarPlin(ctx)
    } catch {
      /* falha ao tocar nunca pode derrubar a tela */
    }
  }, [ligado])

  usePusherChannel(organizationId ? channels.orgLeads(organizationId) : '', {
    [events.LEAD_CREATED]: aoCriarLead,
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
      try { tocarPlin(ctxRef.current) } catch { /* ignora */ }
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
