import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

// Instância singleton do cliente Anthropic
// Reutilizada entre requisições para eficiência
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  // Verificar se a chave está configurada
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY não configurada' },
      { status: 500 }
    )
  }

  let imageBase64: string
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  try {
    const body = await request.json()
    imageBase64 = body.image
    mediaType = body.mediaType ?? 'image/jpeg'

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'Campo "image" obrigatório (base64)' },
        { status: 400 }
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Body inválido — esperado JSON com campo "image"' },
      { status: 400 }
    )
  }

  // Verificar e deduzir crédito
  const creditResponse = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/credits/deduct`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ description: 'OCR de figurinha Copa 2026' }),
    }
  )

  if (!creditResponse.ok) {
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

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Esta é uma foto de uma ou mais figurinhas da Copa do Mundo FIFA 2026 (Panini).
Cada figurinha tem um badge escuro no canto superior direito com seu código.
O código tem o formato: 2 a 4 letras maiúsculas seguidas de 1 ou 2 números.
Exemplos: TUR 1, IRQ 19, BRA 5, FWC 12, SCO 16, JOR 12, NOR 16.

Identifique TODOS os códigos visíveis na imagem.
Retorne os códigos separados por espaço em uma única linha.
Exemplos de resposta com múltiplos: "BRA 5 TUR 1 IRQ 19"
Exemplos de resposta com um: "TUR 1"
Se não identificar nenhum código, retorne apenas: UNKNOWN
Não inclua explicações, pontuação ou texto adicional.`,
            },
          ],
        },
      ],
    })

    // Extrair texto da resposta
    const textBlock = response.content.find(block => block.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : 'UNKNOWN'

    return NextResponse.json({
      text,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorDetails = error instanceof Error ? error.stack : undefined
    console.error('[Claude Haiku OCR] Erro:', errorMessage, errorDetails)
    return NextResponse.json(
      { error: 'Erro ao processar imagem com Claude Haiku' },
      { status: 500 }
    )
  }
}
