import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const paymentId = (body.data as Record<string, unknown> | undefined)?.id
    if (!paymentId) {
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
