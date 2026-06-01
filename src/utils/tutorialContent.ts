import { colors } from '../theme/tokens'
import type { StickerStatus } from '../types/app.types'

export interface TutorialSlide {
  id: number
  emoji: string
  emojiBackground: string
  accentColor: string
  title: string
  subtitle: string
  description: string
  tip: string
  illustrationItems: IllustrationItem[]
}

export interface IllustrationItem {
  code: string
  status: StickerStatus
  country: string
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
      { code: 'BRA 5',  status: 'colada',   country: 'Brasil'    },
      { code: 'GER 12', status: 'repetida', country: 'Alemanha'  },
      { code: 'ARG 8',  status: 'faltante', country: 'Argentina' },
      { code: 'MAR 3',  status: 'estoque',  country: 'Marrocos'  },
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
      { code: 'KOR 4',  status: 'faltante', country: 'Coreia'          },
      { code: 'MAR 12', status: 'estoque',  country: 'Marrocos'        },
      { code: 'CIV 5',  status: 'faltante', country: 'Costa do Marfim' },
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
      { code: 'ESP 3',  status: 'colada',   country: 'Espanha'    },
      { code: 'FRA 7',  status: 'repetida', country: 'França'     },
      { code: 'ENG 5',  status: 'faltante', country: 'Inglaterra' },
      { code: 'POR 11', status: 'colada',   country: 'Portugal'   },
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
      { code: 'ARG 2',  status: 'faltante', country: 'Argentina' },
      { code: 'GER 12', status: 'repetida', country: 'Alemanha'  },
    ],
  },
]

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
        body: 'A barra dourada mostra quantas figurinhas você já colou em relação ao total.',
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
        body: 'Aponte a câmera e veja o status de cada figurinha em tempo real. Verde = colada, vermelho = faltante.',
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
        icon: '👉',
        heading: 'Arrastar para a direita',
        body: 'Em figurinhas do Estoque: marca como Colada no álbum.\nEm figurinhas Faltantes: move para o Estoque.',
      },
      {
        icon: '👈',
        heading: 'Arrastar para a esquerda',
        body: 'Remove uma unidade da figurinha.',
      },
      {
        icon: '🔒',
        heading: 'Figurinha protegida',
        body: 'Se uma figurinha está colada (✅), ela nunca é removida ao decrementar repetidas. É protegida automaticamente.',
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
        icon: '🎯',
        heading: 'Só matches bilaterais',
        body: 'Um match só aparece quando VOCÊ tem repetidas que o outro precisa E o outro tem repetidas que você precisa. Os dois lados ganham.',
      },
      {
        icon: '📋',
        heading: 'Propor troca',
        body: 'Toque no match → toque em "Selecionar todos" ou escolha figurinha por figurinha → envie a proposta.',
      },
      {
        icon: '🤝',
        heading: 'Aceite mútuo',
        body: 'Quando os dois aceitam, o WhatsApp de ambos é revelado para combinar o encontro.',
      },
      {
        icon: '📦',
        heading: 'Mais figurinhas = mais matches',
        body: 'Quanto mais você escanear e atualizar seu inventário, mais chances de aparecerem matches bilaterais.',
      },
      {
        icon: '✅',
        heading: 'Concluir troca',
        body: 'Após trocar fisicamente, marque como "Concluída" e o inventário de ambos atualiza automaticamente.',
      },
    ],
  },
}
