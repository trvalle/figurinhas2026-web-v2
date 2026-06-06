import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
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

  const { data, error } = await supabase
    .from('user_credits')
    .select('balance, total_earned, total_spent, updated_at')
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    const { data: newData } = await supabase
      .from('user_credits')
      .insert({ user_id: user.id, balance: 20, total_earned: 20 })
      .select()
      .single()

    return NextResponse.json(
      newData ?? { balance: 0, total_earned: 0, total_spent: 0 },
    )
  }

  return NextResponse.json(data)
}
