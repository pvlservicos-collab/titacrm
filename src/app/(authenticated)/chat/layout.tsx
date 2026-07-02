import { LeadsProvider } from '@/contexts/LeadsContext'

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <LeadsProvider>{children}</LeadsProvider>
}
