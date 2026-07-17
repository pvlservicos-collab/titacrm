'use client'

/**
 * OnboardingGate — redireciona pra /welcome quem ainda não completou o onboarding.
 * onboardingCompleted === null (erro de rede, conta sem organization_members, etc.)
 * é tratado como "libera acesso" de propósito: nunca queremos travar o app inteiro
 * num spinner por causa de um estado ambíguo que não é o caso normal.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { onboardingCompleted, loading, onboardingStatusLoaded } = useAuth()
  const router = useRouter()

  const stillResolving = loading || !onboardingStatusLoaded
  const needsOnboarding = !stillResolving && onboardingCompleted === false

  useEffect(() => {
    if (needsOnboarding) router.replace('/welcome')
  }, [needsOnboarding, router])

  if (stillResolving || needsOnboarding) {
    return (
      <div className="flex items-center justify-center h-screen bg-void">
        <LoadingSpinner text="Carregando..." size="lg" />
      </div>
    )
  }

  return <>{children}</>
}
