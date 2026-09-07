import type { LeadSourceColumn } from '@/lib/leadSources'

/** Uma linha do log — o que GET /api/lead-sources/{source}/submissions devolve. */
export interface Submission {
  id: string
  external_id: string | null
  name: string | null
  email: string | null
  phone: string | null
  instagram: string | null
  /** Campos específicos da fonte. O que existe aqui depende do `source`. */
  payload: Record<string, any>
  lead_id: string | null
  received_at: string
  updated_at: string
}

/** Uma aba — o que GET /api/lead-sources devolve. */
export interface LeadSourceTab {
  key: string
  label: string
  description: string
  columns: LeadSourceColumn[]
  required: string[]
  total: number
  last_received_at: string | null
}
