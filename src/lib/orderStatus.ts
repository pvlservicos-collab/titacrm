export type StatusTone = 'success' | 'warning' | 'danger' | 'info'

export const PAYMENT_STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  paid: { label: 'Pago', tone: 'success' },
  refunded: { label: 'Reembolsado', tone: 'danger' },
}

export const DELIVERY_STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pendente', tone: 'warning' },
  shipped: { label: 'Enviado', tone: 'info' },
  delivered: { label: 'Entregue', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
}

export const PAYMENT_METHOD_META: Record<string, { label: string }> = {
  pix: { label: 'PIX' },
  credit_card: { label: 'Cartão de Crédito' },
  boleto: { label: 'Boleto' },
  dinheiro: { label: 'Dinheiro' },
}
