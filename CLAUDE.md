# CLAUDE.md — Figurinhas 2026 WEB V2
# Versão V2 — portagem fiel do app mobile para web PWA.
# ═══════════════════════════════════════════════════════════════
# ATENÇÃO CRÍTICA — LEIA ANTES DE QUALQUER AÇÃO:
#
# Este é um projeto SEPARADO e INDEPENDENTE do app mobile e do web V1.
# Repositório: figurinhas2026-web_V2/
# App mobile:  figurinhas2026/            ← NUNCA TOCAR
# Web V1:      figurinhas2026-web/        ← NUNCA TOCAR
#
# Os dois projetos compartilham APENAS:
#   - O mesmo projeto Supabase (mesmo banco, mesmas credenciais)
#   - Os mesmos design tokens (cores, fontes, espaçamentos)
#   - Os mesmos tipos TypeScript de domínio
#
# ═══════════════════════════════════════════════════════════════

## O QUE É ESTE PROJETO
PWA (Progressive Web App) V2 — portagem fiel do app mobile React Native para web.
Mesmas funcionalidades do app mobile, entregues via navegador web.
A store de inventário é uma portagem direta da store Zustand do mobile.

## DIFERENÇAS V2 vs V1 (figurinhas2026-web)
1. inventarioStore: portagem fiel do mobile
   - entries: InventarioEntry[] (UserSticker & CatalogEntry — join feito na store)
   - missing: CatalogEntry[] (figurinhas não possuídas)
   - upsertSticker(code, delta) — delta-based como no mobile
   - saveScannedStickers(codes[]) — batch upsert +1 cada
   - markPasted(code, isPasted) — toggle com boolean
   - removeSticker(code) — hard delete
   - removeOneUnit(code): Promise<boolean> — retorna boolean
   - addToEstoque(code): Promise<boolean> — retorna boolean
   - clearInventario() — deleta tudo e re-fetcha
   - generateShareText() — texto formatado para compartilhamento
   - error: string | null + clearError()
2. scan/page.tsx: usa saveScannedStickers para batch
3. RealtimeScanner: usa saveScannedStickers
4. inventario/page.tsx: usa entries+missing direto (sem useCatalog nos tabs próprios)
5. home/page.tsx: stats computadas de entries+missing

## STACK — IMUTÁVEL
- Framework:    Next.js 15 (App Router, TypeScript)
- UI:           Tailwind CSS v3 + design tokens em src/theme/tokens.ts
- Estado:       Zustand (portagem fiel do mobile)
- Backend:      Supabase — MESMO projeto do app mobile
- OCR:          Google Cloud Vision via Edge Function (supabase functions invoke 'ocr')
- PDF:          @react-pdf/renderer (geração client-side)
- PWA:          next-pwa (service worker + manifest)
- Formulários:  React Hook Form + Zod
- HTTP/API:     @supabase/supabase-js
- Deploy:       Vercel

## REGRAS ABSOLUTAS — NUNCA VIOLAR
1.  ISOLAMENTO: nunca modificar ../figurinhas2026/ nem ../figurinhas2026-web/
2.  BANCO: nunca criar tabela ou migration nova
3.  DESIGN: sempre usar tokens de src/theme/tokens.ts
4.  TYPESCRIPT: nunca usar `any`. Strict: true
5.  COMPONENTES: nunca importar de react-native
6.  OCR: usar Edge Function 'ocr' — nunca Tesseract.js
7.  CÂMERA: Web Camera API (getUserMedia)
8.  PRIVACIDADE: endereço nunca exposto, WhatsApp só após match
9.  SEGREDOS: .env.local (gitignored). Prefixo NEXT_PUBLIC_

## VARIÁVEIS DE AMBIENTE (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=        # mesmo valor do app mobile
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # mesmo valor do app mobile
NEXT_PUBLIC_GOOGLE_MAPS_KEY=     # mesmo valor do app mobile
```

## STATUS DO PROJETO
- [x] V2-1: Setup + portagem completa fiel ao mobile
