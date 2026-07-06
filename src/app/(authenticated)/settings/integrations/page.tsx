'use client'

import Link from 'next/link'
import { WhatsappLogo, ArrowRight, DeviceMobile, HardDrives, NumberCircleTwo, WebhooksLogo } from '@phosphor-icons/react'

export default function IntegrationsSettingsPage() {
    return (
        <div className="max-w-4xl">
            <h1 className="text-2xl font-bold mb-2">Integrações</h1>
            <p className="text-gray-600 mb-8">Gerencie os canais de comunicação e integrações de terceiros conectados ao Atlas Eye.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-fr">
                {/* WhatsApp Cloud API Card */}
                <Link href="/settings/integrations/whatsapp-cloud-api" className="block group">
                    <div className="bg-white border hover:border-green-500 border-gray-200 rounded-xl p-6 shadow-sm transition-all h-full flex flex-col cursor-pointer min-h-[340px]">
                        <div className="relative mb-6">
                            <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center">
                                <WhatsappLogo size={28} weight="fill" className="text-green-600" />
                            </div>
                            <div className="absolute -top-3 -left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                                Oficial
                            </div>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <HardDrives size={20} className="text-gray-500" />
                            WhatsApp Cloud API
                        </h2>
                        <p className="text-gray-500 text-sm mb-auto">
                            API oficial hospedada pela Meta. Ideal para a maioria das empresas usarem chatbots e templates HSM em escala.
                        </p>
                        <div className="flex items-center text-green-600 font-medium text-sm mt-6 group-hover:text-green-700">
                            Configurar <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                </Link>

                {/* WhatsApp Business API Card */}
                <Link href="/settings/integrations/whatsapp-api" className="block group">
                    <div className="bg-white border hover:border-green-500 border-gray-200 rounded-xl p-6 shadow-sm transition-all h-full flex flex-col cursor-pointer min-h-[340px]">
                        <div className="relative mb-6">
                            <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center">
                                <WhatsappLogo size={28} weight="fill" className="text-green-600" />
                            </div>
                            <div className="absolute -top-3 -left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                                Oficial
                            </div>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <HardDrives size={20} className="text-gray-500" />
                            WhatsApp Business API
                        </h2>
                        <p className="text-gray-500 text-sm mb-auto">
                            API oficial Hospedada no seu próprio servidor (On-Premises). Requer infraestrutura própria para operação.
                        </p>
                        <div className="flex items-center text-green-600 font-medium text-sm mt-6 group-hover:text-green-700">
                            Configurar <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                </Link>

                {/* WhatsApp Lite Card */}
                <Link href="/settings/integrations/whatsapp-lite" className="block group">
                    <div className="bg-white border hover:border-blue-500 border-gray-200 rounded-xl p-6 shadow-sm transition-all h-full flex flex-col cursor-pointer min-h-[340px]">
                        <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center mb-6">
                            <WhatsappLogo size={28} weight="fill" className="text-blue-500" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <DeviceMobile size={20} className="text-gray-500" />
                            WhatsApp Lite
                        </h2>
                        <p className="text-gray-500 text-sm mb-auto">
                            Conecte sua conta pessoal ou de equipe via QR Code. Ideal para fluxos de baixo e médio volume via WhatsApp Web.
                        </p>
                        <div className="flex items-center text-blue-600 font-medium text-sm mt-6 group-hover:text-blue-700">
                            Configurar <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                </Link>
                {/* WhatsApp Evolution Card */}
                <Link href="/settings/integrations/whatsapp-evolution" className="block group">
                    <div className="bg-white border hover:border-purple-500 border-gray-200 rounded-xl p-6 shadow-sm transition-all h-full flex flex-col cursor-pointer min-h-[340px]">
                        <div className="relative mb-6">
                            <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center">
                                <WhatsappLogo size={28} weight="fill" className="text-purple-500" />
                            </div>
                            <div className="absolute -top-3 -left-2 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                                Número 2
                            </div>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <NumberCircleTwo size={20} className="text-gray-500" />
                            WhatsApp Evolution API
                        </h2>
                        <p className="text-gray-500 text-sm mb-auto">
                            Segundo número via QR Code usando a Evolution API. Ideal para alto volume de atendimento sem restrições de template.
                        </p>
                        <div className="flex items-center text-purple-600 font-medium text-sm mt-6 group-hover:text-purple-700">
                            Configurar <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                </Link>
                {/* Outbound Webhook Card */}
                <Link href="/settings/integrations/webhook" className="block group">
                    <div className="bg-white border hover:border-emerald-500 border-gray-200 rounded-xl p-6 shadow-sm transition-all h-full flex flex-col cursor-pointer min-h-[340px]">
                        <div className="w-12 h-12 rounded-lg bg-emerald-50 flex items-center justify-center mb-6">
                            <WebhooksLogo size={28} weight="fill" className="text-emerald-600" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            Webhook de Saída
                        </h2>
                        <p className="text-gray-500 text-sm mb-auto">
                            Envie toda mensagem recebida ou enviada pelo WhatsApp para uma URL externa, no formato Z-API, para seu agente de IA ou automação.
                        </p>
                        <div className="flex items-center text-emerald-600 font-medium text-sm mt-6 group-hover:text-emerald-700">
                            Configurar <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    )
}

