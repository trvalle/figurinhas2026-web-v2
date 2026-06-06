# SESSION: Sistema de Créditos + Mercado Pago
# Projeto: figurinhas2026-web_V2 (Next.js 15 / Vercel / Supabase)
# Leia este arquivo INTEIRO antes de escrever qualquer linha de código.

---

## 0. LEITURA OBRIGATÓRIA ANTES DE QUALQUER AÇÃO

```bash
pwd
cat package.json | grep -E '"version"|"next"|"@supabase"'
ls src/app/\(app\)/
cat src/stores/inventarioStore.ts | head -30
```

Aguarde confirmação antes de continuar.

---

## 1. CONTEXTO

**Stack imutável:** Next.js 15 App Router + TypeScript + Supabase + Zustand + Vercel

**O que JÁ EXISTE e NÃO deve ser alterado:**
- Autenticação Supabase Auth (`supabase.auth.getUser()`)
- Tabelas: `users`, `user_stickers`, `sticker_catalog`, `trade_proposals`
- API Route `/api/ocr/route.ts` (Claude Haiku)
- Providers OCR em `src/services/ocrProviders/`
- Scanner em `src/components/scanner/GoogleVisionScanner.tsx`

**O que será criado:**
- 3 tabelas Supabase novas
- 4 API Routes novas
- 1 store Zustand novo
- 3 páginas novas
- 1 componente de créditos no header

---

## 2. MODELO DE NEGÓCIO

### Créditos gratuitos para novos usuários: 20 créditos
### 1 crédito = 1 foto processada (qualquer engine)

### Pacotes de créditos (Mercado Pago):
| ID | Nome | Créditos | Preço BRL |
|----|------|----------|-----------|
| `pack_basic` | Básico | 50 | R$2,99 |
| `pack_standard` | Padrão | 200 | R$7,99 |
| `pack_premium` | Premium | 500 | R$14,99 |

### Regras:
- Novo usuário recebe 20 créditos ao criar conta
- Ao processar foto: verificar saldo → deduzir 1 crédito → processar OCR
- Saldo 0: retornar erro 402 com link para comprar
- Créditos não expiram
- Pagamento confirmado via webhook → adicionar créditos imediatamente

---

## 3. REGRAS ABSOLUTAS

```
NUNCA expor chaves privadas do Mercado Pago no browser
NUNCA deduzir crédito se OCR falhar (deduzir apenas em sucesso)
NUNCA modificar tabelas Supabase existentes
NUNCA alterar fluxo de autenticação existente
SEMPRE verificar saldo ANTES de chamar a API de OCR
SEMPRE usar RLS policies para proteger tabelas de créditos
SEMPRE validar webhook com assinatura do Mercado Pago
```

---

## 4. SCHEMA SUPABASE — EXECUTAR NO SQL EDITOR

Criar arquivo `supabase/migrations/001_credits_system.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- SISTEMA DE CRÉDITOS — Figurinhas Copa 2026
-- Executar no Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Saldo de créditos por usuário
CREATE TABLE IF NOT EXISTS user_credits (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_earned INTEGER NOT NULL DEFAULT 0,  -- histórico total ganho
  total_spent  INTEGER NOT NULL DEFAULT 0,  -- histórico total gasto
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Histórico de transações
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,  -- positivo = ganho, negativo = gasto
  type        TEXT NOT NULL CHECK (type IN (
    'signup_bonus',    -- 20 créditos iniciais
    'purchase',        -- compra via Mercado Pago
    'ocr_deduction'    -- uso no OCR
  )),
  description TEXT,
  reference_id TEXT,  -- payment_id do MP ou outro identificador
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Pagamentos Mercado Pago
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mp_preference_id TEXT,           -- ID da preferência MP
  mp_payment_id   TEXT UNIQUE,     -- ID do pagamento MP (vem no webhook)
  pack_id         TEXT NOT NULL,   -- 'pack_basic' | 'pack_standard' | 'pack_premium'
  credits         INTEGER NOT NULL, -- créditos a adicionar
  amount_brl      NUMERIC(10,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',    -- aguardando pagamento
    'approved',   -- pago e créditos adicionados
    'rejected',   -- rejeitado
    'cancelled'   -- cancelado
  )),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id, created_at DESC);
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
CREATE INDEX idx_payments_mp_id ON payments(mp_payment_id);

-- ─── RLS POLICIES ────────────────────────────────────────────────
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- user_credits: usuário vê e atualiza apenas o próprio saldo
CREATE POLICY "user_credits_select" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- credit_transactions: usuário vê apenas as próprias transações
CREATE POLICY "credit_transactions_select" ON credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- payments: usuário vê apenas os próprios pagamentos
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (auth.uid() = user_id);

-- ─── FUNÇÃO: dar bônus de cadastro ──────────────────────────────
-- Chamada automaticamente quando novo usuário é criado
CREATE OR REPLACE FUNCTION handle_new_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Criar saldo inicial
  INSERT INTO user_credits (user_id, balance, total_earned)
  VALUES (NEW.id, 20, 20);

  -- Registrar transação de bônus
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 20, 'signup_bonus', 'Bônus de boas-vindas');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: dispara após inserção em auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_credits();

-- ─── FUNÇÃO: deduzir crédito (chamada server-side) ───────────────
CREATE OR REPLACE FUNCTION deduct_credit(p_user_id UUID, p_description TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Buscar saldo atual com lock para evitar race condition
  SELECT balance INTO current_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Verificar se tem saldo
  IF current_balance IS NULL OR current_balance < 1 THEN
    RETURN FALSE;
  END IF;

  -- Deduzir crédito
  UPDATE user_credits
  SET balance = balance - 1,
      total_spent = total_spent + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Registrar transação
  INSERT INTO credit_transactions (user_id, amount, type, description)
  VALUES (p_user_id, -1, 'ocr_deduction', p_description);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── FUNÇÃO: adicionar créditos após pagamento ───────────────────
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reference_id TEXT,
  p_description TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Atualizar saldo
  UPDATE user_credits
  SET balance = balance + p_amount,
      total_earned = total_earned + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Registrar transação
  INSERT INTO credit_transactions (user_id, amount, type, description, reference_id)
  VALUES (p_user_id, p_amount, 'purchase', p_description, p_reference_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. VARIÁVEIS DE AMBIENTE

Adicionar ao `.env.local`:
```
MP_ACCESS_TOKEN=          # Mercado Pago Access Token (produção)
MP_ACCESS_TOKEN_TEST=     # Mercado Pago Access Token (sandbox)
MP_WEBHOOK_SECRET=        # String secreta para validar webhooks
NEXT_PUBLIC_APP_URL=https://figurinhas2026-web-v2.vercel.app
```

Adicionar na Vercel (Production + Preview + Development):
- `MP_ACCESS_TOKEN`
- `MP_ACCESS_TOKEN_TEST`
- `MP_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`

**Onde obter:**
- `MP_ACCESS_TOKEN`: mercadopago.com.br → Sua conta → Credenciais → Access Token
- `MP_WEBHOOK_SECRET`: gerar uma string aleatória segura (ex: `openssl rand -hex 32`)

---

## 6. INSTALAR SDK MERCADO PAGO

```bash
npm install mercadopago
```

Confirmar no package.json antes de continuar.

---

## 7. ESTRUTURA DE ARQUIVOS A CRIAR

```
src/
  lib/
    credits/
      packages.ts          ← Definição dos pacotes de créditos
      types.ts             ← Tipos TypeScript
  app/
    api/
      credits/
        balance/route.ts   ← GET saldo do usuário
        deduct/route.ts    ← POST deduzir 1 crédito
      payments/
        create/route.ts    ← POST criar preferência MP
        webhook/route.ts   ← POST receber webhook MP
    (app)/
      credits/
        page.tsx           ← Página de compra de créditos
      account/
        page.tsx           ← Histórico de transações
  stores/
    creditsStore.ts        ← Zustand store de créditos
  components/
    credits/
      CreditBalance.tsx    ← Badge de saldo no header
      CreditPackageCard.tsx ← Card de pacote para compra
      InsufficientCreditsModal.tsx ← Modal quando saldo = 0
```

---

## 8. TIPOS (src/lib/credits/types.ts)

```typescript
export interface CreditPackage {
  id: 'pack_basic' | 'pack_standard' | 'pack_premium'
  name: string
  credits: number
  priceBRL: number
  priceDisplay: string
  highlight?: boolean  // destaque visual no card
}

export interface UserCredits {
  userId: string
  balance: number
  totalEarned: number
  totalSpent: number
  updatedAt: string
}

export interface CreditTransaction {
  id: string
  userId: string
  amount: number
  type: 'signup_bonus' | 'purchase' | 'ocr_deduction'
  description: string | null
  referenceId: string | null
  createdAt: string
}

export interface Payment {
  id: string
  userId: string
  mpPreferenceId: string | null
  mpPaymentId: string | null
  packId: string
  credits: number
  amountBrl: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: string
}
```

---

## 9. PACOTES (src/lib/credits/packages.ts)

```typescript
import type { CreditPackage } from './types'

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'pack_basic',
    name: 'Básico',
    credits: 50,
    priceBRL: 2.99,
    priceDisplay: 'R$2,99',
  },
  {
    id: 'pack_standard',
    name: 'Padrão',
    credits: 200,
    priceBRL: 7.99,
    priceDisplay: 'R$7,99',
    highlight: true,  // mais popular
  },
  {
    id: 'pack_premium',
    name: 'Premium',
    credits: 500,
    priceBRL: 14.99,
    priceDisplay: 'R$14,99',
  },
]

export const SIGNUP_BONUS_CREDITS = 20

export function getPackageById(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find(p => p.id === id)
}
```

---

## 10. API ROUTE — SALDO (src/app/api/credits/balance/route.ts)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  
  // Verificar padrão de criação do Supabase server client no projeto
  // ANTES DE IMPLEMENTAR: verificar como outros arquivos criam o server client
  // grep -rn "createServerClient\|createClient" src/app/api/ | head -10
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('user_credits')
    .select('balance, total_earned, total_spent, updated_at')
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    // Se não existe registro, criar com bônus inicial
    // (pode acontecer para usuários antigos)
    const { data: newData } = await supabase
      .from('user_credits')
      .insert({ user_id: user.id, balance: 20, total_earned: 20 })
      .select()
      .single()
    
    return NextResponse.json(newData ?? { balance: 0, total_earned: 0, total_spent: 0 })
  }

  return NextResponse.json(data)
}
```

---

## 11. API ROUTE — DEDUZIR (src/app/api/credits/deduct/route.ts)

```typescript
// Esta rota é chamada internamente pela /api/ocr ANTES de processar a imagem
// Retorna 402 se saldo insuficiente

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
  const description = body.description ?? 'OCR de figurinha'

  // Chamar função SQL que faz deduplication atômica
  const { data, error } = await supabase.rpc('deduct_credit', {
    p_user_id: user.id,
    p_description: description,
  })

  if (error) {
    console.error('[Credits] Erro ao deduzir:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }

  if (!data) {
    // Saldo insuficiente
    return NextResponse.json(
      { error: 'Saldo insuficiente', code: 'INSUFFICIENT_CREDITS' },
      { status: 402 }
    )
  }

  return NextResponse.json({ success: true })
}
```

---

## 12. MODIFICAR /api/ocr/route.ts — INTEGRAR VERIFICAÇÃO DE CRÉDITOS

Localizar o arquivo e adicionar verificação de crédito ANTES da chamada ao Claude.

```typescript
// ADICIONAR no início do handler POST, antes de chamar anthropic.messages.create():

// Verificar e deduzir crédito
const creditResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/credits/deduct`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // Passar cookies para autenticação
    'Cookie': request.headers.get('cookie') ?? '',
  },
  body: JSON.stringify({ description: 'OCR de figurinha Copa 2026' }),
})

if (!creditResponse.ok) {
  const creditError = await creditResponse.json()
  if (creditResponse.status === 402) {
    return NextResponse.json(
      { error: 'Créditos insuficientes', code: 'INSUFFICIENT_CREDITS' },
      { status: 402 }
    )
  }
  if (creditResponse.status === 401) {
    return NextResponse.json(
      { error: 'Não autenticado' },
      { status: 401 }
    )
  }
}

// ... resto do código existente (chamar Claude Haiku) ...
```

---

## 13. API ROUTE — CRIAR PAGAMENTO (src/app/api/payments/create/route.ts)

```typescript
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
    { cookies: { getAll: () => cookieStore.getAll() } }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { packId } = await request.json()
  const pack = getPackageById(packId)

  if (!pack) {
    return NextResponse.json({ error: 'Pacote inválido' }, { status: 400 })
  }

  // Criar registro de pagamento pendente
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

  // Criar preferência no Mercado Pago
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
        email: user.email,
      },
      external_reference: payment.id,  // nosso ID interno
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=success`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=failure`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL}/credits?status=pending`,
      },
      auto_return: 'approved',
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook`,
      payment_methods: {
        excluded_payment_types: [],  // aceitar todos (PIX + cartão)
      },
    },
  })

  // Salvar preference_id
  await supabase
    .from('payments')
    .update({ mp_preference_id: preferenceData.id })
    .eq('id', payment.id)

  return NextResponse.json({
    preferenceId: preferenceData.id,
    initPoint: preferenceData.init_point,  // URL de checkout MP
  })
}
```

---

## 14. API ROUTE — WEBHOOK (src/app/api/payments/webhook/route.ts)

```typescript
// CRÍTICO: Esta rota recebe notificações do Mercado Pago
// Deve ser robusta — falha silenciosa é melhor que erro que o MP vai retentar

import { MercadoPagoConfig, Payment } from 'mercadopago'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Usar service role key para operações server-to-server sem RLS
// ATENÇÃO: verificar se SUPABASE_SERVICE_ROLE_KEY existe no projeto
// Se não existir, adicionar no .env.local e na Vercel
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // NÃO usar anon key aqui
)

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // MP envia diferentes tipos de notificação
    // Nos interessa apenas 'payment'
    if (body.type !== 'payment') {
      return NextResponse.json({ received: true })
    }

    const paymentId = body.data?.id
    if (!paymentId) {
      return NextResponse.json({ received: true })
    }

    // Buscar detalhes do pagamento no MP
    const paymentClient = new Payment(mp)
    const mpPayment = await paymentClient.get({ id: paymentId })

    const externalReference = mpPayment.external_reference  // nosso payment.id
    const mpStatus = mpPayment.status  // 'approved' | 'rejected' | etc

    if (!externalReference) {
      return NextResponse.json({ received: true })
    }

    // Buscar pagamento no nosso banco
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('id', externalReference)
      .single()

    if (!payment) {
      console.error('[Webhook] Pagamento não encontrado:', externalReference)
      return NextResponse.json({ received: true })
    }

    // Evitar processar duas vezes
    if (payment.status === 'approved') {
      return NextResponse.json({ received: true })
    }

    // Atualizar status do pagamento
    await supabase
      .from('payments')
      .update({
        mp_payment_id: String(paymentId),
        status: mpStatus === 'approved' ? 'approved' : 
                mpStatus === 'rejected' ? 'rejected' : 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', externalReference)

    // Se aprovado: adicionar créditos
    if (mpStatus === 'approved') {
      await supabase.rpc('add_credits', {
        p_user_id: payment.user_id,
        p_amount: payment.credits,
        p_reference_id: String(paymentId),
        p_description: `Compra: ${payment.pack_id} (${payment.credits} créditos)`,
      })

      console.log(`[Webhook] Créditos adicionados: ${payment.credits} para user ${payment.user_id}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    // Log mas retornar 200 para MP não retentar indefinidamente
    console.error('[Webhook] Erro:', error)
    return NextResponse.json({ received: true })
  }
}
```

---

## 15. STORE ZUSTAND (src/stores/creditsStore.ts)

```typescript
import { create } from 'zustand'

interface CreditsStore {
  balance: number | null       // null = não carregado ainda
  isLoading: boolean
  fetchBalance: () => Promise<void>
  decrementBalance: () => void  // otimista — antes da confirmação servidor
}

export const useCreditsStore = create<CreditsStore>((set) => ({
  balance: null,
  isLoading: false,

  fetchBalance: async () => {
    set({ isLoading: true })
    try {
      const response = await fetch('/api/credits/balance')
      if (response.ok) {
        const data = await response.json()
        set({ balance: data.balance })
      }
    } catch (error) {
      console.error('[Credits] Erro ao buscar saldo:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  decrementBalance: () => {
    set(state => ({
      balance: state.balance !== null ? Math.max(0, state.balance - 1) : null
    }))
  },
}))
```

---

## 16. COMPONENTE BADGE DE CRÉDITOS (src/components/credits/CreditBalance.tsx)

```typescript
'use client'

import { useEffect } from 'react'
import { useCreditsStore } from '@/stores/creditsStore'
import { useRouter } from 'next/navigation'

// Inserir no header existente da aplicação
// ANTES DE IMPLEMENTAR: verificar onde fica o header
// find src -name "Header*" -o -name "Navbar*" -o -name "Layout*" | head -5
// Ou verificar src/app/(app)/layout.tsx

export function CreditBalance() {
  const { balance, fetchBalance, isLoading } = useCreditsStore()
  const router = useRouter()

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  if (isLoading || balance === null) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-ink-800 animate-pulse">
        <span className="text-xs text-ink-500">...</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => router.push('/credits')}
      className={`flex items-center gap-1 px-2 py-1 rounded-full transition ${
        balance === 0
          ? 'bg-scarlet-500/20 border border-scarlet-500/50'
          : 'bg-ink-800 hover:bg-ink-700'
      }`}
    >
      <span className="text-sm">⚡</span>
      <span className={`text-xs font-bold ${
        balance === 0 ? 'text-scarlet-400' : 'text-gold-400'
      }`}>
        {balance}
      </span>
    </button>
  )
}
```

---

## 17. MODAL SALDO INSUFICIENTE (src/components/credits/InsufficientCreditsModal.tsx)

```typescript
'use client'

import { useRouter } from 'next/navigation'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function InsufficientCreditsModal({ isOpen, onClose }: Props) {
  const router = useRouter()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-ink-900 border border-ink-700 rounded-2xl p-6 max-w-sm mx-4 text-center">
        <div className="text-4xl mb-3">⚡</div>
        <h2 className="text-lg font-bold text-ink-100 mb-2">
          Créditos esgotados
        </h2>
        <p className="text-sm text-ink-400 mb-6">
          Você usou todos os seus créditos. Compre mais para continuar identificando figurinhas.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-ink-700 text-ink-400 text-sm"
          >
            Fechar
          </button>
          <button
            onClick={() => { onClose(); router.push('/credits') }}
            className="flex-1 py-2 rounded-lg bg-gold-500 text-ink-900 text-sm font-bold"
          >
            Comprar créditos
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## 18. PÁGINA DE CRÉDITOS (src/app/(app)/credits/page.tsx)

```typescript
'use client'

// Página de compra de créditos
// Mostra os 3 pacotes disponíveis
// Ao clicar, chama /api/payments/create e redireciona para MP Checkout

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CREDIT_PACKAGES } from '@/lib/credits/packages'
import { useCreditsStore } from '@/stores/creditsStore'

export default function CreditsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { balance, fetchBalance } = useCreditsStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchBalance()
    const status = searchParams.get('status')
    if (status === 'success') setMessage('✅ Pagamento aprovado! Créditos adicionados.')
    if (status === 'failure') setMessage('❌ Pagamento não aprovado. Tente novamente.')
    if (status === 'pending') setMessage('⏳ Pagamento em processamento.')
  }, [fetchBalance, searchParams])

  const handleBuy = async (packId: string) => {
    setLoading(packId)
    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      })

      if (!response.ok) throw new Error('Erro ao criar pagamento')

      const { initPoint } = await response.json()
      // Redirecionar para checkout do Mercado Pago
      window.location.href = initPoint
    } catch (error) {
      console.error('[Credits] Erro:', error)
      setMessage('❌ Erro ao processar. Tente novamente.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-ink-900 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-ink-100">Créditos</h1>
          <p className="text-ink-400 text-sm mt-1">
            Saldo atual: <span className="text-gold-400 font-bold">{balance ?? '...'} créditos</span>
          </p>
          <p className="text-ink-500 text-xs mt-1">1 crédito = 1 foto identificada</p>
        </div>

        {/* Mensagem de status */}
        {message && (
          <div className="mb-4 p-3 rounded-lg bg-ink-800 text-center text-sm text-ink-300">
            {message}
          </div>
        )}

        {/* Pacotes */}
        <div className="flex flex-col gap-3">
          {CREDIT_PACKAGES.map(pack => (
            <div
              key={pack.id}
              className={`rounded-xl p-4 border ${
                pack.highlight
                  ? 'border-gold-500 bg-gold-500/10'
                  : 'border-ink-700 bg-ink-800'
              }`}
            >
              {pack.highlight && (
                <div className="text-xs text-gold-400 font-bold mb-2">⭐ MAIS POPULAR</div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-ink-100 font-bold">{pack.name}</div>
                  <div className="text-ink-400 text-sm">⚡ {pack.credits} créditos</div>
                </div>
                <button
                  onClick={() => handleBuy(pack.id)}
                  disabled={loading === pack.id}
                  className={`px-4 py-2 rounded-lg font-bold text-sm ${
                    pack.highlight
                      ? 'bg-gold-500 text-ink-900'
                      : 'bg-ink-700 text-ink-100'
                  } disabled:opacity-50`}
                >
                  {loading === pack.id ? '...' : pack.priceDisplay}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="mt-6 p-3 rounded-lg bg-ink-800 text-xs text-ink-500 text-center">
          Pagamentos processados pelo Mercado Pago.<br />
          PIX e cartão de crédito aceitos.<br />
          Créditos adicionados imediatamente após aprovação.
        </div>
      </div>
    </div>
  )
}
```

---

## 19. INTEGRAR NO SCANNER — TRATAMENTO DO ERRO 402

Modificar `src/components/scanner/GoogleVisionScanner.tsx`:

Localizar o catch do `captureAndAnalyze` e adicionar tratamento do erro 402:

```typescript
// ADICIONAR estado no componente:
const [showInsufficientCredits, setShowInsufficientCredits] = useState(false)
const { decrementBalance } = useCreditsStore()

// NO catch do captureAndAnalyze, adicionar ANTES do toast genérico:
if (error instanceof Error && error.message.includes('INSUFFICIENT_CREDITS')) {
  setShowInsufficientCredits(true)
  return
}

// Após OCR bem-sucedido, decrementar saldo otimisticamente:
decrementBalance()

// NO JSX, adicionar modal:
<InsufficientCreditsModal
  isOpen={showInsufficientCredits}
  onClose={() => setShowInsufficientCredits(false)}
/>
```

---

## 20. VARIÁVEL DE AMBIENTE FALTANTE

O webhook precisa de `SUPABASE_SERVICE_ROLE_KEY`. Verificar se existe:

```bash
grep "SERVICE_ROLE\|service_role" .env.local 2>/dev/null || echo "NÃO EXISTE"
```

Se não existir:
- Acessar Supabase Dashboard → Settings → API → Service Role Key
- Adicionar em `.env.local` como `SUPABASE_SERVICE_ROLE_KEY=`
- Adicionar na Vercel (apenas em Production — NUNCA em Preview com NEXT_PUBLIC_)

---

## 21. CHECKLIST DE IMPLEMENTAÇÃO

```
[ ] 0. Executar Seção 0 e aguardar confirmação
[ ] 1. npm install mercadopago → confirmar package.json
[ ] 2. Criar supabase/migrations/001_credits_system.sql
[ ] 3. Executar SQL no Supabase Dashboard → SQL Editor
[ ] 4. Configurar variáveis de ambiente (.env.local + Vercel)
[ ] 5. Criar src/lib/credits/types.ts
[ ] 6. Criar src/lib/credits/packages.ts
[ ] 7. Criar src/app/api/credits/balance/route.ts
[ ] 8. Criar src/app/api/credits/deduct/route.ts
[ ] 9. Modificar src/app/api/ocr/route.ts (verificação de créditos)
[ ] 10. Criar src/app/api/payments/create/route.ts
[ ] 11. Criar src/app/api/payments/webhook/route.ts
[ ] 12. Criar src/stores/creditsStore.ts
[ ] 13. Criar src/components/credits/CreditBalance.tsx
[ ] 14. Criar src/components/credits/InsufficientCreditsModal.tsx
[ ] 15. Criar src/app/(app)/credits/page.tsx
[ ] 16. Integrar CreditBalance no header (verificar layout existente)
[ ] 17. Integrar modal no GoogleVisionScanner.tsx
[ ] 18. npx tsc --noEmit → zero errors
[ ] 19. npm run build → zero errors
[ ] 20. Configurar webhook no painel Mercado Pago
[ ] 21. Testar em staging com credenciais de sandbox MP
[ ] 22. Testar fluxo completo: compra → webhook → créditos adicionados
[ ] 23. Push para master → produção
```

---

## 22. CONFIGURAR WEBHOOK NO MERCADO PAGO

Após deploy em staging:
1. Acessar mercadopago.com.br → Sua conta → Webhooks
2. Adicionar URL: `https://figurinhas2026-web-v2.vercel.app/api/payments/webhook`
3. Selecionar evento: `payment`
4. Salvar

Para testes com sandbox:
1. Usar `MP_ACCESS_TOKEN_TEST` em vez de `MP_ACCESS_TOKEN`
2. URL de webhook pode ser a de staging

---

## 23. FORA DO ESCOPO DESTA SESSÃO

```
- Nota fiscal / NF-e
- Sistema de assinatura recorrente
- Dashboard admin de transações
- Estorno de créditos
- Suporte a múltiplos países/moedas
- Google Vision como engine pago (apenas Claude Haiku por ora)
- Página de histórico de transações (sessão futura)
```

---

## FIM

Confirme que leu respondendo: "Entendido — executando Seção 0."
Execute os comandos da Seção 0 e mostre o output antes de continuar.
