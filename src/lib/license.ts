// License memo format (OP_RETURN, 4 pushes):  "SPLITSHEET" | "1" | <beatId> | <tier>
// Verification = memo is present AND every collaborator output in the tx meets their split.
import { decodeTransaction, hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth'
import { computePayouts, normalizeAddress, type Beat } from './beats'
import { provider } from './wallet'

export const LICENSE_PROTOCOL = 'SPLITSHEET'
export const LICENSE_VERSION = '1'

const dec = new TextDecoder()

/** Minimal pushdata parser for OP_RETURN outputs. */
function parsePushes(script: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  let i = 1 // skip OP_RETURN
  while (i < script.length) {
    const op = script[i++]
    let len: number
    if (op >= 0x01 && op <= 0x4b) len = op
    else if (op === 0x4c) len = script[i++]
    else if (op === 0x4d) { len = script[i] | (script[i + 1] << 8); i += 2 }
    else return out
    out.push(script.slice(i, i + len))
    i += len
  }
  return out
}

export interface LicenseCheck {
  valid: boolean
  beatId?: string
  tier?: string
  reasons: string[]
}

export async function verifyLicense(txid: string, beats: Beat[]): Promise<LicenseCheck> {
  const raw = await provider.getRawTransaction(txid)
  const tx = decodeTransaction(hexToBin(raw))
  if (typeof tx === 'string') return { valid: false, reasons: [`Could not decode tx: ${tx}`] }

  const memoOut = tx.outputs.find((o) => o.lockingBytecode[0] === 0x6a)
  if (!memoOut) return { valid: false, reasons: ['No license memo in this transaction'] }
  const [proto, ver, id, tier] = parsePushes(memoOut.lockingBytecode).map((b) => dec.decode(b))
  if (proto !== LICENSE_PROTOCOL || ver !== LICENSE_VERSION)
    return { valid: false, reasons: ['Memo is not a SplitSheet license'] }

  const beat = beats.find((b) => b.id === id)
  if (!beat) return { valid: false, beatId: id, tier, reasons: [`Beat "${id}" is not in this catalog`] }

  const paid = new Map<string, bigint>()
  for (const o of tx.outputs) {
    const addr = lockingBytecodeToCashAddress({ bytecode: o.lockingBytecode, prefix: 'bitcoincash' })
    if (typeof addr === 'string') continue
    paid.set(addr.address, (paid.get(addr.address) ?? 0n) + o.valueSatoshis)
  }
  const reasons: string[] = []
  for (const p of computePayouts(beat)) {
    const want = normalizeAddress(p.split.address)
    if ((paid.get(want) ?? 0n) < p.sats) reasons.push(`${p.split.name} was underpaid`)
  }
  return { valid: reasons.length === 0, beatId: id, tier, reasons }
}
