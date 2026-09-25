'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowsClockwise, CheckCircle, QrCode, WarningCircle, PlugsConnected } from '@phosphor-icons/react'

export interface LinhaEvolution {
  id: string
  nome: string
  instanceName: string | null
  /** O número que essa linha deve ter (só dígitos). */
  numeroEsperado?: string | null
  estado: 'conectado' | 'conectando' | 'desconectado' | 'nao_criada' | 'erro'
  numero?: string
  nomeNoWhatsapp?: string
  erro?: string
}

/** Chave da aba dos números antigos (Z-API desligado). */
export const ABA_ANTIGO = 'antigo'

function formatarNumero(n?: string) {
  if (!n) return null
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${n}`
}

/** Mesmo número, com ou sem o 9 do celular (o WhatsApp antigo não o traz). */
function mesmoNumero(a?: string | null, b?: string | null) {
  if (!a || !b) return true
  const semNove = (n: string) => n.replace(/^(55\d{2})9(\d{8})$/, '$1$2')
  return semNove(a) === semNove(b)
}

interface Props {
  linhas: LinhaEvolution[]
  abaAtiva: string
  onMudarAba: (aba: string) => void
  /** Rele o estado das linhas (depois de conectar, ou pra sair de um erro). */
  onAtualizar: () => Promise<void> | void
}

export default function LinhasEvolution({ linhas, abaAtiva, onMudarAba, onAtualizar }: Props) {
  const linha = linhas.find((l) => l.id === abaAtiva) ?? null
  const [qr, setQr] = useState<{ imagem?: string; codigo?: string } | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erroQr, setErroQr] = useState<string | null>(null)
  const onAtualizarRef = useRef(onAtualizar)
  onAtualizarRef.current = onAtualizar

  // Trocar de aba descarta o QR da anterior — ele é de outro número.
  useEffect(() => { setQr(null); setErroQr(null) }, [abaAtiva])

  // Com o QR na tela, confere a cada 3s se a pessoa já escaneou.
  useEffect(() => {
    if (!qr) return
    const t = setInterval(() => { void onAtualizarRef.current() }, 3000)
    return () => clearInterval(t)
  }, [qr])

  // Conectou: some o QR.
  useEffect(() => {
    if (linha?.estado === 'conectado') setQr(null)
  }, [linha?.estado])

  async function conectar() {
    if (!linha) return
    setGerando(true)
    setErroQr(null)
    try {
      const res = await fetch(`/api/evolution/linhas/${linha.id}/conectar`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Não deu pra gerar o QR Code.')
      const d = j.data
      if (d.estado === 'erro') throw new Error(d.erro || 'Não deu pra gerar o QR Code.')
      if (d.estado === 'conectado') { await onAtualizar(); return }
      if (!d.qrCode && !d.codigoDePareamento) throw new Error('O QR Code ainda não ficou pronto — tente de novo em alguns segundos.')
      setQr({ imagem: d.qrCode, codigo: d.codigoDePareamento })
    } catch (e: any) {
      setErroQr(e.message)
    } finally {
      setGerando(false)
    }
  }

  const abas = [
    ...linhas.map((l) => ({ id: l.id, rotulo: l.nome, estado: l.estado as LinhaEvolution['estado'] | null })),
    { id: ABA_ANTIGO, rotulo: 'Número antigo', estado: null },
  ]

  return (
    <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--chat-border)', backgroundColor: 'var(--chat-bg-conversation)' }}>
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {abas.map((a) => {
          const ativa = a.id === abaAtiva
          const cor = a.estado === 'conectado' ? '#22c55e' : a.estado === null ? 'transparent' : '#ef4444'
          return (
            <button
              key={a.id}
              onClick={() => onMudarAba(a.id)}
              aria-pressed={ativa}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              style={ativa
                ? { backgroundColor: 'var(--chat-accent)', color: '#111', border: '1px solid var(--chat-accent)' }
                : { backgroundColor: 'transparent', color: 'var(--chat-text-secondary)', border: '1px solid var(--chat-border)' }}
            >
              {a.estado !== null && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cor }} aria-hidden />
              )}
              {a.rotulo}
            </button>
          )
        })}
      </div>

      <div className="px-4 py-3">
        {abaAtiva === ABA_ANTIGO || !linha ? (
          <div className="flex items-center gap-2.5 text-xs" style={{ color: 'var(--chat-text-secondary)' }}>
            <WarningCircle size={16} weight="fill" style={{ color: 'var(--chat-accent)' }} />
            <span>
              {linhas.length === 0 && abaAtiva !== ABA_ANTIGO
                ? 'Nenhuma linha cadastrada ainda.'
                : 'Números antigos, hoje desligados: só leitura. Quem escreve por um número novo sai daqui.'}
            </span>
          </div>
        ) : (
          <div
            className="rounded-xl p-3.5 flex flex-col gap-3"
            style={{ backgroundColor: 'var(--chat-bg-field)', border: '1px solid var(--chat-border)' }}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                {linha.estado === 'conectado'
                  ? <CheckCircle size={24} weight="fill" style={{ color: '#22c55e' }} />
                  : <PlugsConnected size={24} weight="fill" style={{ color: linha.estado === 'erro' ? '#ef4444' : 'var(--chat-text-tertiary)' }} />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--chat-text-primary)' }}>
                    {linha.nome}{' '}
                    <span style={{ color: linha.estado === 'conectado' ? '#22c55e' : 'var(--chat-text-secondary)' }}>
                      {linha.estado === 'conectado' ? '· Conectado'
                        : linha.estado === 'conectando' ? '· Conectando…'
                        : linha.estado === 'erro' ? '· Sem resposta do servidor'
                        : '· Desconectado'}
                    </span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--chat-text-tertiary)' }}>
                    {linha.estado === 'conectado'
                      ? [formatarNumero(linha.numero), 'só observar e responder à mão — sem automação'].filter(Boolean).join(' · ')
                      : linha.estado === 'erro'
                        ? (linha.erro || 'Não consegui falar com a Evolution.')
                        : `Escaneie com o WhatsApp de ${formatarNumero(linha.numeroEsperado ?? undefined) ?? linha.nome}.`}
                  </p>
                  {linha.estado === 'conectado' && !mesmoNumero(linha.numero, linha.numeroEsperado) && (
                    <p className="text-xs font-semibold mt-0.5" style={{ color: '#ef4444' }}>
                      Atenção: este é o número {formatarNumero(linha.numero)}, e o esperado para {linha.nome} é {formatarNumero(linha.numeroEsperado ?? undefined)}.
                    </p>
                  )}
                </div>
              </div>

              {linha.estado !== 'conectado' && linha.estado !== 'erro' && (
                <button
                  onClick={conectar}
                  disabled={gerando}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
                  style={{ backgroundColor: 'var(--chat-accent)', color: '#111' }}
                >
                  {qr ? <ArrowsClockwise size={16} weight="bold" /> : <QrCode size={16} weight="bold" />}
                  {gerando ? 'Gerando…' : qr ? 'Gerar novo QR Code' : 'Conectar'}
                </button>
              )}
              {linha.estado === 'erro' && (
                <button
                  onClick={() => void onAtualizar()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ border: '1px solid var(--chat-border)', color: 'var(--chat-text-primary)' }}
                >
                  <ArrowsClockwise size={16} weight="bold" /> Tentar de novo
                </button>
              )}
            </div>

            {erroQr && (
              <p className="text-xs" style={{ color: '#ef4444' }}>{erroQr}</p>
            )}

            {qr && linha.estado !== 'conectado' && (
              <div className="flex items-center gap-5 flex-wrap">
                {qr.imagem && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr.imagem} alt={`QR Code de ${linha.nome}`} className="w-44 h-44 rounded-lg bg-white p-2" />
                )}
                <ol className="text-xs leading-relaxed list-decimal pl-4" style={{ color: 'var(--chat-text-secondary)' }}>
                  <li>No celular de {linha.nome}, abra o WhatsApp.</li>
                  <li>Toque em <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>.</li>
                  <li>Aponte a câmera para este QR Code.</li>
                  <li>O QR expira em cerca de 1 minuto — se expirar, gere outro.</li>
                  {qr.codigo && <li>Sem câmera? Use o código de pareamento: <strong>{qr.codigo}</strong></li>}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
