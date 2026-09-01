# ChainBreach

Automated attribution of unknown cryptocurrency wallets to the nearest Virtual Asset Service Provider (VASP), built for SIH problem statement **SIH26182** (Ministry of Home Affairs / I4C).

**Live demo:** [chain-breach.vercel.app](https://chain-breach.vercel.app)

Given a suspect wallet address, the tool traces its transaction graph, applies established blockchain-forensics heuristics to find counterparties, and checks those counterparties against a database of known VASP (exchange) addresses — returning a confidence-scored list of candidate VASPs with the on-chain evidence behind each one.

## How it works

1. **Fetch** — pull the address's recent transactions from a public block explorer (Blockstream Esplora for Bitcoin, Blockscout for Ethereum — pick the chain from the toggle in the UI).
2. **Trace** — follow the trail outward up to 2 hops (not just the target's own transactions), applying two heuristics at each hop to find related addresses:
   - *Common-input-ownership*: addresses spent together in the same transaction as the target are (almost always) controlled by the same wallet.
   - *Direct counterparty*: addresses the target sent funds to, or received funds from, in a single hop — this is what "deposit address" attribution relies on.
   - High fan-out transactions (batched exchange sweeps with dozens of inputs/outputs) are excluded from both, to avoid the classic "super-cluster" failure mode. Expansion stops once a hop reaches a known VASP — that's the destination — and is bounded so a busy wallet can't blow up runtime.
3. **Attribute** — check every related address against a database of 8,400+ known VASP/illicit-entity addresses (sourced from GraphSense's public, MIT-licensed TagPacks), and score each matching VASP by the strength, count, and hop-distance of evidence. Matches in high-risk categories (ransomware, darknet markets, mixers, sanctions) are flagged separately from ordinary exchange matches.
4. **Report** — return ranked candidates with confidence bands (high / medium / low), the evidence trail (transaction IDs + source citations), and an interactive 3D graph (drag to rotate, scroll to zoom) for visual inspection. A one-click "Export report" builds a print-friendly summary (metadata, candidates, evidence, graph snapshot) and opens the browser's print dialog to save as PDF.

Addresses can be analyzed one at a time or in a batch (paste/upload up to 15 at once) via the tabbed UI, on either Bitcoin or Ethereum. `/api/stats` exposes live dataset size.

If the live API is unreachable, the same pipeline runs against bundled real-transaction fixtures so the demo still works offline.

## Running it

```
pip install -r backend/requirements.txt
python -m uvicorn main:app --reload --port 8010 --app-dir backend/app
```

Then open `http://localhost:8010`.

## Project layout

```
backend/app/
  main.py             FastAPI app + routes
  bitcoin_client.py    live fetch (Esplora) with offline fixture fallback
  ethereum_client.py   live fetch (Blockscout) with offline fixture fallback
  trace.py             multi-hop BFS trace, chain-agnostic (picks the client)
  clustering.py       co-spend / counterparty heuristics
  attribution.py      VASP tag matching + confidence scoring
  tagdata/            VASP address tag database (built from GraphSense TagPacks)
  fixtures/           cached real BTC transactions for offline demo
  fixtures_eth/       cached real ETH transactions for offline demo
frontend/             single-page UI (vanilla JS + 3d-force-graph, single/batch tabs, BTC/ETH toggle)
api/index.py           Vercel serverless entrypoint (wraps the same FastAPI app)
vercel.json             Vercel routing: /api/* -> function, everything else -> frontend/
```

## Scope for this prototype

Bitcoin and Ethereum, for the internal-round demo. The same pipeline design (fetch → cluster → attribute) extends to further account-based chains (Tron, BNB Chain, Polygon) the same way Ethereum was added — see `PROJECT_CONTEXT.md` for the full roadmap against the problem statement's requirements.
