import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { computePayouts, loadBeats, saveBeats, satsToBch, validateBeat, type Beat, type Split } from './lib/beats'
import { DEMO_BEATS } from './lib/demo'
import { WizardWallet } from './lib/wallet'
import { buyBeat, type PurchaseResult } from './lib/pay'
import { verifyLicense, type LicenseCheck } from './lib/license'

type Tab = 'beats' | 'list' | 'check'
type ListedBeat = Beat & { demo?: boolean }
const EXPLORER = 'https://explorer.salemkode.com/tx/'
const SEGMENT_COLORS = ['#FF7A2F', '#3D5AFE', '#14A86B', '#D63F8C', '#E8A800', '#7B61FF']
const color = (i: number) => SEGMENT_COLORS[i % SEGMENT_COLORS.length]

export default function App() {
  const [tab, setTab] = useState<Tab>('beats')
  const [beats, setBeats] = useState<Beat[]>(loadBeats)
  const walletRef = useRef<WizardWallet | null>(null)
  const [walletName, setWalletName] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [pairUri, setPairUri] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<PurchaseResult | null>(null)
  const appRef = useRef<HTMLElement>(null)

  useEffect(() => saveBeats(beats), [beats])
  useEffect(() => {
    if (pairUri) QRCode.toDataURL(pairUri, { margin: 1, width: 320, color: { dark: '#1A1D3A' } }).then(setQr)
    else setQr(null)
  }, [pairUri])

  const catalog: ListedBeat[] = [...beats, ...DEMO_BEATS]

  function goTo(t: Tab) {
    setTab(t)
    appRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function connect() {
    setError(null)
    const w = new WizardWallet()
    walletRef.current = w
    const relay = w.pair(
      (name) => {
        setConnected(true)
        setWalletName(name)
        setPairUri(null)
      },
      () => {
        setConnected(false)
        setWalletName(null)
      },
    )
    setPairUri(relay.uri)
  }

  async function disconnect() {
    await walletRef.current?.disconnect()
    walletRef.current = null
    setConnected(false)
    setWalletName(null)
  }

  async function buy(beat: Beat) {
    if (!walletRef.current || !connected) return connect()
    setError(null)
    setBusy(beat.id)
    try {
      setReceipt(await buyBeat(walletRef.current, beat))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="#">
          <SplitMark /> SplitSheet
        </a>
        {connected ? (
          <button className="btn quiet" onClick={disconnect}>
            <span className="dot" /> {walletName ?? 'Wallet'} connected
          </button>
        ) : (
          <button className="btn quiet" onClick={connect}>
            Connect wallet
          </button>
        )}
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              Sell one beat.
              <br />
              Pay everyone who made it.
            </h1>
            <p className="lede">
              The buyer pays once in Bitcoin Cash. The producer, the writer and the engineer each get their share in that same
              payment, straight to their own wallets. Nobody holds the money, nobody waits.
            </p>
            <div className="hero-actions">
              <button className="btn" onClick={() => goTo('beats')}>
                Browse beats
              </button>
              <button className="btn outline" onClick={() => goTo('list')}>
                List your beat
              </button>
            </div>
          </div>
          <HeroSheet beat={DEMO_BEATS[0]} />
        </section>

        <section className="how" aria-labelledby="how-title">
          <h2 id="how-title">How a sale works</h2>
          <ol className="steps">
            <li>
              <span className="step-n">1</span>
              <h3>List with your split</h3>
              <p>Add the beat, set a price, and write down who gets what. Same as a paper split sheet, but it pays out.</p>
            </li>
            <li>
              <span className="step-n">2</span>
              <h3>A buyer pays once</h3>
              <p>They connect a Bitcoin Cash wallet like Paytaca and approve one payment. Fees are a fraction of a naira.</p>
            </li>
            <li>
              <span className="step-n">3</span>
              <h3>Everyone gets paid instantly</h3>
              <p>Each collaborator receives their percentage in seconds. The payment record is the buyer's license.</p>
            </li>
          </ol>
        </section>

        <section className="app" ref={appRef} aria-label="Marketplace">
          <div className="tabs" role="tablist">
            {(
              [
                ['beats', 'Beats'],
                ['list', 'List your beat'],
                ['check', 'Check a license'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab on' : 'tab'} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </div>

          {error && (
            <div className="notice bad" role="alert">
              {error}
            </div>
          )}

          {tab === 'beats' && (
            <Catalog beats={catalog} busy={busy} connected={connected} onBuy={buy} onRemove={(id) => setBeats(beats.filter((b) => b.id !== id))} />
          )}
          {tab === 'list' && (
            <ListBeat
              existingIds={catalog.map((b) => b.id)}
              onAdd={(b) => {
                setBeats([b, ...beats])
                setTab('beats')
              }}
            />
          )}
          {tab === 'check' && <CheckLicense beats={beats} />}
        </section>
      </main>

      <footer className="foot">
        <span>Built on Bitcoin Cash for BCH BLAZE 2026.</span>
        <a href="https://github.com/ZSP111/splitsheet" target="_blank" rel="noreferrer">
          Source code
        </a>
      </footer>

      {pairUri && (
        <Sheet onClose={() => setPairUri(null)} title="Connect your wallet">
          <p className="muted">Scan this with Paytaca or Cashonize. On your phone, tap the button instead.</p>
          {qr && <img src={qr} alt="Wallet connection code" className="qr" />}
          <a className="btn" href={pairUri}>
            Open wallet app
          </a>
          <button className="btn quiet" onClick={() => navigator.clipboard?.writeText(pairUri)}>
            Copy connection link
          </button>
        </Sheet>
      )}

      {receipt && (
        <Sheet onClose={() => setReceipt(null)} title="License bought">
          <p className="muted">Everyone on the split sheet has been paid. Keep this payment ID, it's your proof of license.</p>
          <code className="txid">{receipt.txid}</code>
          <a className="btn" href={EXPLORER + receipt.txid} target="_blank" rel="noreferrer">
            See the payment
          </a>
          <button className="btn quiet" onClick={() => setReceipt(null)}>
            Done
          </button>
        </Sheet>
      )}
    </>
  )
}

/* ---------- pieces ---------- */

function SplitMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="0" y="4" width="10" height="14" rx="3" fill="#FF7A2F" />
      <rect x="11" y="4" width="6" height="14" rx="3" fill="#3D5AFE" />
      <rect x="18" y="4" width="4" height="14" rx="2" fill="#14A86B" />
    </svg>
  )
}

function SplitBar({ splits, animate = false, tall = false }: { splits: Split[]; animate?: boolean; tall?: boolean }) {
  return (
    <div className={`splitbar${tall ? ' tall' : ''}${animate ? ' animate' : ''}`} role="img" aria-label={splits.map((s) => `${s.name} ${s.bps / 100}%`).join(', ')}>
      {splits.map((s, i) => (
        <span key={i} style={{ flexGrow: s.bps, background: color(i), animationDelay: `${150 + i * 180}ms` }} />
      ))}
    </div>
  )
}

/** Deterministic little waveform from the beat id, coloured by split. */
function Waveform({ beat }: { beat: Beat }) {
  const bars = useMemo(() => {
    let h = 0
    for (const c of beat.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
    const total = beat.splits.reduce((a, s) => a + s.bps, 0) || 1
    const out: { y: number; c: string }[] = []
    for (let i = 0; i < 40; i++) {
      h = (h * 1103515245 + 12345) >>> 0
      const frac = i / 40
      let acc = 0
      let idx = 0
      for (let j = 0; j < beat.splits.length; j++) {
        acc += beat.splits[j].bps / total
        if (frac < acc) {
          idx = j
          break
        }
      }
      out.push({ y: 0.25 + ((h >>> 8) % 1000) / 1333, c: color(idx) })
    }
    return out
  }, [beat])
  return (
    <svg className="wave" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b, i) => (
        <rect key={i} x={i * 4 + 0.5} y={20 - b.y * 18} width="2.6" height={b.y * 36} rx="1.3" fill={b.c} />
      ))}
    </svg>
  )
}

function HeroSheet({ beat }: { beat: Beat }) {
  const payouts = computePayouts(beat)
  return (
    <figure className="sheet-card" aria-label="Example split sheet">
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{beat.title}</div>
          <div className="muted small">
            {beat.bpm} BPM, {beat.key}
          </div>
        </div>
        <div className="sheet-price">{satsToBch(beat.priceSats)} BCH</div>
      </div>
      <SplitBar splits={beat.splits} animate tall />
      <ul className="payout-list">
        {payouts.map((p, i) => (
          <li key={i}>
            <span className="swatch" style={{ background: color(i) }} />
            <span className="who">{p.split.name}</span>
            <span className="pct">{p.split.bps / 100}%</span>
            <span className="amt">{satsToBch(p.sats)} BCH</span>
          </li>
        ))}
      </ul>
      <figcaption className="small muted">One payment from the buyer, {payouts.length} payouts, settled in seconds.</figcaption>
    </figure>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Catalog({
  beats,
  busy,
  connected,
  onBuy,
  onRemove,
}: {
  beats: ListedBeat[]
  busy: string | null
  connected: boolean
  onBuy: (b: Beat) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="grid">
      {beats.map((b) => (
        <article key={b.id} className="beat">
          <Waveform beat={b} />
          <div className="beat-head">
            <div>
              <h3>{b.title}</h3>
              <p className="muted small">
                {b.producer}
                {b.bpm ? `, ${b.bpm} BPM` : ''}
                {b.key ? `, ${b.key}` : ''}
              </p>
            </div>
            <div className="price">{satsToBch(b.priceSats)} BCH</div>
          </div>
          {b.previewUrl && <audio controls preload="none" src={b.previewUrl} />}
          <SplitBar splits={b.splits} />
          <ul className="legend">
            {b.splits.map((s, i) => (
              <li key={i}>
                <span className="swatch" style={{ background: color(i) }} />
                {s.name} <b>{s.bps / 100}%</b>
              </li>
            ))}
          </ul>
          <div className="beat-foot">
            {b.demo ? (
              <span className="tag">Example listing</span>
            ) : (
              <button className="link" onClick={() => onRemove(b.id)}>
                Remove
              </button>
            )}
            {!b.demo && (
              <button className="btn" disabled={busy !== null} onClick={() => onBuy(b)}>
                {busy === b.id ? 'Approve in your wallet…' : connected ? 'Buy license' : 'Connect to buy'}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}

const emptySplit = (): Split => ({ name: '', address: '', bps: 0 })

function ListBeat({ existingIds, onAdd }: { existingIds: string[]; onAdd: (b: Beat) => void }) {
  const [title, setTitle] = useState('')
  const [producer, setProducer] = useState('')
  const [bpm, setBpm] = useState('')
  const [key, setKey] = useState('')
  const [priceBch, setPriceBch] = useState('0.001')
  const [previewUrl, setPreviewUrl] = useState('')
  const [splits, setSplits] = useState<Split[]>([{ ...emptySplit(), bps: 10_000 }])
  const [errors, setErrors] = useState<string[]>([])

  const id = useMemo(() => {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'beat'
    let n = base
    for (let i = 2; existingIds.includes(n); i++) n = `${base}-${i}`
    return n
  }, [title, existingIds])

  const total = splits.reduce((a, s) => a + s.bps, 0)
  const update = (i: number, patch: Partial<Split>) => setSplits(splits.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  function submit() {
    const beat: Beat = {
      id,
      title: title.trim(),
      producer: producer.trim() || 'Unknown',
      bpm: bpm ? Number(bpm) : undefined,
      key: key.trim() || undefined,
      priceSats: Math.round(Number(priceBch) * 1e8),
      previewUrl: previewUrl.trim() || undefined,
      splits: splits.map((s) => ({ ...s, name: s.name.trim(), address: s.address.trim() })),
    }
    const errs = validateBeat(beat)
    setErrors(errs)
    if (!errs.length) onAdd(beat)
  }

  return (
    <div className="panel form">
      <div className="fields">
        <label className="span2">
          Beat title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Coal City Drill" />
        </label>
        <label className="span2">
          Producer or team name
          <input value={producer} onChange={(e) => setProducer(e.target.value)} />
        </label>
        <label>
          BPM
          <input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} placeholder="140" />
        </label>
        <label>
          Key
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="F#m" />
        </label>
        <label>
          Price in BCH
          <input inputMode="decimal" value={priceBch} onChange={(e) => setPriceBch(e.target.value)} />
        </label>
        <label>
          Preview link (optional)
          <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://…/preview.mp3" />
        </label>
      </div>

      <div className="split-head">
        <h3>Who made it</h3>
        <span className={total === 10_000 ? 'total ok' : 'total off'}>{total / 100}% of 100%</span>
      </div>
      <SplitBar splits={splits.filter((s) => s.bps > 0).length ? splits : [{ name: 'empty', address: '', bps: 1 }]} />

      {splits.map((s, i) => (
        <div key={i} className="collab">
          <span className="swatch big" style={{ background: color(i) }} />
          <input aria-label="Name and role" placeholder="Name and role, e.g. Ada (melody)" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
          <input aria-label="Bitcoin Cash address" placeholder="bitcoincash:q…" value={s.address} onChange={(e) => update(i, { address: e.target.value })} />
          <div className="pct-wrap">
            <input
              aria-label="Share in percent"
              className="pct"
              inputMode="decimal"
              placeholder="0"
              value={s.bps ? s.bps / 100 : ''}
              onChange={(e) => update(i, { bps: Math.round(Number(e.target.value || 0) * 100) })}
            />
            <span>%</span>
          </div>
          {splits.length > 1 && (
            <button className="link" aria-label="Remove collaborator" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <button className="btn outline" onClick={() => setSplits([...splits, emptySplit()])}>
        Add a collaborator
      </button>

      {errors.length > 0 && (
        <ul className="notice bad" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button className="btn wide" onClick={submit}>
        List this beat
      </button>
    </div>
  )
}

function CheckLicense({ beats }: { beats: Beat[] }) {
  const [txid, setTxid] = useState('')
  const [result, setResult] = useState<LicenseCheck | null>(null)
  const [loading, setLoading] = useState(false)
  async function check() {
    setLoading(true)
    setResult(null)
    try {
      setResult(await verifyLicense(txid.trim(), beats))
    } catch (e) {
      setResult({ valid: false, reasons: [e instanceof Error ? e.message : String(e)] })
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="panel form narrow">
      <p className="muted">
        Someone says they bought your beat? Paste their payment ID. We read the payment on the Bitcoin Cash network and check every
        collaborator got their share.
      </p>
      <label>
        Payment ID
        <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="64-character payment ID" />
      </label>
      <button className="btn wide" disabled={!/^[0-9a-f]{64}$/i.test(txid.trim()) || loading} onClick={check}>
        {loading ? 'Checking…' : 'Check license'}
      </button>
      {result && (
        <div className={result.valid ? 'notice good' : 'notice bad'}>
          <strong>{result.valid ? 'Valid license' : 'Not a valid license'}</strong>
          {result.beatId && (
            <div>
              Beat: {result.beatId}, tier: {result.tier}
            </div>
          )}
          {result.reasons.map((r) => (
            <div key={r}>{r}</div>
          ))}
        </div>
      )}
    </div>
  )
}
