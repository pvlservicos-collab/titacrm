'use client'

/**
 * AuthContext — substitui Supabase Auth
 * Usa NextAuth (useSession) como fonte de verdade
 */
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { OrganizationMember } from '@/lib/types'
import { DEMO_ORG_ID, DEMO_USER_ID, demoCurrentOrganization } from '@/lib/demoData'
import { installDemoFetchInterceptor, setDemoMode } from '@/lib/demoFetch'

interface AuthContextType {
  user: { id: string; email: string; name?: string | null; image?: string | null } | null
  currentOrganization: OrganizationMember | null
  organizationId: string | null
  roleName: string | null
  permissions: any
  isMaster: boolean
  loading: boolean
  error: string | null
  profileName: string | null
  // onboardingCompleted null = ainda não sabemos (carregando OU erro/sem org — os dois
  // casos precisam de tratamento igual: nunca travar o app, ver OnboardingGate).
  // onboardingStatusLoaded existe separado porque esse null sozinho não distingue
  // "ainda buscando" de "resolvido de forma ambígua".
  onboardingCompleted: boolean | null
  onboardingStatusLoaded: boolean
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  currentOrganization: null,
  organizationId: null,
  roleName: null,
  permissions: null,
  isMaster: false,
  loading: true,
  error: null,
  profileName: null,
  onboardingCompleted: null,
  onboardingStatusLoaded: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [currentOrganization, setCurrentOrganization] = useState<OrganizationMember | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null)
  const [onboardingStatusLoaded, setOnboardingStatusLoaded] = useState(false)

  const loading = status === 'loading'
  // TEMPORÁRIO: com o bypass de login (AuthGuard/middleware) nunca existe sessão
  // real, então sem isso `user`/`organizationId` ficavam null pra sempre e todo
  // o app (Pipeline, chats etc) renderizava vazio. Sintetiza uma identidade demo
  // só quando o NextAuth já resolveu que não há sessão de verdade — nunca
  // sobrepõe uma sessão real. Reverter junto com AuthGuard/middleware.
  const isDemoIdentity = status === 'unauthenticated'

  useEffect(() => {
    if (isDemoIdentity) installDemoFetchInterceptor()
    setDemoMode(isDemoIdentity)
  }, [isDemoIdentity])

  const user = session?.user
    ? {
        id: session.user.id as string,
        email: session.user.email as string,
        name: session.user.name,
        image: session.user.image,
      }
    : isDemoIdentity
      ? { id: DEMO_USER_ID, email: 'demo@titacrm.local', name: 'Você (demo)', image: null }
      : null

  const isMaster = (session?.user as any)?.isSuperadmin || false
  const profileName = session?.user?.name || (isDemoIdentity ? 'Você (demo)' : null)

  useEffect(() => {
    if (!user) {
      setCurrentOrganization(null)
      setOrganizationId(null)
      setRoleName(null)
      setPermissions(null)
      setOnboardingCompleted(null)
      setOnboardingStatusLoaded(false)
      return
    }

    if (isDemoIdentity) {
      setCurrentOrganization(demoCurrentOrganization)
      setOrganizationId(DEMO_ORG_ID)
      setRoleName('owner')
      setPermissions({ '*': true })
      setOnboardingCompleted(true)
      setOnboardingStatusLoaded(true)
      return
    }

    async function loadOrganization() {
      try {
        const storedOrgId = typeof window !== 'undefined' ? localStorage.getItem('follem_active_org') : null
        const url = storedOrgId
          ? `/api/users/me?org_id=${storedOrgId}`
          : '/api/users/me'

        const res = await fetch(url)
        if (!res.ok) return

        const data = await res.json()
        if (data?.member) {
          setCurrentOrganization(data.member)
          setOrganizationId(data.member.organization_id)
          setRoleName(data.role?.name || null)
          setPermissions(data.role?.permissions || null)
          setOnboardingCompleted(data.onboarding_completed ?? false)
          if (typeof window !== 'undefined') {
            localStorage.setItem('follem_active_org', data.member.organization_id)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar organização')
      } finally {
        setOnboardingStatusLoaded(true)
      }
    }

    loadOrganization()
  }, [user?.id])

  return (
    <AuthContext.Provider
      value={{
        user,
        currentOrganization,
        organizationId,
        roleName,
        permissions,
        isMaster,
        loading,
        error,
        profileName,
        onboardingCompleted,
        onboardingStatusLoaded,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
