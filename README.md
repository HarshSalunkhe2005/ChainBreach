# ChainBreach

Automated attribution of unknown cryptocurrency wallets to the nearest Virtual Asset Service Provider (VASP), built for SIH problem statement **SIH26182** (Ministry of Home Affairs / I4C).

Given a suspect wallet address, the tool traces its transaction graph, applies established blockchain-forensics heuristics to find counterparties, and checks those counterparties against a database of known VASP (exchange) addresses — returning a confidence-scored list of candidate VASPs with the on-chain evidence behind each one.

## How it works

1. **Fetch** — pull the address's recent transactions from a public Bitcoin block explorer (Blockstream Esplora API).
2. **Cluster** — apply two heuristics to find related addresses:
   - *Common-input-ownership*: addresses spent together in the same transaction as the target are (almost always) controlled by the same wallet.
   - *Direct counterparty*: addresses the target sent funds to, or received funds from, in a single hop — this is what "deposit address" attribution relies on.
   - High fan-out transactions (batched exchange sweeps with dozens of inputs/outputs) are excluded from both, to avoid the classic "super-cluster" failure mode.
3. **Attribute** — check every related address against a database of 8,000+ known VASP/illicit-entity addresses (sourced from GraphSense's public, MIT-licensed TagPacks), and score each matching VASP by the strength and count of evidence. Matches in high-risk categories (ransomware, darknet markets, mixers, sanctions) are flagged separately from ordinary exchange matches.
4. **Report** — return ranked candidates with confidence bands (high / medium / low), the evidence trail (transaction IDs + source citations), and a graph for visual inspection.

Addresses can be analyzed one at a time or in a batch (paste/upload up to 15 at once) via the tabbed UI. `/api/stats` exposes live dataset size.

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
  main.py           FastAPI app + routes
  bitcoin_client.py live fetch (Esplora) with offline fixture fallback
  clustering.py     co-spend / counterparty heuristics
  attribution.py    VASP tag matching + confidence scoring
  tagdata/          VASP address tag database (built from GraphSense TagPacks)
  fixtures/         cached real transactions for offline demo
frontend/           single-page UI (vanilla JS + vis-network graph, single/batch tabs)
```

## Scope for this prototype

Bitcoin only, for the internal-round demo. The same pipeline design (fetch → cluster → attribute) extends to account-based chains (Ethereum, Tron, BNB Chain) by swapping the clustering heuristics — see `PROJECT_CONTEXT.md` for the full roadmap against the problem statement's requirements.
