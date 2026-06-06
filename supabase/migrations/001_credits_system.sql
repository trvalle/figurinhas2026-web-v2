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
