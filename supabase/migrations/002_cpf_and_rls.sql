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
