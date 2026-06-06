export interface CreditPackage {
  id: 'pack_basic' | 'pack_standard' | 'pack_premium'
  name: string
  credits: number
  priceBRL: number
  priceDisplay: string
  highlight?: boolean
}

export interface UserCredits {
  userId: string
  balance: number
  totalEarned: number
  totalSpent: number
  updatedAt: string
}

export interface CreditTransaction {
  id: string
  userId: string
  amount: number
  type: 'signup_bonus' | 'purchase' | 'ocr_deduction'
  description: string | null
  referenceId: string | null
  createdAt: string
}

export interface Payment {
  id: string
  userId: string
  mpPreferenceId: string | null
  mpPaymentId: string | null
  packId: string
  credits: number
  amountBrl: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  createdAt: string
}
