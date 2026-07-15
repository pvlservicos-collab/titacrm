'use client'

import { useState } from 'react'
import { Bell, X } from '@phosphor-icons/react'
import { usePushNotifications } from '@/hooks/usePushNotifications'

// Convite pra ativar notificação — aparece toda vez que o app carrega enquanto a
// pessoa não decidiu (nem aceitou nem bloqueou). Diferente do InstallAppBanner, não
// tem cooldown de dias ao fechar: fechar só esconde nesse carregamento, no próximo
// volta a aparecer, até ela realmente aceitar ou bloquear pelo navegador. "Aceitou"
// já fica salvo sozinho — é a inscrição de push de verdade no navegador
// (pushManager.getSubscription()), não precisa de nada a mais pra lembrar.
export default function PushPermissionBanner() {
  const { status, subscribe } = usePushNotifications()
  const [dismissed, setDismissed] = useState(false)
  const [activating, setActivating] = useState(false)

  if (dismissed || status !== 'unsubscribed') return null

  const handleActivate = async () => {
    setActivating(true)
    try {
      await subscribe()
    } finally {
      setActivating(false)
    }
  }

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top)+8px)] left-3 right-3 z-[70] flex justify-center">
      <div className="w-full max-w-md bg-[#202c33] border border-[#2f3b44] rounded-2xl shadow-2xl p-4 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: '#00B8D91a' }}
        >
          <Bell size={20} weight="fill" style={{ color: '#00B8D9' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#e9edef]">Ativar notificações</p>
          <p className="text-xs text-[#8696a0] mt-0.5">Saiba na hora quando chegar uma mensagem nova, mesmo com o app fechado.</p>
          <button
            onClick={handleActivate}
            disabled={activating}
            className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60"
            style={{ backgroundColor: '#00B8D9' }}
          >
            {activating ? 'Ativando...' : 'Ativar notificações'}
          </button>
        </div>
        <button onClick={() => setDismissed(true)} className="text-[#8696a0] hover:text-[#e9edef] transition-colors flex-shrink-0" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
