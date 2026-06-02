# 🚀 Ambientes de Deploy

## Produção
- **URL:** https://figurinhas2026-web-v2.vercel.app
- **Branch:** `main` (master)
- **Deploy:** `vercel --prod`
- **Uso:** Produção em tempo real

## Homologação (Staging)
- **URL:** https://figurinhas2026-staging.vercel.app
- **Branch:** `staging`
- **Deploy:** `vercel deploy` (automaticamente ao fazer commit)
- **Uso:** Testes antes de ir para produção

---

## 📋 Fluxo de Desenvolvimento

### 1️⃣ Trabalhar em Nova Funcionalidade
```bash
# Estar na branch main
git checkout main

# Criar feature branch
git checkout -b feature/nome-da-feature

# Fazer commits normalmente
git add .
git commit -m "feat: descrição"

# Fazer push
git push origin feature/nome-da-feature
```

### 2️⃣ Testar em Staging
```bash
# Mudar para staging
git checkout staging

# Fazer merge da feature
git merge feature/nome-da-feature

# Fazer commit
git commit -m "test: [feature] para homologação"

# Fazer deploy em staging (automático)
vercel deploy

# Testar em: https://figurinhas2026-staging.vercel.app
```

### 3️⃣ Deploy para Produção
```bash
# Se testes OK, fazer merge em main
git checkout main
git merge staging

# Fazer commit
git commit -m "release: merge de staging"

# Deploy em produção
vercel --prod

# Live em: https://figurinhas2026-web-v2.vercel.app
```

---

## 🔄 Branchs Permanentes

| Branch | URL | Comandos |
|--------|-----|----------|
| `main` | figurinhas2026-web-v2.vercel.app | `vercel --prod` |
| `staging` | figurinhas2026-staging.vercel.app | `vercel deploy` |

---

## ✅ Checklist Antes de Deploy

### Em Staging
- [ ] Build sem erros (`npm run build`)
- [ ] TypeScript sem warnings (`npx tsc --noEmit`)
- [ ] Funcionalidades funcionando
- [ ] Responsivo (desktop/tablet/mobile)
- [ ] Sem erros no console

### Em Produção
- [ ] Testes em staging aprovados
- [ ] Revisar últimas mudanças
- [ ] Fazer backup/snapshot se necessário
- [ ] Deploy via `vercel --prod`
- [ ] Testar após deploy
- [ ] Monitorar logs

---

## 🐛 Troubleshooting

### "Erro no build em staging"
```bash
rm -rf .next
npm run build
vercel deploy
```

### "Quer reverter staging para main"
```bash
git checkout staging
git reset --hard main
vercel deploy
```

### "Precisa fazer hotfix em produção"
```bash
git checkout main
# fazer fix
git commit -m "fix: descrição"
vercel --prod

# depois atualizar staging
git checkout staging
git merge main
vercel deploy
```

---

**Criado em:** 2026-06-02
**Última atualização:** Deploy de homologação
