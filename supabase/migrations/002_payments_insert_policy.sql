-- ═══════════════════════════════════════════════════════════════
-- Fix: Adicionar INSERT policy para tabela payments
-- ═══════════════════════════════════════════════════════════════

-- payments: usuário pode inserir seus próprios pagamentos
CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
