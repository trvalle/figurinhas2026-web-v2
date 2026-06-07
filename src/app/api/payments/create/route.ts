import { MercadoPagoConfig, Preference } from 'mercadopago'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getPackageById } from '@/lib/credits/packages'

const isProduction = process.env.VERCEL_ENV === 'production'
const mp = new MercadoPagoConfig({
  accessToken: (isProduction
    ? process.env.MP_ACCESS_TOKEN
    : process.env.MP_ACCESS_TOKEN_TEST)!,
})

export async function POST(request: NextRequest) {
  console.log('[Payments] POST iniciado')
  console.log('[Payments] VERCEL_ENV:', process.env.VERCEL_ENV)
  console.log('[Payments] MP_ACCESS_TOKEN:', process.env.MP_ACCESS_TOKEN ? '✓' : '✗')
  console.log('[Payments] MP_ACCESS_TOKEN_TEST:', process.env.MP_ACCESS_TOKEN_TEST ? '✓' : '✗')

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
    console.log('[Payments] Auth error:', authError)
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  console.log('[Payments] User autenticado:', user.id)

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
    console.log('[Payments] Criando preference...')
    const preference = new Preference(mp)

    console.log('[Payments] Preference body:', {
      pack: pack.id,
      price: pack.priceBRL,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    })

    const preferenceData = await preference.create({
      body: {
        items: [
          {
            id: pack.id,
            title: `${pack.name}`,
            quantity: 1,
            unit_price: Number(pack.priceBRL),
          },
        ],
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=success`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=failure`,
          pending: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=pending`,
        },
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook`,
      },
    })

    console.log('[Payments] Preference criada:', {
      id: preferenceData.id,
      init_point: preferenceData.init_point?.substring(0, 50) + '...',
    })

    await supabase
      .from('payments')
      .update({ mp_preference_id: preferenceData.id })
      .eq('id', payment.id as string)

    const response = {
      preferenceId: preferenceData.id,
      initPoint: preferenceData.init_point,
      debug: {
        preferenceId: preferenceData.id?.substring(0, 20),
        hasInitPoint: !!preferenceData.init_point,
      },
    }
    console.log('[Payments] Retornando sucesso:', response.debug)
    return NextResponse.json(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStatus = (error as any).status || 500
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('[Payments] ❌ ERRO ao criar preferência MP:', {
      message: errorMessage,
      status: errorStatus,
      type: error?.constructor?.name,
      stack: errorStack,
      fullError: JSON.stringify(error, null, 2),
    })
    return NextResponse.json(
      {
        error: 'Erro ao criar preferência de pagamento',
        details: errorMessage,
        status: errorStatus,
      },
      { status: errorStatus }
    )
  }
}
