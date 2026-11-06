// WizardConnect dapp session: QR/deeplink pairing, HD address discovery, signing.
import { DappConnectionManager } from '@wizardconnect/dapp'
import { initiateDappRelay, type DappRelayResult, type SignTransactionResponse } from '@wizardconnect/core'
import { publicKeyToP2pkhCashAddress } from '@bitauth/libauth'
import { ElectrumNetworkProvider, Network, type SpendableUtxo } from 'cashscript'

export const provider = new ElectrumNetworkProvider(Network.MAINNET)

export type PathName = 'receive' | 'change'
const CHILD_INDEX: Record<PathName, number> = { receive: 0, change: 1 }

export interface WalletUtxo extends SpendableUtxo {
  address: string
  path: PathName
  addressIndex: number
}

const GAP_LIMIT = 10

export class WizardWallet {
  manager = new DappConnectionManager('SplitSheet')
  relay: DappRelayResult | null = null
  connected = false

  /** Starts pairing. Returns the URI to show as a QR code / open as a deep link. */
  pair(onReady: (walletName: string | null) => void, onDisconnect: () => void): DappRelayResult {
    this.manager.on('walletready', () => {
      this.connected = true
      onReady(this.manager.walletName)
    })
    this.manager.on('disconnect', () => {
      this.connected = false
      this.manager.clearStoredSession()
      onDisconnect()
    })
    this.relay = initiateDappRelay(({ client, status }) => this.manager.updateConnection(client, status))
    this.manager.attachRelay(this.relay)
    return this.relay
  }

  address(path: PathName, index: number): string | undefined {
    const pubkey = this.manager.getPubkey(CHILD_INDEX[path], BigInt(index))
    if (!pubkey) return undefined
    return publicKeyToP2pkhCashAddress({ publicKey: pubkey }).address
  }

  /** Scan receive + change paths with a gap limit and collect spendable BCH-only UTXOs. */
  async getUtxos(): Promise<WalletUtxo[]> {
    const all: WalletUtxo[] = []
    for (const path of ['receive', 'change'] as PathName[]) {
      let gap = 0
      for (let i = 0; gap < GAP_LIMIT; i++) {
        const address = this.address(path, i)
        if (!address) break
        const utxos = await provider.getUtxos(address)
        if (utxos.length === 0) gap++
        else gap = 0
        for (const u of utxos) {
          if (u.token) continue // never spend token UTXOs for a BCH payment
          all.push({ ...u, address, path, addressIndex: i })
        }
      }
    }
    return all
  }

  /** First change address with no UTXOs — good enough for the MVP. */
  changeAddress(): string {
    const a = this.address('change', 0) ?? this.address('receive', 0)
    if (!a) throw new Error('Wallet not ready')
    return a
  }

  async sign(transaction: unknown, inputPaths: [number, PathName, number][]): Promise<SignTransactionResponse> {
    // WcTransactionObject from CashScript matches the wc2-bch transaction shape WizardConnect expects.
    return this.manager.signTransaction({ transaction: transaction as never, inputPaths })
  }

  async disconnect() {
    try {
      await this.manager.sendDisconnect('Bye from SplitSheet')
    } finally {
      this.relay?.cleanup()
      this.manager.clearStoredSession()
      this.manager.destroy()
      this.connected = false
    }
  }
}
