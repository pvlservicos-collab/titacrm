'use client'

import { useState } from 'react'
import WhatsAppEmbeddedSignup from '@/components/Settings/WhatsAppEmbeddedSignup'
import WhatsAppNumerosPanel from '@/components/Settings/WhatsAppNumerosPanel'
import WhatsAppConfigManual from '@/components/Settings/WhatsAppConfigManual'

export default function IntegracaoConectarPage() {
  // Muda depois de conectar pelo Embedded Signup, pra lista de números recarregar.
  const [conexoes, setConexoes] = useState(0)
  return (
    <div className="max-w-3xl space-y-4">
      <WhatsAppEmbeddedSignup onConectado={() => setConexoes((n) => n + 1)} />
      <WhatsAppNumerosPanel recarregarQuando={conexoes} />
      {/* Quem já tem as credenciais na mão cola aqui, sem passar pelo botão da
          Meta (que exige app aprovado e configuração de login criada). */}
      <WhatsAppConfigManual onSalvo={() => setConexoes((n) => n + 1)} />
    </div>
  )
}
