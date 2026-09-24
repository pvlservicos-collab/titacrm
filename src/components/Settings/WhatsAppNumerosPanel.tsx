'use client'
import { BASE_PATH } from '@/lib/base-path'

import { useCallback, useEffect, useState } from 'react'
import { ArrowClockwise, CircleNotch, Phone, WarningCircle, CreditCard } from '@phosphor-icons/react'

/**
 * Números da conta do WhatsApp conectada, direto da Meta: status, qualidade e
 * verificação, com as ações do app modelo (registrar, descadastrar, pedir e
 * confirmar código) e "usar para enviar", que escolhe o número do CRM.
 */

interface Numero {
  id: string
  display_phone_number: string
  verified_name: string
  status?: string
  quality_rating?: string
  code_verification_status?: string
  name_status?: string
}

interface Dados {
  waba_id: string
  phone_number_id_ativo: string
  coexistencia?: boolean
  pagamento: boolean | null
  numeros: Numero[]
}

const ROTULO_STATUS: Record<string, string> = {
  CONNECTED: 'Conectado',
  PENDING: 'Pendente',
  DISCONNECTED: 'Desconectado',
  FLAGGED: 'Sinalizado',
  RESTRICTED: 'Restrito',
  BANNED: 'Banido',
  UNVERIFIED: 'Não verificado',
  MIGRATED: 'Migrado',
}

const COR_QUALIDADE: Record<string, string> = {
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-400',
  RED: 'bg-red-500',
}

export default function WhatsAppNumerosPanel({ recarregarQuando = 0 }: { recarregarQuando?: number }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/phones`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Não consegui buscar os números na Meta.')
      setDados(j)
    } catch (e: any) {
      setErro(e.message)
      setDados(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar, recarregarQuando])

  const agir = async (id: string, acao: string, extra: Record<string, string> = {}, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return
    setOcupado(`${id}:${acao}`)
    setAviso(null)
    try {
      const res = await fetch(`${BASE_PATH}/api/integrations/whatsapp-cloud/phones/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, ...extra }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'A Meta recusou a ação.')
      setAviso(
        acao === 'pedir-codigo' ? 'Código enviado. Digite os 6 dígitos e confirme.'
          : acao === 'verificar-codigo' ? 'Número verificado.'
            : acao === 'registrar' ? 'Número registrado na Cloud API.'
              : acao === 'descadastrar' ? 'Número descadastrado.'
                : 'O CRM passou a enviar por este número.',
      )
      await carregar()
    } catch (e: any) {
      setAviso(e.message)
    } finally {
      setOcupado(null)
    }
  }

  const botao = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-line bg-panel-2 text-ink hover:border-accent transition disabled:opacity-50'

  return (
    <div className="bg-panel border border-line rounded-xl p-6 sm:p-8 mb-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Números da conta</h2>
          {dados && <p className="text-xs text-muted mt-0.5">WABA {dados.waba_id}</p>}
        </div>
        <button onClick={carregar} className={`${botao} inline-flex items-center gap-1.5`} disabled={carregando}>
          <ArrowClockwise size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {erro && <p className="text-sm text-red-500 flex items-start gap-2"><WarningCircle size={16} className="mt-0.5 flex-shrink-0" />{erro}</p>}

      {dados?.pagamento === false && (
        <p className="mb-4 text-sm text-amber-500 flex items-start gap-2">
          <CreditCard size={16} className="mt-0.5 flex-shrink-0" />
          A conta está sem forma de pagamento. Templates pagos (marketing e utilidade) serão recusados pela Meta.
        </p>
      )}

      {aviso && <p className="mb-4 text-sm text-ink bg-panel-2 border border-line rounded-lg px-3 py-2">{aviso}</p>}

      {dados && dados.numeros.length === 0 && <p className="text-sm text-muted">Nenhum número nesta conta.</p>}

      <div className="space-y-3">
        {dados?.numeros.map((n) => {
          const ativo = n.id === dados.phone_number_id_ativo
          // Coexistencia: registrar/descadastrar tiraria o numero do aplicativo do celular.
          const noAplicativo = ativo && !!dados.coexistencia
          const ocupadoAqui = ocupado?.startsWith(`${n.id}:`)
          const precisaVerificar = !noAplicativo && n.code_verification_status && n.code_verification_status !== 'VERIFIED' && n.code_verification_status !== 'EXPIRED'
          return (
            <div key={n.id} className={`rounded-lg border p-4 ${ativo ? 'border-accent bg-accent/5' : 'border-line bg-panel-2'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Phone size={18} className="text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{n.display_phone_number} <span className="font-normal text-muted">· {n.verified_name}</span></p>
                    <p className="text-xs text-muted flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <span>{ROTULO_STATUS[n.status || ''] || n.status || '—'}</span>
                      {n.quality_rating && (
                        <span className="inline-flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${COR_QUALIDADE[n.quality_rating] || 'bg-muted'}`} />
                          Qualidade {n.quality_rating}
                        </span>
                      )}
                      {n.code_verification_status && <span>Verificação: {n.code_verification_status}</span>}
                      <span>ID {n.id}</span>
                    </p>
                  </div>
                </div>
                {ativo && <span className="text-[10px] font-bold uppercase tracking-wider text-accent">Número do CRM{noAplicativo ? ' · também no aplicativo' : ''}</span>}
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                {!ativo && (
                  <button className={botao} disabled={!!ocupado} onClick={() => agir(n.id, 'usar')}>Usar para enviar</button>
                )}
                {!noAplicativo && (
                  <>
                    <button className={botao} disabled={!!ocupado} onClick={() => agir(n.id, 'registrar')}>Registrar</button>
                    <button className={botao} disabled={!!ocupado}
                      onClick={() => agir(n.id, 'descadastrar', {}, `Descadastrar ${n.display_phone_number}? Ele para de enviar e receber pela API Oficial até ser registrado de novo.`)}>
                      Descadastrar
                    </button>
                  </>
                )}
                {precisaVerificar && (
                  <>
                    <button className={botao} disabled={!!ocupado} onClick={() => agir(n.id, 'pedir-codigo', { metodo: 'SMS' })}>Pedir código (SMS)</button>
                    <input
                      value={codigos[n.id] || ''}
                      onChange={(e) => setCodigos((c) => ({ ...c, [n.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      placeholder="000000"
                      inputMode="numeric"
                      className="w-24 px-2 py-1.5 text-xs rounded-lg bg-panel border border-line text-ink tracking-widest"
                    />
                    <button className={botao} disabled={!!ocupado || (codigos[n.id] || '').length !== 6}
                      onClick={() => agir(n.id, 'verificar-codigo', { codigo: codigos[n.id] || '' })}>
                      Confirmar código
                    </button>
                  </>
                )}
                {ocupadoAqui && <CircleNotch size={16} className="animate-spin text-muted" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
