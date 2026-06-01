import { getSupabaseClient } from './supabase'

function fuzzCoord(value: number): number {
  return value + (Math.random() * 2 - 1) * 0.0009
}

export async function hasLocation(): Promise<boolean> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('users')
    .select('location')
    .eq('id', user.id)
    .single()

  return !!(data?.location)
}

async function persistLocation(lat: number, lng: number): Promise<void> {
  const supabase = getSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('users')
    .update({ location: `POINT(${lng} ${lat})` })
    .eq('id', user.id)
}

export async function requestAndSaveLocation(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = fuzzCoord(pos.coords.latitude)
        const lng = fuzzCoord(pos.coords.longitude)
        try {
          await persistLocation(lat, lng)
          resolve(true)
        } catch {
          resolve(false)
        }
      },
      () => resolve(false),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    )
  })
}
