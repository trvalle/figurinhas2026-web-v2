import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getPackageById } from '@/lib/credits/packages'

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
})

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
          })
        },
      },
    },
  )

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const packId = (body as Record<string, unknown>).packId
  const pack = getPackageById(String(packId) ?? '')

  if (!pack) {
    return NextResponse.json({ error: 'Pacote inválido' }, { status: 400 })
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      user_id: user.id,
      pack_id: pack.id,
      credits: pack.credits,
      amount_brl: pack.priceBRL,
      status: 'pending',
    })
    .select()
    .single()

  if (paymentError || !payment) {
    return NextResponse.json({ error: 'Erro ao criar pagamento' }, { status: 500 })
  }

  try {
    const preference = new Preference(mp)
    const preferenceData = await preference.create({
      body: {
        items: [
          {
            id: pack.id,
            title: `${pack.name} — ${pack.credits} créditos`,
            quantity: 1,
            unit_price: pack.priceBRL,
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: user.email ?? undefined,
        },
        external_reference: payment.id as string,
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=success`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=failure`,
          pending: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=pending`,
        },
        auto_return: 'approved',
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook`,
        payment_methods: {
          excluded_payment_types: [],
        },
      },
    })

    await supabase
      .from('payments')
      .update({ mp_preference_id: preferenceData.id })
      .eq('id', payment.id as string)

    return NextResponse.json({
      preferenceId: preferenceData.id,
      initPoint: preferenceData.init_point,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Payments] Erro ao criar preferência MP:', errorMessage)
    return NextResponse.json(
      { error: 'Erro ao criar preferência de pagamento', details: errorMessage },
      { status: 500 }
    )
  }
}
