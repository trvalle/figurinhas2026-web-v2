import type { CreditPackage } from './types'

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'pack_basic',
    name: 'Básico',
    credits: 50,
    priceBRL: 2.99,
    priceDisplay: 'R$2,99',
  },
  {
    id: 'pack_standard',
    name: 'Padrão',
    credits: 200,
    priceBRL: 7.99,
    priceDisplay: 'R$7,99',
    highlight: true,
  },
  {
    id: 'pack_premium',
    name: 'Premium',
    credits: 500,
    priceBRL: 14.99,
    priceDisplay: 'R$14,99',
  },
]

export const SIGNUP_BONUS_CREDITS = 20

export function getPackageById(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find(p => p.id === id)
}
