import type { Beat } from './beats'

// Example listings so the catalog never opens empty. Buying is disabled for these —
// the addresses are placeholders, not real people.
export const DEMO_BEATS: (Beat & { demo: true })[] = [
  {
    demo: true,
    id: 'coal-city-drill',
    title: 'Coal City Drill',
    producer: 'Peter & friends',
    bpm: 142,
    key: 'F#m',
    priceSats: 2_000_000,
    splits: [
      { name: 'Peter (beat)', address: '', bps: 5000 },
      { name: 'Ada (melody)', address: '', bps: 3000 },
      { name: 'Tunde (mix)', address: '', bps: 2000 },
    ],
  },
  {
    demo: true,
    id: 'ogbete-nights',
    title: 'Ogbete Nights',
    producer: 'Kachi Keys',
    bpm: 112,
    key: 'Am',
    priceSats: 1_500_000,
    splits: [
      { name: 'Kachi (keys)', address: '', bps: 6000 },
      { name: 'Femi (drums)', address: '', bps: 4000 },
    ],
  },
  {
    demo: true,
    id: 'harmattan-log',
    title: 'Harmattan Log',
    producer: 'Ugo, Zee, Bayo, Ife',
    bpm: 113,
    key: 'C#m',
    priceSats: 3_000_000,
    splits: [
      { name: 'Ugo (log drum)', address: '', bps: 4000 },
      { name: 'Zee (pads)', address: '', bps: 2500 },
      { name: 'Bayo (vocals)', address: '', bps: 2000 },
      { name: 'Ife (master)', address: '', bps: 1500 },
    ],
  },
]
