# SESSÃO 10 — Tutorial Inicial: Swiper de Boas-Vindas + Help Contextual

## CONTEXTO
Esta sessão implementa o tutorial de primeiro uso do app.
Composto por duas partes complementares:

PARTE A — Swiper de boas-vindas (4 telas):
  Exibido UMA ÚNICA VEZ após o cadastro ser concluído.
  Apresenta as 4 funcionalidades principais com animação e visual rico.
  O usuário desliza horizontalmente para avançar ou pula direto para o app.

PARTE B — Help contextual (ícone ? por tela):
  Disponível permanentemente em todas as telas principais.
  O usuário acessa quando quiser, sem ser forçado.
  Cada tela tem sua própria explicação específica.

ARQUIVOS A CRIAR:
  - app/tutorial.tsx
  - src/components/tutorial/TutorialSlide.tsx
  - src/components/tutorial/TutorialDots.tsx
  - src/components/tutorial/HelpModal.tsx
  - src/utils/tutorialContent.ts

ARQUIVOS A ALTERAR:
  - app/_layout.tsx (adicionar redirect para tutorial após cadastro)
  - app/(auth)/cadastro.tsx (marcar tutorial como pendente)
  - app/(tabs)/index.tsx (adicionar botão ? no header)
  - app/(tabs)/scan.tsx (adicionar botão ? no header)
  - app/(tabs)/inventario.tsx (adicionar botão ? no header)
  - app/(tabs)/trocas.tsx (adicionar botão ? no header)
  - supabase/migrations/008_tutorial_seen.sql (nova coluna)

NÃO ALTERAR: stores, services, outros componentes, design tokens.
NÃO INSTALAR novos pacotes — tudo com Expo SDK existente.
Pré-requisitos: Sessões 1, 2 e 5 concluídas.

---

## SESSÃO 10 — Implementação

```
Leia CLAUDE.md, docs/design-tokens.md, docs/flows.md e docs/data-model.md
antes de começar.

Execute na ordem. Pare e mostre o resultado de cada etapa antes de continuar.
Não alterar nenhum arquivo fora dos listados acima.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 1 — Migration: marcar tutorial como visto
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Criar supabase/migrations/008_tutorial_seen.sql:

```sql
-- Adicionar coluna para controlar se o usuário já viu o tutorial
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tutorial_seen BOOLEAN NOT NULL DEFAULT false;

-- Comentário explicativo
COMMENT ON COLUMN public.users.tutorial_seen IS
  'TRUE = usuário já viu o tutorial de boas-vindas e não deve ver novamente';
```

Executar: npx supabase db push
Verificar no Supabase Dashboard que a coluna foi criada.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 2 — Conteúdo do tutorial
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Criar src/utils/tutorialContent.ts com o conteúdo completo
das 4 slides e dos textos de help contextual:

```typescript
import { colors } from '../theme/tokens'

// ── SLIDES DO TUTORIAL (swiper) ──────────────────────────
export interface TutorialSlide {
  id: number
  emoji: string           // emoji grande centralizado
  emojiBackground: string // cor de fundo do círculo do emoji
  accentColor: string     // cor do título e dos elementos visuais
  title: string           // título em font-display
  subtitle: string        // subtítulo em font-heading
  description: string     // descrição em font-body
  tip: string             // dica rápida (menor, com ícone 💡)
  illustrationItems: IllustrationItem[]  // elementos visuais da tela
}

export interface IllustrationItem {
  code: string    // ex: "BRA 5"
  status: 'colada' | 'repetida' | 'faltante' | 'estoque'
  country: string // ex: "Brasil"
}

export const TUTORIAL_SLIDES: TutorialSlide[] = [
  {
    id: 1,
    emoji: '⚽',
    emojiBackground: 'rgba(245,158,11,0.15)',
    accentColor: colors.gold[400],
    title: 'BEM-VINDO!',
    subtitle: 'Seu álbum da Copa 2026 organizado',
    description:
      'Nunca mais perca uma figurinha ou não saiba o que falta. ' +
      'O Figurinhas Copa 2026 organiza seu álbum de forma inteligente ' +
      'e ainda te ajuda a completá-lo mais rápido.',
    tip: 'Comece escaneando suas primeiras figurinhas!',
    illustrationItems: [
      { code: 'BRA 5',  status: 'colada',   country: 'Brasil'   },
      { code: 'GER 12', status: 'repetida', country: 'Alemanha' },
      { code: 'ARG 8',  status: 'faltante', country: 'Argentina'},
      { code: 'MAR 3',  status: 'estoque',  country: 'Marrocos' },
    ],
  },
  {
    id: 2,
    emoji: '📷',
    emojiBackground: 'rgba(59,130,246,0.15)',
    accentColor: colors.cobalt[400],
    title: 'ESCANEIE',
    subtitle: 'IA identifica seus códigos na hora',
    description:
      'Aponte a câmera para suas figurinhas — a inteligência artificial ' +
      'lê os códigos automaticamente (ex: BRA 5, GER 12) e já organiza ' +
      'tudo por página do álbum para você colar na ordem certa.',
    tip: 'Funciona com até 10 figurinhas na mesma foto!',
    illustrationItems: [
      { code: 'KOR 4',  status: 'faltante', country: 'Coreia'  },
      { code: 'MAR 12', status: 'estoque',  country: 'Marrocos'},
      { code: 'CIV 5',  status: 'faltante', country: 'Costa do Marfim'},
    ],
  },
  {
    id: 3,
    emoji: '📦',
    emojiBackground: 'rgba(34,197,94,0.15)',
    accentColor: colors.verde[400],
    title: 'CONTROLE',
    subtitle: 'Saiba exatamente o que você tem',
    description:
      'Seu inventário completo em um lugar só: figurinhas coladas ✅, ' +
      'repetidas 🔁, faltantes ❌ e em estoque 📦. ' +
      'Veja o progresso de cada seleção e quanto falta para completar o álbum.',
    tip: 'Exporte sua lista em PDF para compartilhar com amigos!',
    illustrationItems: [
      { code: 'ESP 3',  status: 'colada',   country: 'Espanha'  },
      { code: 'FRA 7',  status: 'repetida', country: 'França'   },
      { code: 'ENG 5',  status: 'faltante', country: 'Inglaterra'},
      { code: 'POR 11', status: 'colada',   country: 'Portugal' },
    ],
  },
  {
    id: 4,
    emoji: '🔁',
    emojiBackground: 'rgba(245,158,11,0.15)',
    accentColor: colors.gold[400],
    title: 'TROQUE',
    subtitle: 'Colecionadores perto de você',
    description:
      'O app cruza seu inventário com outros colecionadores da sua região ' +
      'e avisa quando alguém próximo tem o que você precisa — e precisa ' +
      'do que você tem repetido. Troca certa, na hora certa.',
    tip: 'Quanto mais figurinhas você registrar, melhores as sugestões!',
    illustrationItems: [
      { code: 'ARG 2',  status: 'faltante', country: 'Argentina'},
      { code: 'GER 12', status: 'repetida', country: 'Alemanha' },
    ],
  },
]

// ── HELP CONTEXTUAL (ícone ?) ─────────────────────────────
export interface HelpContent {
  screen: string
  title: string
  sections: HelpSection[]
}

export interface HelpSection {
  icon: string
  heading: string
  body: string
}

export const HELP_CONTENT: Record<string, HelpContent> = {
  home: {
    screen: 'Home',
    title: '🏠 Como usar a Home',
    sections: [
      {
        icon: '📊',
        heading: 'Progresso do álbum',
        body: 'A barra dourada mostra quantas figurinhas você já colou em relação ao total de 720.',
      },
      {
        icon: '✅',
        heading: 'Coladas',
        body: 'Figurinhas que você já fixou no álbum físico.',
      },
      {
        icon: '🔁',
        heading: 'Repetidas',
        body: 'Figurinhas duplicadas que você pode oferecer para troca.',
      },
      {
        icon: '❌',
        heading: 'Faltantes',
        body: 'Figurinhas que você ainda não tem. Quando alguém próximo tiver, você recebe uma notificação.',
      },
      {
        icon: '📦',
        heading: 'Estoque',
        body: 'Figurinhas que você tem mas ainda não colou no álbum.',
      },
      {
        icon: '⚙️',
        heading: 'Configurações',
        body: 'Toque na engrenagem para configurar seu perfil, exportar PDF ou acessar o checklist do álbum.',
      },
    ],
  },
  scan: {
    screen: 'Scan',
    title: '📷 Como escanear figurinhas',
    sections: [
      {
        icon: '⚡',
        heading: 'Tempo Real',
        body: 'Aponte a câmera e veja o status de cada figurinha em tempo real. Verde = repetida, vermelho = faltante.',
      },
      {
        icon: '📷',
        heading: 'Câmera',
        body: 'Tire uma foto com até 10 figurinhas. A IA identifica os códigos automaticamente.',
      },
      {
        icon: '🖼️',
        heading: 'Galeria',
        body: 'Envie fotos já tiradas — até 5 de uma vez. Funciona com fotos recebidas no WhatsApp também.',
      },
      {
        icon: '✏️',
        heading: 'Manual',
        body: 'Digite os códigos diretamente. Ex: BRA 5, GER 12, MAR 3 (separados por vírgula ou espaço).',
      },
      {
        icon: '💡',
        heading: 'Dica',
        body: 'Para melhor resultado, fotografe as figurinhas sobre uma superfície clara com boa iluminação.',
      },
    ],
  },
  inventario: {
    screen: 'Inventário',
    title: '📦 Como usar o Inventário',
    sections: [
      {
        icon: '👆',
        heading: 'Arrastar para a direita',
        body: 'Em figurinhas do Estoque: marca como Colada no álbum.\nEm figurinhas Faltantes: move para o Estoque.',
      },
      {
        icon: '👈',
        heading: 'Arrastar para a esquerda',
        body: 'Abre opções de ação: remover unidade ou outras operações.',
      },
      {
        icon: '🔒',
        heading: 'Figurinha protegida',
        body: 'Se uma figurinha está colada (✅), ela nunca é removida ao decrementar repetidas. É protegida automaticamente.',
      },
      {
        icon: '⚡',
        heading: 'Quase lá!',
        body: 'Badge especial que aparece quando faltam apenas 1 ou 2 figurinhas para completar uma seleção.',
      },
      {
        icon: '↗️',
        heading: 'Compartilhar lista',
        body: 'Botão no topo gera um texto formatado com suas repetidas e faltantes para enviar no WhatsApp.',
      },
    ],
  },
  trocas: {
    screen: 'Trocas',
    title: '🔁 Como fazer trocas',
    sections: [
      {
        icon: '📍',
        heading: 'Próximos',
        body: 'Colecionadores dentro do seu raio configurado que têm figurinhas compatíveis com as suas.',
      },
      {
        icon: '🎯',
        heading: 'Match Perfeito',
        body: 'Quando você tem o que alguém precisa E essa pessoa tem o que você precisa. Prioridade máxima.',
      },
      {
        icon: '📋',
        heading: 'Propor troca',
        body: 'Toque em um colecionador → selecione o que quer receber → selecione o que vai dar → envie a proposta.',
      },
      {
        icon: '🤝',
        heading: 'Aceite mútuo',
        body: 'Quando os dois aceitam, o WhatsApp de ambos é revelado para combinar o encontro.',
      },
      {
        icon: '✅',
        heading: 'Concluir troca',
        body: 'Após trocar fisicamente, marque como "Concluída" e o inventário de ambos atualiza automaticamente.',
      },
    ],
  },
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 3 — Componente TutorialDots
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Criar src/components/tutorial/TutorialDots.tsx:

Props:
  total: number          // total de slides (4)
  current: number        // slide atual (0-3)
  accentColor: string    // cor do dot ativo (muda por slide)

Visual:
  - Row de dots horizontais centralizados
  - Dot ativo: largura 24px, height 8px, border-radius 999, cor = accentColor
  - Dot inativo: largura 8px, height 8px, border-radius 999, cor rgba(255,255,255,0.2)
  - Transição de largura: animação spring (Animated.spring) ao trocar de slide
  - Gap entre dots: 6px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 4 — Componente TutorialSlide
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Criar src/components/tutorial/TutorialSlide.tsx:

Props:
  slide: TutorialSlide   // dados do slide de tutorialContent.ts
  isActive: boolean      // se este slide está visível

LAYOUT (de cima para baixo):

```
┌──────────────────────────────────────┐
│                                      │
│         ┌──────────────┐             │
│         │  [emoji 56px]│ ← círculo   │
│         │   colorido   │   com blur  │
│         └──────────────┘             │
│                                      │
│    ┌─────────────────────────────┐   │
│    │  [ilustração de figurinhas] │   │  ← mini StickerCards
│    └─────────────────────────────┘   │
│                                      │
│    TÍTULO DO SLIDE                   │  ← font-display 48px accentColor
│    Subtítulo do slide                │  ← font-heading 20px ink-300
│                                      │
│    Descrição completa do que o       │  ← font-body 15px ink-400
│    usuário pode fazer nesta tela...  │    line-height 1.65
│                                      │
│    💡 Dica rápida aqui              │  ← font-body 13px gold-400
│                                      │
└──────────────────────────────────────┘
```

ÁREA DO EMOJI (círculo centralizado):
  - View circular: 96px x 96px, border-radius 999
  - Background: slide.emojiBackground
  - Borda: 1px solid rgba(cor-do-emoji, 0.3)
  - Emoji: Text 56px centralizado
  - Sombra glow: shadowColor = accentColor, shadowRadius 20, opacity 0.3

ILUSTRAÇÃO DE FIGURINHAS (mini cards):
  - Row centralizado com as illustrationItems do slide
  - Cada item: mini StickerCard (versão simplificada)
    - View 52x64px, border-radius 10px
    - Background: STATUS_CONFIG[status].bg de src/utils/constants.ts
    - Borda: 1px solid STATUS_CONFIG[status].color com 40% opacidade
    - Código em cima: font-mono, 10px, bold, branco
    - Ícone de status embaixo: 14px (✅🔁❌📦)
  - Gap entre cards: 8px
  - Animação de entrada: fade + translate Y(20px → 0) com delay por índice

TÍTULO:
  - font-display (Bebas Neue), 48px, letter-spacing 3px
  - Cor: slide.accentColor
  - Margin bottom: 4px

SUBTÍTULO:
  - font-heading (Barlow Condensed), 20px, font-weight 700
  - Cor: ink-300
  - Margin bottom: 16px

DESCRIÇÃO:
  - font-body (DM Sans), 15px, line-height 1.65
  - Cor: ink-400
  - Margin bottom: 20px
  - Máximo 3 linhas visíveis — não rolar

DICA:
  - View com background rgba(gold-500, 0.08) e borda rgba(gold-500, 0.2)
  - border-radius: radius-md (12px)
  - padding: 10px 14px
  - Texto: font-body 13px gold-400
  - "💡" à esquerda do texto

ANIMAÇÃO DO SLIDE (quando isActive muda):
  - Ao entrar: fade in (opacity 0→1) + slide horizontal (translateX 40→0)
  - Ao sair: fade out (opacity 1→0) + slide horizontal (translateX 0→-40)
  - Duração: 280ms, easing: ease-out
  - Usar Animated.parallel com Animated.timing

Usar APENAS tokens de src/theme/tokens.ts e STATUS_CONFIG de src/utils/constants.ts.
Nenhuma cor hardcodada.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 5 — Tela app/tutorial.tsx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Criar app/tutorial.tsx (rota standalone, fora das tabs):

LAYOUT COMPLETO:

```
┌──────────────────────────────────────────┐
│                              [Pular]     │  ← botão ghost no topo direito
│                                          │
│  ┌────────────────────────────────────┐  │
│  │                                    │  │
│  │        [TutorialSlide atual]       │  │  ← ocupa 75% da altura
│  │                                    │  │
│  └────────────────────────────────────┘  │
│                                          │
│           ● ● ● ●                        │  ← TutorialDots
│                                          │
│   ┌──────────────────────────────────┐   │
│   │      [Próximo] ou [Começar!]     │   │  ← botão primário
│   └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

ESTADO LOCAL:
  const [currentIndex, setCurrentIndex] = useState(0)
  const slide = TUTORIAL_SLIDES[currentIndex]

GESTOS DE SWIPE (usar PanResponder do React Native):
  - Swipe horizontal para a esquerda: avançar slide (se não for o último)
  - Swipe horizontal para a direita: voltar slide (se não for o primeiro)
  - Threshold: 50px de movimento horizontal

BOTÃO "PULAR" (canto superior direito):
  - Text simples, font-heading, ink-500, sem borda
  - onPress: marcarTutorialComoVisto() → navegar para (tabs)/index
  - Não exibir no último slide (só aparece nos slides 1, 2 e 3)

BOTÃO PRINCIPAL (rodapé):
  - Slides 1, 2 e 3: label "Próximo →", btn-secondary
  - Slide 4 (último): label "Começar! ⚽", btn-primary (gold, maior)
  - onPress:
    - Se não é o último slide: currentIndex + 1 com animação
    - Se é o último slide: marcarTutorialComoVisto() → navegar para (tabs)/index

FUNÇÃO marcarTutorialComoVisto():
  - UPDATE em public.users SET tutorial_seen = true WHERE id = auth.uid()
  - Não aguardar (fire and forget) — não bloquear a navegação
  - Em caso de erro: logar mas não impedir a navegação

BACKGROUND da tela:
  - ink-900 sólido
  - Gradiente radial sutil no centro do slide atual:
    background = `radial-gradient circle at center, ${slide.emojiBackground} 0%, transparent 60%`
  - Transição suave ao trocar de slide (opacity da camada de gradiente)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 6 — Redirect para tutorial após cadastro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ARQUIVO: app/(auth)/cadastro.tsx

Localizar o botão "Salvar" que faz insert em public.users.
Após o insert bem-sucedido, alterar o redirect:

  ANTES: router.replace('/(tabs)/index')
  DEPOIS: router.replace('/tutorial')

ARQUIVO: app/_layout.tsx

Na lógica de redirect pós-login, adicionar verificação de tutorial_seen:

  FLUXO ATUAL:
    autenticado + perfil existe → (tabs)/index

  NOVO FLUXO:
    autenticado + perfil existe + tutorial_seen = false → /tutorial
    autenticado + perfil existe + tutorial_seen = true  → (tabs)/index

  Como verificar:
    Após buscar o perfil em public.users, checar users.tutorial_seen.
    Se tutorial_seen = false (ou campo não existe): redirecionar para /tutorial.
    Se tutorial_seen = true: seguir para (tabs)/index normalmente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 7 — Componente HelpModal
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Criar src/components/tutorial/HelpModal.tsx:

Props:
  visible: boolean
  onClose: () => void
  screen: keyof typeof HELP_CONTENT  // 'home'|'scan'|'inventario'|'trocas'

Busca o conteúdo em HELP_CONTENT[screen] de tutorialContent.ts.

LAYOUT (bottom sheet — mesmo padrão do SettingsModal):
  - Modal nativo do React Native, animationType: 'slide', transparent: true
  - Backdrop: View full-screen rgba(0,0,0,0.6), toque fecha
  - Sheet ancorado na parte inferior:
    background: ink-800
    border-radius: radius-xl radius-xl 0 0
    padding: space-6
    paddingBottom: useSafeAreaInsets().bottom + space-6

CONTEÚDO DO SHEET (de cima para baixo):

  1. Pill de drag:
     width 40px, height 4px, rgba(255,255,255,0.2), border-radius full, centralizado

  2. Título do modal:
     HELP_CONTENT[screen].title
     font-heading, text-2xl, ink-100, margin-bottom space-4

  3. ScrollView com as seções:
     Para cada HelpSection em HELP_CONTENT[screen].sections:

     ┌─────────────────────────────────────┐
     │  [icon 24px]  Heading               │  ← font-heading 16px bold ink-100
     │               Texto do body         │  ← font-body 14px ink-400 line-height 1.6
     └─────────────────────────────────────┘

     Separador entre seções: 1px rgba(255,255,255,0.05)
     Padding vertical por seção: space-4

  4. Botão "Entendido ✓" no rodapé:
     btn-primary, width 100%, onPress: onClose()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ETAPA 8 — Botão ? nas telas principais
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Adicionar botão de ajuda no header das 4 telas principais.
Alteração mínima — apenas adicionar o botão e o HelpModal.

PADRÃO A SEGUIR EM CADA TELA:

```typescript
// Adicionar estado local
const [helpVisible, setHelpVisible] = useState(false)

// Adicionar no header (ao lado direito, junto com outros botões existentes)
<TouchableOpacity
  onPress={() => setHelpVisible(true)}
  style={{
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  }}
  accessibilityLabel="Ajuda"
>
  <Text style={{
    fontFamily: tokens.fonts.heading,
    fontSize: 16,
    color: tokens.colors.ink[400],
    fontWeight: '700',
  }}>?</Text>
</TouchableOpacity>

// Adicionar antes do fechamento do return()
<HelpModal
  visible={helpVisible}
  onClose={() => setHelpVisible(false)}
  screen="NOME_DA_TELA"  // 'home' | 'scan' | 'inventario' | 'trocas'
/>
```

Aplicar em:
  app/(tabs)/index.tsx      → screen="home"
  app/(tabs)/scan.tsx       → screen="scan"
  app/(tabs)/inventario.tsx → screen="inventario"
  app/(tabs)/trocas.tsx     → screen="trocas"

Posição do botão ? em cada tela:
  - Home:       ao lado do botão ⚙️ já existente
  - Scan:       canto superior direito do header
  - Inventário: canto superior direito, antes do botão de compartilhar
  - Trocas:     canto superior direito do header

NÃO alterar nenhuma lógica existente — apenas adicionar o estado,
o botão e o HelpModal. Nada mais.
```

---

## DIAGRAMA DE FLUXO DO TUTORIAL

```
PRIMEIRO LOGIN (usuário novo):

  Cadastro concluído
        │
        ▼
  router.replace('/tutorial')
        │
        ▼
  ┌─────────────────────────────────────┐
  │  SLIDE 1: Bem-vindo ⚽             │
  │  SLIDE 2: Escaneie 📷             │ ← swipe ou botão Próximo
  │  SLIDE 3: Controle 📦             │
  │  SLIDE 4: Troque 🔁               │
  └─────────────────────────────────────┘
        │
        ▼ (Começar! ou Pular)
  marcarTutorialComoVisto()
  [fire and forget — não bloqueia]
        │
        ▼
  router.replace('/(tabs)/index')


LOGINS SUBSEQUENTES (tutorial_seen = true):

  Login → perfil existe → tutorial_seen = true
        │
        ▼
  (tabs)/index  [tutorial não aparece mais]


HELP CONTEXTUAL (qualquer momento):

  Tela principal
  Usuário toca em [?]
        │
        ▼
  HelpModal abre com conteúdo da tela atual
        │
        ▼ (Entendido ✓ ou toque no backdrop)
  Modal fecha — usuário continua onde estava
```

---

## PROMPT DE REVISÃO DA SESSÃO 10

```
Faça uma revisão do que foi criado verificando:

MIGRATION E BANCO:
1. A migration 008 usa ALTER TABLE (não CREATE TABLE)?
2. A coluna tutorial_seen tem DEFAULT false?
3. npx supabase db push foi executado sem erros?

CONTEÚDO:
4. Os 4 slides têm os campos: emoji, título, subtítulo, descrição, dica e illustrationItems?
5. Os 4 objetos de HELP_CONTENT existem: home, scan, inventario, trocas?
6. Cada HELP_CONTENT tem pelo menos 5 seções?

TUTORIAL SLIDE:
7. A cor de destaque (accentColor) muda a cada slide?
8. A ilustração de mini figurinhas usa STATUS_CONFIG para as cores?
9. Nenhuma cor hardcodada fora de tokens.ts e STATUS_CONFIG?
10. A animação de entrada/saída usa Animated.parallel com Animated.timing?

TELA DO TUTORIAL:
11. Swipe horizontal esquerda/direita funciona via PanResponder?
12. Botão "Pular" não aparece no último slide?
13. Último slide mostra "Começar! ⚽" com btn-primary gold?
14. marcarTutorialComoVisto() é fire and forget (não bloqueia navegação)?

REDIRECT:
15. Cadastro novo redireciona para /tutorial (não para tabs/index)?
16. _layout.tsx verifica tutorial_seen antes de redirecionar para home?
17. Usuário com tutorial_seen = true vai direto para home sem ver o tutorial?

HELP MODAL:
18. HelpModal abre ao tocar em [?] em cada tela?
19. Toque no backdrop fecha o modal?
20. O botão [?] tem área mínima de 36x36px?
21. Nenhuma lógica existente das 4 telas foi alterada?

GERAL:
22. Nenhum uso de `any` no TypeScript?
23. Nenhum pacote novo instalado?

Para cada problema encontrado, corrija antes de encerrar a sessão.
Atualize o STATUS DO PROJETO em CLAUDE.md:
  - [x] Sessão 10: Tutorial inicial — swiper de boas-vindas + help contextual
```
