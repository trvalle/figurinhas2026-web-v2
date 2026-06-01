// Geocoding: CEP → lat/lng via BrasilAPI v2 com fallback Photon (OSM).
// Aplica fuzzing de privacidade (~100m) antes de retornar.
// IDÊNTICO ao app mobile — sem dependências externas além de fetch.

interface BrasilApiCepV2Response {
  cep: string
  state: string
  city: string
  neighborhood: string
  street: string
  service: string
  location?: {
    type: string
    coordinates: {
      longitude: string
      latitude: string
    }
  }
}

interface PhotonFeature {
  geometry: {
    type: string
    coordinates: [number, number]
  }
}

interface PhotonResponse {
  features: PhotonFeature[]
}

export interface CepCoordinates {
  lat: number
  lng: number
  bairro: string
  cidade: string
}

function applyPrivacyFuzz(): number {
  return (Math.random() - 0.5) * 0.002
}

export async function getCepCoordinates(cep: string): Promise<CepCoordinates> {
  const brasilApiRes = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`)

  if (brasilApiRes.status === 404) {
    throw new Error('CEP não encontrado. Verifique o número digitado.')
  }
  if (!brasilApiRes.ok) {
    throw new Error('Não foi possível consultar o CEP. Verifique sua conexão.')
  }

  const brasilApiData = (await brasilApiRes.json()) as BrasilApiCepV2Response

  const bairro = brasilApiData.neighborhood || brasilApiData.city
  const cidade = brasilApiData.city

  if (!cidade) {
    throw new Error('CEP inválido. Verifique o número digitado.')
  }

  const coords = brasilApiData.location?.coordinates
  if (coords?.latitude && coords?.longitude) {
    return {
      lat: parseFloat(coords.latitude) + applyPrivacyFuzz(),
      lng: parseFloat(coords.longitude) + applyPrivacyFuzz(),
      bairro,
      cidade,
    }
  }

  const query = encodeURIComponent(`${bairro} ${cidade} ${brasilApiData.state} Brasil`)
  const photonRes = await fetch(`https://photon.komoot.io/api/?q=${query}&limit=1`)

  if (!photonRes.ok) {
    throw new Error('Falha ao localizar o endereço. Tente novamente.')
  }

  const photonData = (await photonRes.json()) as PhotonResponse

  if (!photonData.features?.length) {
    throw new Error('Endereço não localizado. Verifique o CEP.')
  }

  const [lng, lat] = photonData.features[0]!.geometry.coordinates

  return {
    lat: lat + applyPrivacyFuzz(),
    lng: lng + applyPrivacyFuzz(),
    bairro,
    cidade,
  }
}
