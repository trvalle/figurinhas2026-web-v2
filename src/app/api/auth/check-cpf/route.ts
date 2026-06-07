// Verifica se CPF hash já existe no banco
// Chamado ANTES do INSERT do perfil para dar feedback imediato ao usuário

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { cpfHash } = body as { cpfHash?: string }

  if (!cpfHash || cpfHash.length !== 64) {
    return NextResponse.json({ error: 'Hash inválido' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('check_cpf_hash_exists', {
    p_hash: cpfHash,
  })

  if (error) {
    console.error('[CheckCPF] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }

  return NextResponse.json({ exists: data === true })
}
