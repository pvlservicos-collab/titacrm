'use client'

/**
 * AuthGuard — substitui verificação de sessão Supabase
 * Usa useSession do NextAuth
 */
import { useEffect, ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/Shared/LoadingSpinner'

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-void">
        <LoadingSpinner text="Carregando..." size="lg" />
      </div>
    )
  }

  if (!session) return null

  return <>{children}</>
}
