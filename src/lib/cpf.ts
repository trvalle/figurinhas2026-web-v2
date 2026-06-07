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
