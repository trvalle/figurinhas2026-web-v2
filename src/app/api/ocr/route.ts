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
              text: `Esta é a foto do verso de uma figurinha da Copa do Mundo FIFA 2026 (Panini).
No canto superior direito há um badge escuro com o código da figurinha.
O código tem o formato: 2 a 4 letras maiúsculas seguidas de 1 ou 2 números.
Exemplos: TUR 1, IRQ 19, BRA 5, FWC 12, SCO 16.

Retorne APENAS o código da figurinha, sem explicações, sem pontuação.
Se não conseguir identificar o código, retorne apenas: UNKNOWN`,
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
    console.error('[Claude Haiku OCR] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao processar imagem com Claude Haiku' },
      { status: 500 }
    )
  }
}
