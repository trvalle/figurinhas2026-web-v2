# SESSION: CPF Obrigatório no Cadastro + RLS sticker_catalog
# Projeto: figurinhas2026-web_V2 (Next.js 15 / Vercel / Supabase)
# Leia este arquivo INTEIRO antes de escrever qualquer linha de código.

---

## 0. LEITURA OBRIGATÓRIA ANTES DE QUALQUER AÇÃO

```bash
pwd
cat src/app/\(auth\)/cadastro/page.tsx
cat package.json | grep -E '"zod"|"cpf"'
```

Aguarde confirmação antes de continuar.

---

## 1. CONTEXTO

**O que JÁ EXISTE e NÃO deve ser alterado:**
- Fluxo de cadastro em 2 fases (Auth → Perfil)
- Tabela `users` com os campos existentes
- Trigger `handle_new_user_credits` que dá 20 créditos no signup
- Toda a lógica de CEP, localização e WhatsApp

**O que será implementado:**
1. Campo CPF obrigatório na Fase 2 (Perfil) do cadastro
2. Validação de CPF (formato + dígitos verificadores)
3. Coluna `cpf` na tabela `users` com constraint UNIQUE
4. Bloqueio de cadastro se CPF já existir
5. RLS habilitado em `sticker_catalog`

---

## 2. REGRAS ABSOLUTAS

```
NUNCA armazenar CPF em texto puro — sempre como hash SHA256
NUNCA exibir CPF completo na UI — mascarar como ***.xxx.xxx-**
NUNCA modificar a Fase 1 (Auth) do cadastro
NUNCA alterar o trigger de créditos existente
NUNCA usar `any` no TypeScript
SEMPRE validar CPF no client E no server
SEMPRE verificar duplicata antes de tentar INSERT
```

---

## 3. DECISÕES DE PRODUTO

- **CPF obrigatório** na Fase 2 (Perfil) do cadastro
- **CPF já cadastrado** = bloqueio total com mensagem clara
- **Armazenamento** = hash SHA256 do CPF (sem pontos e traços)
  - Motivo: LGPD — não armazenar dado sensível em texto puro
  - Hash é suficiente para verificar unicidade
  - Não é possível recuperar o CPF original do hash

---

## 4. SCHEMA SQL — EXECUTAR NO SUPABASE DASHBOARD

Criar arquivo `supabase/migrations/002_cpf_and_rls.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════
-- CPF + RLS sticker_catalog
-- Executar no Supabase Dashboard > SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Adicionar coluna cpf_hash na tabela users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS cpf_hash TEXT UNIQUE;

-- Índice para busca rápida por hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf_hash
ON public.users (cpf_hash)
WHERE cpf_hash IS NOT NULL;

-- 2. Função para verificar se CPF hash já existe
-- Usada pelo server-side antes do INSERT
CREATE OR REPLACE FUNCTION check_cpf_hash_exists(p_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users WHERE cpf_hash = p_hash
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Habilitar RLS em sticker_catalog
ALTER TABLE public.sticker_catalog ENABLE ROW LEVEL SECURITY;

-- Política: qualquer usuário autenticado pode ler
CREATE POLICY "sticker_catalog_read_authenticated"
ON public.sticker_catalog
FOR SELECT
USING (auth.role() = 'authenticated');

-- Política: anon pode ler (necessário para onboarding antes do login)
CREATE POLICY "sticker_catalog_read_anon"
ON public.sticker_catalog
FOR SELECT
USING (true);
```

---

## 5. VALIDAÇÃO DE CPF (src/lib/cpf.ts)

Criar arquivo com validação pura — sem dependência externa.

```typescript
// src/lib/cpf.ts

// Remove formatação: "123.456.789-09" → "12345678909"
export function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, '')
}

// Formatar: "12345678909" → "123.456.789-09"
export function formatCpf(cpf: string): string {
  const clean = cleanCpf(cpf)
  return clean
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// Validar CPF com dígitos verificadores
export function validateCpf(cpf: string): boolean {
  const clean = cleanCpf(cpf)

  // Deve ter 11 dígitos
  if (clean.length !== 11) return false

  // Rejeitar sequências repetidas (ex: 111.111.111-11)
  if (/^(\d)\1+$/.test(clean)) return false

  // Calcular primeiro dígito verificador
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(clean[9])) return false

  // Calcular segundo dígito verificador
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(clean[10])) return false

  return true
}

// Gerar hash SHA256 do CPF limpo
// Roda no browser via SubtleCrypto API
export async function hashCpf(cpf: string): Promise<string> {
  const clean = cleanCpf(cpf)
  const msgBuffer = new TextEncoder().encode(clean)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Máscara para input: aplica formatação enquanto digita
export function maskCpf(value: string): string {
  const clean = cleanCpf(value).slice(0, 11)
  return formatCpf(clean)
}
```

---

## 6. API ROUTE — VERIFICAR CPF (src/app/api/auth/check-cpf/route.ts)

```typescript
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
```

---

## 7. MODIFICAR PÁGINA DE CADASTRO

Antes de modificar, ler o arquivo completo:
```bash
cat src/app/\(auth\)/cadastro/page.tsx
```

### 7.1 O que adicionar na Fase 2 (Perfil)

**Novos imports:**
```typescript
import { validateCpf, maskCpf, hashCpf, cleanCpf } from '@/lib/cpf'
```

**Novo estado:**
```typescript
const [cpf, setCpf] = useState('')
const [cpfError, setCpfError] = useState('')
const [checkingCpf, setCheckingCpf] = useState(false)
```

**Campo CPF no formulário** (inserir após o campo de nome):
```tsx
{/* Campo CPF */}
<div className="flex flex-col gap-1">
  <label className="text-sm font-medium text-ink-300">
    CPF <span className="text-scarlet-400">*</span>
  </label>
  <input
    type="text"
    inputMode="numeric"
    placeholder="000.000.000-00"
    value={cpf}
    onChange={(e) => {
      const masked = maskCpf(e.target.value)
      setCpf(masked)
      setCpfError('')
    }}
    onBlur={handleCpfBlur}
    maxLength={14}
    className={`w-full px-4 py-3 rounded-xl bg-ink-800 border text-ink-100
      placeholder-ink-600 focus:outline-none transition ${
      cpfError
        ? 'border-scarlet-500 focus:border-scarlet-500'
        : 'border-ink-700 focus:border-gold-500'
    }`}
  />
  {cpfError && (
    <p className="text-xs text-scarlet-400">{cpfError}</p>
  )}
  {checkingCpf && (
    <p className="text-xs text-ink-500">Verificando CPF...</p>
  )}
  <p className="text-xs text-ink-600">
    Usado apenas para verificar unicidade da conta. Não compartilhamos seus dados.
  </p>
</div>
```

**Handler de validação no onBlur:**
```typescript
const handleCpfBlur = async () => {
  if (!cpf || cleanCpf(cpf).length < 11) return

  if (!validateCpf(cpf)) {
    setCpfError('CPF inválido. Verifique os números e tente novamente.')
    return
  }

  // Verificar se já existe no banco
  setCheckingCpf(true)
  try {
    const cpfHash = await hashCpf(cpf)
    const response = await fetch('/api/auth/check-cpf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpfHash }),
    })
    const data = await response.json()
    if (data.exists) {
      setCpfError('Este CPF já está cadastrado. Faça login ou use outro CPF.')
    }
  } catch {
    // Verificação falhou — validar novamente no submit
  } finally {
    setCheckingCpf(false)
  }
}
```

**Validação no submit** (adicionar ANTES do INSERT na tabela users):
```typescript
// Validar CPF
if (!validateCpf(cpf)) {
  toast.error('CPF inválido.')
  return
}

// Gerar hash e verificar duplicata
const cpfHash = await hashCpf(cpf)
const checkResponse = await fetch('/api/auth/check-cpf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cpfHash }),
})
const checkData = await checkResponse.json()
if (checkData.exists) {
  toast.error('Este CPF já está cadastrado.')
  setCpfError('Este CPF já está cadastrado. Faça login ou use outro CPF.')
  return
}
```

**Adicionar `cpf_hash` no INSERT:**
```typescript
// No INSERT da tabela users, adicionar:
cpf_hash: cpfHash,
```

---

## 8. CHECKLIST DE IMPLEMENTAÇÃO

```
[ ] 0. Executar Seção 0 e aguardar confirmação
[ ] 1. Criar supabase/migrations/002_cpf_and_rls.sql
[ ] 2. Executar SQL no Supabase Dashboard → SQL Editor
[ ] 3. Confirmar: coluna cpf_hash existe em users
[ ] 4. Confirmar: sticker_catalog tem RLS habilitado
[ ] 5. Criar src/lib/cpf.ts
[ ] 6. npx tsc --noEmit → zero errors
[ ] 7. Criar src/app/api/auth/check-cpf/route.ts
[ ] 8. npx tsc --noEmit → zero errors
[ ] 9. Ler cadastro/page.tsx completo
[ ] 10. Identificar exatamente onde inserir campo CPF na Fase 2
[ ] 11. Modificar cadastro/page.tsx (mostrar diff antes de salvar)
[ ] 12. npx tsc --noEmit → zero errors
[ ] 13. npm run build → zero errors
[ ] 14. Commit e push para staging
[ ] 15. Testar cadastro com CPF válido
[ ] 16. Testar cadastro com CPF inválido (erro de formato)
[ ] 17. Testar cadastro com CPF já cadastrado (bloqueio)
[ ] 18. Confirmar que usuários existentes não foram afetados
[ ] 19. Push para master → produção
```

---

## 9. TESTES MANUAIS

```
Teste 1 — Campo CPF aparece na Fase 2:
  Abrir /cadastro → completar Fase 1 → Fase 2 exibe campo CPF ✅

Teste 2 — CPF inválido (formato):
  Digitar "123.456.789-00" → blur → erro "CPF inválido" ✅

Teste 3 — CPF válido:
  Digitar CPF real válido → blur → sem erro ✅

Teste 4 — CPF já cadastrado:
  Usar CPF de conta existente → blur → erro "CPF já cadastrado" ✅

Teste 5 — Bloqueio no submit:
  Tentar submeter com CPF já cadastrado → bloqueado ✅

Teste 6 — Cadastro completo com CPF novo:
  CPF válido e único → cadastro completo → 20 créditos recebidos ✅

Teste 7 — Usuários existentes:
  Login com conta antiga → funciona normalmente (cpf_hash = null) ✅
```

---

## 10. RISCOS E MITIGAÇÕES

| Risco | Mitigação |
|-------|-----------|
| SubtleCrypto não disponível (HTTP) | Só roda em HTTPS (Vercel é sempre HTTPS) |
| Usuários existentes sem CPF | cpf_hash nullable — não afeta logins existentes |
| CPF válido matematicamente mas inexistente | Aceitável — validação é de formato, não de existência real |
| Race condition: dois cadastros simultâneos com mesmo CPF | UNIQUE constraint no banco garante apenas um |
| LGPD: armazenamento de dado sensível | Hash SHA256 irreversível — não é dado pessoal |

---

## 11. FORA DO ESCOPO

```
- Validação de CPF via Receita Federal (API externa)
- Edição de CPF após cadastro
- CPF na tela de perfil/conta
- Migração de usuários existentes para exigir CPF
- Verificação de CPF por SMS/email
```

---

## FIM

Confirme que leu respondendo: "Entendido — executando Seção 0."
Execute os comandos da Seção 0 e mostre o output antes de continuar.
