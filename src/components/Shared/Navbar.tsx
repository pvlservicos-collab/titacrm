'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ChartBar,
  Kanban,
  ChatCircleDots,
  Users,
  MagnifyingGlass,
  Plus,
  CaretDown,
  Gear,
  SignOut,
  Buildings,
  FlowArrow,
  Truck,
  CurrencyDollar,
  Sun,
  Moon,
  List,
  X,
} from '@phosphor-icons/react'
import { useAuth, usePipeline } from '@/hooks'
import { useTheme } from '@/contexts/ThemeContext'
import { signOut } from 'next-auth/react'
import FilterButton from '@/components/Shared/FilterButton'
import GlobalSearch from '@/components/Shared/GlobalSearch'
import NotificationDropdown from '@/components/Shared/NotificationDropdown'
import { usePipelineFilters } from '@/contexts/FilterContext'

const NAV_ITEMS = [
  { label: 'Pipeline', href: '/pipeline', icon: Kanban },
  { label: 'Chat', href: '/chat', icon: ChatCircleDots },
  { label: 'Funil de Mensagens', href: '/funnels', icon: FlowArrow },
  { label: 'Métricas', href: '/metrics', icon: ChartBar },
  { label: 'Logística', href: '/logistica', icon: Truck },
  { label: 'Financeiro', href: '/financeiro', icon: CurrencyDollar },
  { label: 'Configurações', href: '/settings/organization', icon: Gear },
]

// Destinos mais usados — ficam sempre à mão na barra inferior do celular.
// Os demais (Configurações, Funil de Mensagens, Métricas) ficam atrás do "Mais",
// que abre a mesma gaveta lateral — só um sistema de navegação por vez no celular.
const MOBILE_TAB_LABELS = ['Chat', 'Pipeline', 'Logística', 'Financeiro']

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { organizationId, permissions, isMaster, roleName, user, profileName, loading: authLoading } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const searchParams = useSearchParams()
  const pipelineIdParam = searchParams.get('pipelineId')
  const { pipelines, selectedPipelineId } = usePipeline(organizationId || '')
  const activePipelineId = pipelineIdParam || selectedPipelineId

  const { setFilters } = usePipelineFilters()
  const [showPipelineDropdown, setShowPipelineDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false) // Added
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  useEffect(() => { setShowMobileMenu(false) }, [pathname])

  const userDropdownRef = useRef<HTMLDivElement>(null) // Added

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Assuming there's a ref for pipeline dropdown if needed, but the original code uses onMouseEnter/onMouseLeave
      // For user dropdown:
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login', redirect: false })
    router.push('/login')
  }

  // Get user name or email for display
  const displayName = profileName || user?.name || user?.email || 'Usuário'

  // Create initials for avatar (e.g. "Mariana Silva" -> "MS")
  const getInitials = (name: string) => {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  const initials = getInitials(displayName)
  const avatarUrl = user?.image

  const isItemVisible = (label: string): boolean => {
    // Superadmins and org Admins see everything
    if (isMaster || roleName?.toLowerCase() === 'administrador' || roleName?.toLowerCase() === 'owner') return true

    // If permissions aren't loaded yet, default to false (except Dashboard maybe, but safer to hide until loaded)
    if (!permissions) return false

    // Evaluate based on the JSON settings
    switch (label) {
      case 'Dashboard': return !!permissions.settings?.view_dashboard
      case 'Leads': return !!permissions.settings?.view_leads
      case 'Pipeline': return !!permissions.settings?.view_pipeline
      case 'Chat': return !!permissions.settings?.view_chat
      case 'Logística': return !!permissions.settings?.view_logistica
      case 'Financeiro': return !!permissions.settings?.view_financeiro
      case 'Funil de Mensagens': return !!permissions.settings?.view_funnels
      case 'Logs': return !!permissions.settings?.view_logs
      case 'Métricas': return !!permissions.settings?.view_metrics
      case 'Configurações': return !!permissions.settings?.view_settings
      default: return false
    }
  }

  return (
    <>
    <nav className="app-safe-top dark-nav bg-white dark:bg-[#161b22] border-b border-gray-200 dark:border-[#30363d] px-4 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-50">
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <img src="/logos/Atlas.svg" alt="Atlas Eye Logo" className="h-6 w-auto object-contain" />
          <span className="font-display font-bold text-gray-900 dark:text-[#e6edf3] hidden sm:inline">Atlas Eye</span>
        </Link>

        {/* Nav Tabs (desktop) */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.filter(item => isItemVisible(item.label)).map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))
            const Icon = item.icon

            // Special handling for Pipeline with multiple pipelines
            if (item.label === 'Pipeline' && pipelines.length > 1) {
              return (
                <div
                  key={item.href}
                  className="relative"
                  onMouseEnter={() => setShowPipelineDropdown(true)}
                  onMouseLeave={() => setShowPipelineDropdown(false)}
                >
                  <Link
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-[#8b949e] hover:bg-gray-100 dark:hover:bg-[#21262d] hover:text-gray-900 dark:hover:text-[#e6edf3]'
                      }`}
                  >
                    <Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                    {item.label}
                    <CaretDown size={12} className="ml-1" />
                  </Link>

                  {/* Dropdown */}
                  {showPipelineDropdown && (
                    <div className="absolute top-full left-0 pt-2 w-48 z-50">
                      <div className="bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                        {pipelines.map((pipeline) => (
                          <button
                            key={pipeline.id}
                            onClick={() => {
                              router.push(`/pipeline?pipelineId=${pipeline.id}`)
                              setShowPipelineDropdown(false)
                            }}
                            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${activePipelineId === pipeline.id
                              ? 'bg-blue-50 text-blue-600 font-semibold'
                              : 'text-gray-700'
                              }`}
                          >
                            {pipeline.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            // Default rendering for other nav items
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <Icon size={16} weight={isActive ? 'fill' : 'regular'} />
                {item.label}
              </Link>
            )
          })}

          {/* Conditional Filter Button for Pipeline */}
          {pathname.startsWith('/pipeline') && organizationId && (
            <>
              <div className="w-[1px] h-4 bg-gray-300 mx-1"></div>
              <FilterButton organizationId={organizationId} onFilterChange={setFilters} />
            </>
          )}
        </div>
      </div>

      {/* Right: Search + Notifications + User + Button */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Busca — input+dropdown no desktop, ícone que abre overlay de tela cheia no celular */}
        <GlobalSearch />

        {/* Notifications */}
        <NotificationDropdown />

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Modo claro' : 'Modo escuro'}
          className="app-tap-target w-11 h-11 flex items-center justify-center rounded-lg text-gray-500 dark:text-[#8b949e] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
        >
          {isDark ? <Sun size={18} weight="fill" className="text-yellow-400" /> : <Moon size={18} />}
        </button>

        {/* User Dropdown */}
        <div className="relative" ref={userDropdownRef}>
          <div
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
          >
            {avatarUrl ? (
              <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden border border-gray-200">
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                <span className="text-purple-600 text-xs font-bold">{initials}</span>
              </div>
            )}
            <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-[#adbac7] truncate max-w-[120px]">{displayName}</span>
            <CaretDown size={14} className={`hidden sm:block text-gray-400 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
          </div>

          {/* User Menu Popup */}
          {showUserDropdown && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1c2128] border border-gray-100 dark:border-[#30363d] rounded-xl shadow-lg shadow-gray-200/50 py-1 z-50 animate-in fade-in slide-in-from-top-2">
              <Link
                href="/workspaces"
                onClick={() => setShowUserDropdown(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors w-full text-left"
              >
                <Buildings size={16} />
                <span>Organizações</span>
              </Link>
              <Link
                href="/settings/profile"
                onClick={() => setShowUserDropdown(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors w-full text-left"
              >
                <Gear size={16} />
                <span>Configurações do Perfil</span>
              </Link>
              <div className="h-px bg-gray-100 my-1 mx-2"></div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors w-full text-left"
              >
                <SignOut size={16} />
                <span>Sair da conta</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>

    {/* Menu mobile — mesmos NAV_ITEMS da barra desktop, em lista vertical */}
    {showMobileMenu && (
      <div className="md:hidden fixed inset-0 z-[60]">
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setShowMobileMenu(false)}
        />
        <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white dark:bg-[#161b22] shadow-xl flex flex-col">
          <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 dark:border-[#30363d]">
            <Link href="/" className="flex items-center gap-2" onClick={() => setShowMobileMenu(false)}>
              <img src="/logos/Atlas.svg" alt="Atlas Eye Logo" className="h-6 w-auto object-contain" />
              <span className="font-display font-bold text-gray-900 dark:text-[#e6edf3]">Atlas Eye</span>
            </Link>
            <button
              onClick={() => setShowMobileMenu(false)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
              aria-label="Fechar menu"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {NAV_ITEMS.filter(item => isItemVisible(item.label)).map(item => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowMobileMenu(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-700 dark:text-[#adbac7] hover:bg-gray-100 dark:hover:bg-[#21262d]'
                    }`}
                >
                  <Icon size={18} weight={isActive ? 'fill' : 'regular'} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    )}

    {/* Barra de navegação inferior (celular) — destinos mais usados sempre à mão,
        sem precisar abrir o menu. Padrão de app nativo (Instagram, WhatsApp etc). */}
    <div className="app-safe-bottom md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#161b22] dark-nav border-t border-gray-200 dark:border-[#30363d]">
      <div className="h-16 flex items-stretch">
        {NAV_ITEMS.filter(item => MOBILE_TAB_LABELS.includes(item.label) && isItemVisible(item.label)).map(item => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-tap-target flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-[#8b949e]'
                }`}
            >
              <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          )
        })}
        {/* "Mais" — único outro jeito de navegar no celular; abre a mesma gaveta lateral
            (Configurações, Funil de Mensagens, Métricas etc), nunca os dois ao mesmo tempo. */}
        <button
          onClick={() => setShowMobileMenu(true)}
          className="app-tap-target flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-500 dark:text-[#8b949e] transition-colors"
        >
          <List size={22} />
          <span className="text-[10px] font-medium leading-none">Mais</span>
        </button>
      </div>
    </div>
    </>
  )
}
