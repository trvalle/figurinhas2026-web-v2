import { Document, Page, View, Text, StyleSheet, pdf } from '@react-pdf/renderer'
import { saveAs } from 'file-saver'

export interface PdfExportData {
  displayName: string
  faltantes: { sticker_code: string; country_name: string }[]
  repetidas: { sticker_code: string; quantity_owned: number }[]
}

const S = StyleSheet.create({
  page: { padding: 32, backgroundColor: '#FFFFFF', fontSize: 9 },
  header: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#CBD5E1' },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0F172A' },
  subtitle: { fontSize: 9, color: '#94A3B8', marginTop: 4 },
  statsRow: { flexDirection: 'row', marginTop: 8 },
  statBlock: { marginRight: 24 },
  statNum: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#1E293B' },
  statLabel: { fontSize: 8, color: '#94A3B8' },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#334155',
    marginTop: 16,
    marginBottom: 8,
  },
  countryRow: { marginBottom: 8 },
  countryName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#475569', marginBottom: 3 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    fontSize: 7,
    color: '#334155',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 4,
    paddingRight: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 2,
    marginRight: 3,
    marginBottom: 3,
  },
  chipRepeat: {
    fontSize: 7,
    color: '#92400E',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 4,
    paddingRight: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 2,
    marginRight: 3,
    marginBottom: 3,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginVertical: 14 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    textAlign: 'center',
    fontSize: 7,
    color: '#CBD5E1',
  },
})

function groupByCountry(items: PdfExportData['faltantes']): [string, string[]][] {
  const map = new Map<string, string[]>()
  items.forEach(({ country_name, sticker_code }) => {
    const arr = map.get(country_name) ?? []
    arr.push(sticker_code)
    map.set(country_name, arr)
  })
  return [...map.entries()]
}

function AlbumPDF({ data }: { data: PdfExportData }) {
  const grouped = groupByCountry(data.faltantes)
  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <Document title="Álbum Copa 2026" author={data.displayName}>
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <Text style={S.title}>ÁLBUM COPA 2026</Text>
          <Text style={S.subtitle}>{data.displayName}  ·  {dateStr}</Text>
          <View style={S.statsRow}>
            <View style={S.statBlock}>
              <Text style={S.statNum}>{data.faltantes.length}</Text>
              <Text style={S.statLabel}>faltantes</Text>
            </View>
            <View style={S.statBlock}>
              <Text style={S.statNum}>{data.repetidas.length}</Text>
              <Text style={S.statLabel}>repetidas</Text>
            </View>
          </View>
        </View>

        <Text style={S.sectionTitle}>FIGURINHAS FALTANTES  ({data.faltantes.length})</Text>
        {grouped.map(([country, codes]) => (
          <View key={country} style={S.countryRow}>
            <Text style={S.countryName}>{country}</Text>
            <View style={S.chipsRow}>
              {codes.map((code) => (
                <Text key={code} style={S.chip}>{code}</Text>
              ))}
            </View>
          </View>
        ))}

        {data.repetidas.length > 0 && (
          <View>
            <View style={S.divider} />
            <Text style={S.sectionTitle}>FIGURINHAS REPETIDAS  ({data.repetidas.length})</Text>
            <View style={S.chipsRow}>
              {data.repetidas.map((r) => (
                <Text key={r.sticker_code} style={S.chipRepeat}>
                  {r.sticker_code} ×{r.quantity_owned - 1}
                </Text>
              ))}
            </View>
          </View>
        )}

        <Text style={S.footer}>Gerado pelo app Figurinhas 2026  ·  Copa do Mundo 2026</Text>
      </Page>
    </Document>
  )
}

export async function exportPDF(data: PdfExportData): Promise<void> {
  if (typeof window === 'undefined') return
  const blob = await pdf(<AlbumPDF data={data} />).toBlob()
  const slug = data.displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  saveAs(blob, `album-copa-2026-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
