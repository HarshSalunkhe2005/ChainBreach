# Project Context

Running state of ChainBreach. Update this file in every commit that changes the project.

## What this is

Prototype for SIH problem statement **SIH26182**: automated attribution of unknown cryptocurrency wallets to the nearest Virtual Asset Service Provider (VASP), Ministry of Home Affairs / I4C, Blockchain & Cybersecurity theme. Team ChainBreach.

Live: https://chain-breach.vercel.app (Vercel auto-deploys every push to `main`).

The full problem statement also asks for TRON/BNB/Solana/Polygon, SAHYOG portal routing and a broader tool (I4C's CIAT). This prototype covers Bitcoin and Ethereum end to end and presents the rest as roadmap.

Repo formalities: MIT `LICENSE`, `.gitattributes` (LF), README with live link, API table and credits. GitHub About shows the live URL.

## Architecture

```
frontend/   static single page: index.html, style.css, app.js, embers.js, fonts/ (OFL), vendor/3d-force-graph.min.js (MIT)
backend/app FastAPI: main.py (routes, serves frontend locally), trace.py, clustering.py, attribution.py,
            bitcoin_client.py, ethereum_client.py, tagdata/, fixtures/, fixtures_eth/
api/        Vercel serverless entrypoint, imports the same FastAPI app
```

Pipeline: fetch (explorer API, fixture fallback) -> trace (BFS, up to 2 hops) -> cluster (heuristics) -> attribute (tag match, confidence score) -> report.

- **Data:** Blockstream Esplora (BTC) and Blockscout (ETH), both keyless. If the live call fails or returns nothing, the same pipeline runs on bundled real-transaction fixtures (`fixtures/`, `fixtures_eth/`) so a demo survives an outage. Only the two baseline demo addresses per chain have fixtures.
- **ETH representation:** each transfer is a single-input/single-output `Tx`, so `clustering.find_relations` works unchanged; co-spend never fires (one input), leaving the counterparty heuristics, which is correct for an account-based chain. ETH addresses are lowercased everywhere.
- **Tags:** GraphSense TagPacks (public, MIT). `tagdata/build_tags.py` turns `tagdata/raw/*.yaml` into the flat `vasp_tags.json` (8,729 addresses: 8,435 BTC, 294 ETH, 278 distinct actors). `raw/samourai.yaml` (36k uncategorised coinjoin addresses) is deliberately left out. Upstream rate-limits tight download loops; fetch pack files one at a time.
- **Heuristics:** common-input-ownership and direct counterparty. Transactions with more than 25 inputs or outputs are skipped (`MAX_FANOUT`) to avoid the super-cluster failure mode. Weights: co-spend 3, sent-to 2, received-from 1, divided by hop. Bands: high >= 5, medium >= 2, else low.
- **Multi-hop:** `trace.py` expands outward up to 2 hops, stops at a known VASP, caps extra expansions at 4 (`MAX_EXPANSIONS`) and fetches each hop in parallel. Request timeout is 4 s. These numbers were tuned against Vercel's serverless time limit (worst case measured 11.6 s before tuning, typically 2-5 s after). Batch mode traces 1 hop only and is capped at 15 addresses.
- **Risk flag:** tag categories `ransomware, market, mixing_service, extremism, service_hack, coinjoin` show a red "flagged" badge, separate from confidence.
- **API:** `GET /api/stats`, `GET /api/samples?chain=`, `POST /api/attribute`, `POST /api/attribute/batch`. Unknown chain gives 400, an address with no data gives 404.

## Frontend design ("forge")

Warm black, one ember accent, crimson reserved for flagged/illicit content. Big Shoulders Display (headings), Hanken Grotesk (UI), JetBrains Mono (addresses and data); fonts and 3d-force-graph are self-hosted. The hero shows a broken chain with an ember crack and rising embers (`embers.js`, canvas, pauses off-screen, static under reduced motion). The Fetch/Trace/Match/Attribute strip inside the console is both the "how it works" and a progress readout while a request runs (the API is one call, so stages advance on a timer to Match and complete when the response lands). Results: candidate cards with confidence ring, flagged styling, evidence list (first 5, expandable) and a 3D transaction graph (layout is pre-computed with warmup ticks so it frames correctly on slow GPUs; a ResizeObserver keeps the canvas matched to its panel).

Behaviours kept from earlier versions: tabs (single/batch), BTC/ETH toggle, sample chips, drag-and-drop batch upload, shareable `?address=&chain=` links that auto-run, `/` focuses the input, toasts, printable investigation report (graph snapshot needs a render immediately before `toDataURL`). All user/API strings are escaped before going into `innerHTML`.

The previous UI lives in git history before commit `5356683`. Only the `main` branch exists.

## Demo addresses

Real addresses from the tag database, chosen to cover the outcomes. Only the first two per chain have offline fixtures.

Bitcoin
- `1KVUqmhw1X5AEXcKSFcDrkzVsApebVNjqA` deposit into C-Cex.com, medium match (fixture)
- `1BfRMjJsX3154EoDWgXqW9Jf4kzqfKQHnp` no known VASP, honest no-match (fixture)
- `16ftSEQ4ctQFDtVZiUBusQUjRrGhM3JYwe` Binance hot wallet, two VASPs ranked (Binance, Bybit)
- `12qTdZHx6f77aQ74CPCZGSY47VaRwYjVD8` Huobi reserve, high confidence (score 12)
- `1GGZmvCeQ11ermqXffroYBoj4uad7FgrG3` Locky ransomware, high and flagged

Ethereum
- `0x048f28f1a5cbc3f62f077625808e0e9903fe7706` deposit into Binance cold wallet, medium (fixture)
- `0xea5b5f01e5ac77f132e9135406ce1552bb0c1d43` no known VASP (fixture)
- `0x6fb624b48d9299674022a23d92515e76ba880113` exchange hub, two VASPs (Binance, OKX)
- `0x2eed6a08fb89a5cd111efa33f8dca46cfbeb370f` Deribit reserve, strong single match
- `0x07687e702b410fa43f4cb4af7fa097918ffd2730` Tornado Cash, high and flagged

Batch demo (BTC): the first, second, fourth and fifth Bitcoin addresses above give one row each of match, no-match, high-confidence and flagged. Batch takes about 10 s for five addresses because it runs sequentially.

## Running locally

```
pip install -r backend/requirements.txt
python -m uvicorn main:app --port 8010 --app-dir backend/app
```

Open http://localhost:8010. Regression check used for the redesign: API responses with `force_sample: true` for the four fixture addresses, `/api/batch`, `/api/samples` and `/api/stats` were byte-identical before and after.

## Status

- Backend, both chains, multi-hop, batch, fixtures, deploy: done and verified live.
- Frontend redesign (forge): done, checked at 1440 px and phone width, BTC and ETH, single and batch, flagged and no-match, hostile input, report export.
- Not tested: real-GPU frame rate, Safari/Firefox, physical touch devices, print preview output in a real print dialog.

## Open items

- Further chains (TRON, BNB, Solana, Polygon): the ETH account-model pattern should extend.
- Demo script (2-3 minute walkthrough with click order and talking points) not written.
- Batch is sequential; parallelising it would cut the 10 s for five addresses.
