// Builds one BCH mainnet transaction that pays every collaborator their split
// and writes a license memo in OP_RETURN. The buyer's wallet signs via WizardConnect.
import { TransactionBuilder, gatherBchUtxos, placeholderP2PKHUnlocker } from 'cashscript'
import { computePayouts, normalizeAddress, type Beat } from './beats'
import { provider, type WizardWallet, type PathName } from './wallet'
import { LICENSE_PROTOCOL, LICENSE_VERSION } from './license'

const FEE_BUFFER = 3_000n // covers fee + leaves room for change before exact fee is computed

export interface PurchaseResult {
  txid: string
  beatId: string
  buyer: string
}

export async function buyBeat(wallet: WizardWallet, beat: Beat, tier = 'basic'): Promise<PurchaseResult> {
  const payouts = computePayouts(beat)
  const total = payouts.reduce((a, p) => a + p.sats, 0n)

  const utxos = await wallet.getUtxos()
  const balance = utxos.reduce((a, u) => a + u.satoshis, 0n)
  if (balance < total + FEE_BUFFER) {
    throw new Error(`Not enough BCH. Need about ${total + FEE_BUFFER} sats, wallet has ${balance}.`)
  }
  const { utxos: selected } = gatherBchUtxos(utxos, total + FEE_BUFFER)
  const buyer = wallet.address('receive', 0)!
  const change = wallet.changeAddress()

  const builder = new TransactionBuilder({ provider, maximumFeeSatsPerByte: 2 })
  const inputPaths: [number, PathName, number][] = []
  selected.forEach((u, i) => {
    builder.addInput(u, placeholderP2PKHUnlocker(u.address))
    inputPaths.push([i, u.path, u.addressIndex])
  })
  for (const p of payouts) builder.addOutput({ to: normalizeAddress(p.split.address), amount: p.sats })
  builder.addOpReturnOutput([LICENSE_PROTOCOL, LICENSE_VERSION, beat.id, tier])
  builder.addBchChangeOutputIfNeeded({ to: change, feeRate: 1 })

  const wcObject = builder.generateWcTransactionObject({
    broadcast: false,
    userPrompt: `SplitSheet: license "${beat.title}" (${payouts.length} payouts)`,
  })

  const res = await wallet.sign(wcObject, inputPaths)
  if (res.error || !res.signedTransaction) throw new Error(res.error ?? 'Wallet returned no signature')

  const txid = await provider.sendRawTransaction(res.signedTransaction)
  return { txid, beatId: beat.id, buyer }
}
