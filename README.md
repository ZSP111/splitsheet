# SplitSheet

Beat licensing on Bitcoin Cash. A producer lists a beat with its split sheet (who made it, what % each person gets). A buyer pays once, and **one BCH mainnet transaction pays every collaborator directly**, with a license memo written on-chain. No middleman holding the money, no "I'll send your share later."

Built for **BCH BLAZE 2026**.

## How it works

1. **List a beat** — title, price in BCH, and collaborators with their cash addresses and %. Splits must total 100% and each payout must clear the 546-sat dust limit.
2. **Connect** — buyer pairs a wallet over **WizardConnect** (QR or deep link; tested targets: Paytaca, Cashonize).
3. **Buy** — the app scans the buyer's HD wallet (receive + change paths, gap limit 10), picks BCH-only UTXOs (never touches CashTokens), and builds a transaction with:
   - one output per collaborator
   - `OP_RETURN  "SPLITSHEET" | "1" | <beatId> | <tier>`
   - change back to the buyer
   The wallet signs, the app broadcasts. **The txid is the license.**
4. **Verify** — paste any txid; the app reads the memo and checks every collaborator got at least their cut.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ — deploy to Vercel/Netlify
```

To test on a phone with your wallet app, deploy (or `npm run dev -- --host` on the same Wi-Fi) and open it on the phone.

## Code map

| File | What it does |
|---|---|
| `src/lib/wallet.ts` | WizardConnect pairing, HD address derivation, UTXO scan, signing |
| `src/lib/pay.ts` | Builds the split-payment tx with CashScript `TransactionBuilder` |
| `src/lib/license.ts` | License memo format + on-chain verification |
| `src/lib/beats.ts` | Catalog storage, split math, validation |
| `src/App.tsx` | UI: Beats / List a beat / Verify license |

## BLAZE checklist

- [ ] Register on DoraHacks (closes **Nov 13**)
- [ ] Attend the **Nov 7** workshop / info stream (mandatory)
- [ ] Confirm the project in the BCH BLAZE Telegram + roll call
- [x] Mainnet BCH transaction feature (split payout)
- [x] WizardConnect integration
- [ ] First real mainnet purchase with small amounts, save the txid for the demo
- [ ] Deploy (live demo link)
- [ ] Presentation on the BLAZE "Widget Factory" template
- [ ] Banner
- [ ] Submit before **Nov 21, 13:00** (earliest deadline seen)

## Build-week roadmap

1. **License NFT** — mint a CashToken NFT to the buyer as the license receipt (commitment = beatId + tier), from a minting covenant so no server key is needed.
2. **On-chain catalog** — move the catalog off localStorage: each beat becomes a CashToken NFT held by the producer, split sheet in the commitment/BCMR metadata. Anyone can list; anyone can verify.
3. **Tiers** — basic / premium / exclusive (exclusive burns or locks the listing).
4. **Price in USD/NGN** with a live BCH rate, settled in BCH.
5. **Producer dashboard** — sales per beat by reading licenses for their address.

## Known limits (MVP)

- Catalog lives in the browser (localStorage), so listings don't sync between devices yet.
- Change goes to change-path index 0 every time (fine for a demo, not great for privacy).
- Verify only knows beats in the local catalog.
