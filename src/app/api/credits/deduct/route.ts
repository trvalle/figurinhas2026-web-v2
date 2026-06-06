import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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
  const description = (body as Record<string, unknown>).description ?? 'OCR de figurinha'

  const { data, error } = await supabase.rpc('deduct_credit', {
    p_user_id: user.id,
    p_description: description,
  })

  if (error) {
    console.error('[Credits] Erro ao deduzir:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Saldo insuficiente', code: 'INSUFFICIENT_CREDITS' },
      { status: 402 },
    )
  }

  return NextResponse.json({ success: true })
}
