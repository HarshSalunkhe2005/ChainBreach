# ChainBreach

Automated attribution of unknown cryptocurrency wallets to the nearest Virtual Asset Service Provider (VASP). Built for Smart India Hackathon problem statement **SIH26182** (Ministry of Home Affairs / I4C).

**Live demo: [chain-breach.vercel.app](https://chain-breach.vercel.app)**

Give it a suspect wallet address. It traces the transaction graph, applies established blockchain-forensics heuristics to find counterparties, and checks them against a database of 8,700+ known VASP and illicit-entity addresses. The result is a confidence-scored list of candidate VASPs with the on-chain evidence behind each one, plus an interactive 3D transaction graph.

Supports **Bitcoin** and **Ethereum**, single address or batch.

## Try it

Open the live demo and click one of the sample addresses, or paste your own. Good ones to start with:

| Address (Bitcoin) | What you should see |
|---|---|
| `1KVUqmhw1X5AEXcKSFcDrkzVsApebVNjqA` | Deposit into C-Cex.com, medium-confidence match |
| `1BfRMjJsX3154EoDWgXqW9Jf4kzqfKQHnp` | No known VASP counterparties, an honest no-match |
| `16ftSEQ4ctQFDtVZiUBusQUjRrGhM3JYwe` | Binance hot wallet, two VASPs ranked (Binance, Bybit) |
| `12qTdZHx6f77aQ74CPCZGSY47VaRwYjVD8` | Huobi reserve, high confidence |
| `1GGZmvCeQ11ermqXffroYBoj4uad7FgrG3` | Locky ransomware, high confidence and flagged |

Ethereum samples are built into the UI (switch the chain toggle). Results are shareable: the URL carries `?address=...&chain=...` and re-runs the analysis on load. Press `/` to jump to the address field.

## How it works

1. **Fetch.** Pull the address's recent transactions from a public explorer: Blockstream Esplora for Bitcoin, Blockscout for Ethereum.
2. **Trace.** Follow the trail up to 2 hops outward, applying two heuristics at each hop:
   - *Common-input-ownership:* addresses spent together in one transaction as the target are almost always controlled by the same wallet.
   - *Direct counterparty:* addresses the target sent funds to, or received funds from. This is what deposit-address attribution relies on.
   - Transactions with more than 25 inputs or outputs (batched exchange sweeps) are excluded to avoid the classic "super-cluster" failure. Expansion stops at a known VASP and is bounded so a busy wallet cannot blow up runtime.
3. **Attribute.** Match every related address against the tag database and score each VASP by the strength, count and hop distance of the evidence. Matches in high-risk categories (ransomware, darknet markets, mixers, sanctions, extremism) are flagged separately from ordinary exchange matches.
4. **Report.** Ranked candidates with high / medium / low confidence, cited evidence (transaction links and tag sources), and the 3D graph. "Export report" builds a printable summary with a graph snapshot; "Copy link" shares the result.

Batch mode analyses up to 15 addresses at once (paste or drop a CSV/TXT file) at 1 hop each. If a live API is unreachable, the pipeline falls back to bundled real-transaction fixtures so a demo keeps working.

## Run it locally

Requires Python 3.10+.

```
pip install -r backend/requirements.txt
python -m uvicorn main:app --port 8010 --app-dir backend/app
```

Open http://localhost:8010. The same FastAPI process serves the API and the static frontend.

### API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stats` | Tag database size and category breakdown |
| GET | `/api/samples?chain=btc\|eth` | Demo addresses with descriptions |
| POST | `/api/attribute` | `{address, chain}`: full 2-hop attribution with graph |
| POST | `/api/attribute/batch` | `{addresses, chain}`: up to 15 addresses, 1 hop each |

## Project layout

```
backend/app/
  main.py              FastAPI app and routes (also serves frontend/ locally)
  bitcoin_client.py    live fetch (Esplora) with offline fixture fallback
  ethereum_client.py   live fetch (Blockscout) with offline fixture fallback
  trace.py             multi-hop BFS trace, chain-agnostic
  clustering.py        co-spend and counterparty heuristics
  attribution.py       tag matching and confidence scoring
  tagdata/             VASP tag database (vasp_tags.json) and the script that builds it
  fixtures/            cached real BTC transactions for offline demo
  fixtures_eth/        cached real ETH transactions for offline demo
frontend/              single-page UI: vanilla JS, self-hosted fonts and graph library
api/index.py           Vercel serverless entrypoint (wraps the same FastAPI app)
vercel.json            routing: /api/* to the function, everything else to frontend/
PROJECT_CONTEXT.md     running project state, decisions and open items
```

## Deployment

Hosted on Vercel, connected to this repository: every push to `main` deploys to production. `vercel.json` routes `/api/*` to the Python function (bundling `backend/**`) and serves `frontend/` as static files.

## Scope

Bitcoin and Ethereum are covered end to end. The full problem statement also lists TRON, BNB Chain, Solana and Polygon and routing through the SAHYOG portal; the fetch, trace and attribute pipeline extends to further account-based chains the same way Ethereum was added. See `PROJECT_CONTEXT.md` for decisions and open items.

Attribution is an investigative lead, not proof: tags come from public datasets and heuristics have known failure modes. Verify independently before acting on a result.

## Credits and licenses

This project is released under the [MIT License](LICENSE).

- **Tag data:** [GraphSense TagPacks](https://github.com/graphsense/graphsense-tagpacks), MIT licensed. Source files are in `backend/app/tagdata/raw/`; `build_tags.py` converts them to `vasp_tags.json`.
- **Chain data:** [Blockstream Esplora](https://blockstream.info/api/) and [Blockscout](https://eth.blockscout.com/) public APIs.
- **3D graph:** [3d-force-graph](https://github.com/vasturiano/3d-force-graph) 1.73.4, MIT, bundled in `frontend/vendor/`.
- **Fonts:** [Big Shoulders Display](https://fonts.google.com/specimen/Big+Shoulders+Display), [Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk) and [JetBrains Mono](https://www.jetbrains.com/lp/mono/), all under the SIL Open Font License 1.1, self-hosted in `frontend/fonts/`.
