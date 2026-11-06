// Beat catalog + split validation. Stored in localStorage for the MVP;
// swap for a backend (or an on-chain registry via CashTokens) later.

export interface Split {
  name: string
  address: string // bitcoincash:q... (P2PKH or P2SH)
  bps: number // basis points, all splits must sum to 10_000
}

export interface Beat {
  id: string // short slug, goes into the OP_RETURN license memo
  title: string
  producer: string
  bpm?: number
  key?: string
  priceSats: number
  previewUrl?: string
  splits: Split[]
}

export const DUST_SATS = 546
const STORAGE_KEY = 'splitsheet-beats'

export function loadBeats(): Beat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Beat[]) : []
  } catch {
    return []
  }
}

export function saveBeats(beats: Beat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(beats))
  } catch {
    /* storage unavailable — keep in memory only */
  }
}

/** Split a price into per-collaborator payouts. Rounding remainder goes to the first split. */
export function computePayouts(beat: Beat): { split: Split; sats: bigint }[] {
  const total = BigInt(beat.priceSats)
  const payouts = beat.splits.map((split) => ({
    split,
    sats: (total * BigInt(split.bps)) / 10_000n,
  }))
  const assigned = payouts.reduce((acc, p) => acc + p.sats, 0n)
  if (payouts.length) payouts[0].sats += total - assigned
  return payouts
}

export function validateBeat(beat: Beat): string[] {
  const errors: string[] = []
  if (!/^[a-z0-9-]{2,24}$/.test(beat.id)) errors.push('ID must be 2–24 chars: a-z, 0-9, dash')
  if (!beat.title.trim()) errors.push('Title is required')
  if (!beat.splits.length) errors.push('Add at least one collaborator')
  const sum = beat.splits.reduce((a, s) => a + s.bps, 0)
  if (sum !== 10_000) errors.push(`Splits add up to ${sum / 100}%, need 100%`)
  for (const s of beat.splits) {
    if (!/^(bitcoincash:)?[qp][a-z0-9]{41}$/.test(s.address.trim()))
      errors.push(`${s.name || 'Collaborator'}: not a valid BCH cash address`)
  }
  for (const p of computePayouts(beat)) {
    if (p.sats < BigInt(DUST_SATS))
      errors.push(`${p.split.name || 'A collaborator'} gets ${p.sats} sats, below the ${DUST_SATS} sat dust limit — raise the price`)
  }
  return errors
}

export const normalizeAddress = (a: string) => {
  const t = a.trim().toLowerCase()
  return t.startsWith('bitcoincash:') ? t : `bitcoincash:${t}`
}

export const satsToBch = (sats: bigint | number) => (Number(sats) / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
