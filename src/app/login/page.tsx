import { RocketLaunch } from '@phosphor-icons/react/dist/ssr'
import LoginForm from '@/components/Auth/LoginForm'

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-void relative overflow-hidden flex flex-col items-center justify-center p-4">
            {/* Atmosfera: glows radiais azuis sutis */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,rgba(242,199,68,0.14)_0%,transparent_70%)]" />
            </div>

            <div className="relative w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-panel-2 border border-accent-line mb-5 shadow-glow">
                        <RocketLaunch size={26} weight="fill" className="text-accent-2" />
                    </div>
                    <h1 className="text-2xl font-light text-ink tracking-tight">TitaCRM</h1>
                    <p className="text-muted text-sm mt-1">Entre na sua conta</p>
                </div>
                <LoginForm />
            </div>
        </div>
    )
}
