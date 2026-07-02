import { NextRequest } from 'next/server'
import { authenticateRequest, apiError } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { orders, orderItems, products } from '@/lib/schema'
import { eq, and, inArray, isNull } from 'drizzle-orm'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params

    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.organizationId, auth.organizationId), isNull(orders.deletedAt)))
      .limit(1)

    if (!order) return apiError(404, 'Pedido não encontrado.')

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))

    const productIds = [...new Set(items.map(i => i.productId).filter(Boolean))] as string[]
    let productNameById = new Map<string, string>()
    if (productIds.length > 0) {
      const productRows = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(inArray(products.id, productIds))
      productNameById = new Map(productRows.map(p => [p.id, p.name]))
    }

    return Response.json({ data: {
      id: order.id,
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      delivery_status: order.deliveryStatus,
      total_value: order.totalValue,
      notes: order.notes,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      customer_email: order.customerEmail,
      customer_cpf: order.customerCpf,
      customer_cep: order.customerCep,
      customer_address: order.customerAddress,
      customer_address_number: order.customerAddressNumber,
      customer_address_complement: order.customerAddressComplement,
      customer_neighborhood: order.customerNeighborhood,
      customer_city: order.customerCity,
      customer_state: order.customerState,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      delivered_at: order.deliveredAt,
      items: items.map(i => ({
        id: i.id,
        product_id: i.productId,
        product_name: (i.productId && productNameById.get(i.productId)) || i.productName,
        quantity: i.quantity,
        unit_price: i.unitPrice,
      })),
    }})
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params
    const body = await req.json()

    const updates: Record<string, any> = { updatedAt: new Date() }
    if (body.payment_status !== undefined) updates.paymentStatus = body.payment_status
    if (body.delivery_status !== undefined) {
      updates.deliveryStatus = body.delivery_status
      // delivered_at é sempre calculado pelo servidor, nunca aceito do client
      updates.deliveredAt = body.delivery_status === 'delivered' ? new Date() : null
    }
    if (body.payment_method !== undefined) updates.paymentMethod = body.payment_method
    if (body.notes !== undefined) updates.notes = body.notes
    if (body.total_value !== undefined) updates.totalValue = body.total_value

    const [order] = await db
      .update(orders)
      .set(updates)
      .where(and(eq(orders.id, id), eq(orders.organizationId, auth.organizationId), isNull(orders.deletedAt)))
      .returning()

    if (!order) return apiError(404, 'Pedido não encontrado.')
    return Response.json({ data: {
      id: order.id,
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      delivery_status: order.deliveryStatus,
      total_value: order.totalValue,
      notes: order.notes,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      delivered_at: order.deliveredAt,
    }})
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req)
    const { id } = await params

    const [order] = await db
      .update(orders)
      .set({ deletedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.organizationId, auth.organizationId), isNull(orders.deletedAt)))
      .returning()

    if (!order) return apiError(404, 'Pedido não encontrado.')
    return Response.json({ success: true })
  } catch (err: any) {
    return apiError(err.status || 500, err.message || 'Erro interno.')
  }
}
