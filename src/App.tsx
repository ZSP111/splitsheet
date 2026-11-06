import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { computePayouts, loadBeats, saveBeats, satsToBch, validateBeat, type Beat, type Split } from './lib/beats'
import { WizardWallet } from './lib/wallet'
import { buyBeat, type PurchaseResult } from './lib/pay'
import { verifyLicense, type LicenseCheck } from './lib/license'

type Tab = 'catalog' | 'add' | 'verify'
const EXPLORER = 'https://explorer.salemkode.com/tx/'

export default function App() {
  const [tab, setTab] = useState<Tab>('catalog')
  const [beats, setBeats] = useState<Beat[]>(loadBeats)
  const walletRef = useRef<WizardWallet | null>(null)
  const [walletName, setWalletName] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [pairUri, setPairUri] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<PurchaseResult | null>(null)

  useEffect(() => saveBeats(beats), [beats])
  useEffect(() => {
    if (pairUri) QRCode.toDataURL(pairUri, { margin: 1, width: 280 }).then(setQr)
    else setQr(null)
  }, [pairUri])

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
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">⫽</span> SplitSheet
        </div>
        {connected ? (
          <button className="ghost" onClick={disconnect}>
            {walletName ?? 'Wallet'} · Disconnect
          </button>
        ) : (
          <button onClick={connect}>Connect wallet</button>
        )}
      </header>

      <p className="tagline">Buy a beat once. Every producer on it gets paid in the same transaction.</p>

      <nav>
        {(['catalog', 'add', 'verify'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t === 'catalog' ? 'Beats' : t === 'add' ? 'List a beat' : 'Verify license'}
          </button>
        ))}
      </nav>

      {error && <div className="alert">{error}</div>}

      {tab === 'catalog' && (
        <Catalog beats={beats} busy={busy} onBuy={buy} onRemove={(id) => setBeats(beats.filter((b) => b.id !== id))} />
      )}
      {tab === 'add' && (
        <AddBeat
          existingIds={beats.map((b) => b.id)}
          onAdd={(b) => {
            setBeats([b, ...beats])
            setTab('catalog')
          }}
        />
      )}
      {tab === 'verify' && <Verify beats={beats} />}

      {pairUri && (
        <div className="modal" onClick={() => setPairUri(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Connect with WizardConnect</h3>
            <p className="muted">Scan with Paytaca or Cashonize, or open on this phone.</p>
            {qr && <img src={qr} alt="WizardConnect pairing QR" className="qr" />}
            <a className="button" href={pairUri}>
              Open wallet app
            </a>
            <button className="ghost" onClick={() => navigator.clipboard?.writeText(pairUri)}>
              Copy link
            </button>
          </div>
        </div>
      )}

      {receipt && (
        <div className="modal" onClick={() => setReceipt(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>License bought ✓</h3>
            <p className="muted">Everyone on the split has been paid. This txid is your license.</p>
            <code className="txid">{receipt.txid}</code>
            <a className="button" href={EXPLORER + receipt.txid} target="_blank" rel="noreferrer">
              View on explorer
            </a>
            <button className="ghost" onClick={() => setReceipt(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Catalog({ beats, busy, onBuy, onRemove }: { beats: Beat[]; busy: string | null; onBuy: (b: Beat) => void; onRemove: (id: string) => void }) {
  if (!beats.length) return <div className="empty">No beats yet. List one under “List a beat”.</div>
  return (
    <div className="list">
      {beats.map((b) => (
        <article key={b.id} className="card">
          <div className="row">
            <div>
              <h3>{b.title}</h3>
              <p className="muted">
                {b.producer}
                {b.bpm ? ` · ${b.bpm} BPM` : ''}
                {b.key ? ` · ${b.key}` : ''}
              </p>
            </div>
            <div className="price">{satsToBch(b.priceSats)} BCH</div>
          </div>
          {b.previewUrl && <audio controls preload="none" src={b.previewUrl} />}
          <ul className="splits">
            {computePayouts(b).map((p, i) => (
              <li key={i}>
                <span>{p.split.name}</span>
                <span className="bar">
                  <span style={{ width: `${p.split.bps / 100}%` }} />
                </span>
                <span>{p.split.bps / 100}%</span>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="ghost small" onClick={() => onRemove(b.id)}>
              Remove
            </button>
            <button disabled={busy !== null} onClick={() => onBuy(b)}>
              {busy === b.id ? 'Waiting for wallet…' : 'Buy license'}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

const emptySplit = (): Split => ({ name: '', address: '', bps: 0 })

function AddBeat({ existingIds, onAdd }: { existingIds: string[]; onAdd: (b: Beat) => void }) {
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
    <div className="card form">
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Coal City Drill" /></label>
      <label>Producer / team<input value={producer} onChange={(e) => setProducer(e.target.value)} /></label>
      <div className="grid2">
        <label>BPM<input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} /></label>
        <label>Key<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="F#m" /></label>
      </div>
      <label>Price (BCH)<input inputMode="decimal" value={priceBch} onChange={(e) => setPriceBch(e.target.value)} /></label>
      <label>Preview URL (optional)<input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="https://…/preview.mp3" /></label>

      <h4>
        Split sheet <span className={total === 10_000 ? 'ok' : 'warn'}>{total / 100}%</span>
      </h4>
      {splits.map((s, i) => (
        <div key={i} className="split-edit">
          <input placeholder="Name" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
          <input placeholder="bitcoincash:q…" value={s.address} onChange={(e) => update(i, { address: e.target.value })} />
          <div className="row">
            <input className="pct" inputMode="decimal" placeholder="%" value={s.bps ? s.bps / 100 : ''} onChange={(e) => update(i, { bps: Math.round(Number(e.target.value || 0) * 100) })} />
            {splits.length > 1 && (
              <button className="ghost small" onClick={() => setSplits(splits.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
      <button className="ghost" onClick={() => setSplits([...splits, emptySplit()])}>
        + Add collaborator
      </button>
      {errors.length > 0 && (
        <ul className="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button onClick={submit}>List beat</button>
    </div>
  )
}

function Verify({ beats }: { beats: Beat[] }) {
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
    <div className="card form">
      <p className="muted">Paste a purchase txid. We read the license memo on-chain and check every collaborator got their cut.</p>
      <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="txid" />
      <button disabled={!/^[0-9a-f]{64}$/i.test(txid.trim()) || loading} onClick={check}>
        {loading ? 'Checking…' : 'Verify'}
      </button>
      {result && (
        <div className={result.valid ? 'verdict ok' : 'verdict warn'}>
          <strong>{result.valid ? 'Valid license' : 'Not valid'}</strong>
          {result.beatId && <div>Beat: {result.beatId} · Tier: {result.tier}</div>}
          {result.reasons.map((r) => (
            <div key={r}>{r}</div>
          ))}
        </div>
      )}
    </div>
  )
}
