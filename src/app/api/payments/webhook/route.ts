import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
})

function validateWebhookSignature(
  paymentId: string,
  requestId: string,
  ts: string,
  v1: string,
  secret: string
): boolean {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex')
  return expected === v1
}

export async function POST(request: NextRequest) {
  try {
    // 1. Ler headers
    const xSignature = request.headers.get('x-signature') ?? ''
    const xRequestId = request.headers.get('x-request-id') ?? ''

    // 2. Parsear body
    const body = await request.json()

    // 3. Extrair paymentId do body
    const paymentId = (body.data as Record<string, unknown> | undefined)?.id
    if (!paymentId) {
      console.warn('[Webhook] paymentId não encontrado no body')
      return NextResponse.json({ received: true })
    }

    // 4. Extrair ts e v1 de x-signature
    const ts = xSignature.match(/ts=([^,]+)/)?.[1] ?? ''
    const v1 = xSignature.match(/v1=([^,]+)/)?.[1] ?? ''

    // 5. Validar signature
    if (!ts || !v1 || !xRequestId || !process.env.MP_WEBHOOK_SECRET) {
      console.warn('[Webhook] Headers ou secret faltando')
      return NextResponse.json({ received: true }, { status: 401 })
    }

    const isValid = validateWebhookSignature(
      String(paymentId),
      xRequestId,
      ts,
      v1,
      process.env.MP_WEBHOOK_SECRET
    )

    if (!isValid) {
      console.warn('[Webhook] Signature inválida', {
        paymentId,
        xRequestId,
        ts,
      })
      return NextResponse.json({ received: true }, { status: 401 })
    }

    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const paymentClient = new Payment(mp)
    const mpPayment = await paymentClient.get({ id: String(paymentId) })

    const externalReference = mpPayment.external_reference
    const mpStatus = mpPayment.status

    if (!externalReference) {
      return NextResponse.json({ received: true })
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('id', externalReference)
      .single()

    if (!payment) {
      console.error('[Webhook] Pagamento não encontrado:', externalReference)
      return NextResponse.json({ received: true })
    }

    if ((payment as Record<string, unknown>).status === 'approved') {
      return NextResponse.json({ received: true })
    }

    await supabase
      .from('payments')
      .update({
        mp_payment_id: String(paymentId),
        status:
          mpStatus === 'approved'
            ? 'approved'
            : mpStatus === 'rejected'
              ? 'rejected'
              : 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', externalReference)

    if (mpStatus === 'approved') {
      await supabase.rpc('add_credits', {
        p_user_id: (payment as Record<string, unknown>).user_id,
        p_amount: (payment as Record<string, unknown>).credits,
        p_reference_id: String(paymentId),
        p_description: `Compra: ${(payment as Record<string, unknown>).pack_id} (${(payment as Record<string, unknown>).credits} créditos)`,
      })

      console.log(
        `[Webhook] Créditos adicionados: ${(payment as Record<string, unknown>).credits} para user ${(payment as Record<string, unknown>).user_id}`,
      )
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Webhook] Erro:', error)
    return NextResponse.json({ received: true })
  }
}
