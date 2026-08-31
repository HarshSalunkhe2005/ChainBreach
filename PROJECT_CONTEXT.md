# Project Context

Running log of state, decisions, and progress for ChainBreach. Update this file as part of every commit that changes the project.

## What this is

Prototype + pitch content for SIH problem statement **SIH26182**: "Automated Attribution of Unknown Cryptocurrency Wallets to Nearest Virtual Asset Service Providers (VASPs) through Blockchain Intelligence APIs" — Ministry of Home Affairs / I4C, Blockchain & Cybersecurity theme.

- Internal round presentation: 2 Sept 2026
- Team: ChainBreach (6 members; prototype/code work is effectively solo)

## Problem statement summary

I4C wants a system that takes a suspect wallet address reported in a cybercrime investigation and automatically traces it to the exchange/VASP it's tied to. Requirements: multi-chain (BTC/ETH/TRON/BNB/Solana/Polygon), detect exchange clusters + hot/deposit wallets + mixers + DeFi bridges, integrate with the SAHYOG Portal (I4C's real legal-disclosure-request system) for automated routing, produce risk-scored/confidence-rated VASP candidates, and generate investigation-ready reports/visualizations. Deadline pressure context: I4C is separately building a broader system called CIAT (Cryptocurrency Intelligence and Analysis Tool) — this problem statement is effectively a scoped piece of that.

## Decisions made

- **Scope for internal round: Bitcoin only.** Full problem statement asks for multi-chain; not feasible solo in ~2 days. Architecture (fetch → cluster → attribute) is designed to extend to account-based chains later — pitch this as the roadmap, not a gap.
- **Data strategy: hybrid.** Live calls to Blockstream's public Esplora API as primary path; falls back automatically to bundled real-transaction fixtures if the live call fails, so the demo never breaks on stage.
- **VASP tag database: GraphSense TagPacks.** Public, MIT-licensed dataset (github.com/graphsense/graphsense-tagpacks). Converted the BTC-relevant entries (~440 addresses across exchanges, mixers, gambling/darknet services) into a flat `tagdata/vasp_tags.json` via `tagdata/build_tags.py`. Real, citable, no API key needed.
- **Heuristics implemented:** common-input-ownership (co-spend) clustering, and direct-counterparty (deposit/withdrawal) matching. High fan-out transactions (>25 inputs or outputs — batched exchange sweeps) are excluded from both to avoid the "super-cluster" explosion problem known in blockchain forensics.
- **Stack:** Python/FastAPI backend, vanilla JS frontend with vis-network for the graph. Single process serves both API and static frontend (`uvicorn main:app`) — simplest possible run story for judges.
- **Repo hygiene (standing rule, also in `C:\Users\Harsh\Projects\PERMANENT_INSTRUCTIONS.txt`):** no AI/Claude/Anthropic mentions anywhere in this repo; commits pushed via a separate scoped GitHub token (not tied to any AI tool), to be revoked after submission.

## Demo addresses (bundled as fixtures + sample buttons in the UI)

- `1KVUqmhw1X5AEXcKSFcDrkzVsApebVNjqA` — real 2014 Bitcoin address that deposited directly into a tagged C-Cex.com exchange address. Produces a "medium confidence" match via the direct-counterparty heuristic. Good positive-case demo.
- `1BfRMjJsX3154EoDWgXqW9Jf4kzqfKQHnp` — real address with no known VASP counterparties in its transaction history. Produces "no match" honestly. Good negative-case demo (shows the tool doesn't force false positives).

## Current status

- [x] Backend: fetch, cluster, attribute, API — working end-to-end, verified against both live API and offline fixtures.
- [x] Frontend: address input, sample-address shortcuts, candidate list with evidence + source links, transaction graph visualization — verified in browser.
- [x] Fixed a bug where high-fan-out transactions (exchange batch sweeps, one with 501 outputs) blew up the graph to 1700+ nodes; capped via `MAX_FANOUT` in `clustering.py`.
- [ ] PPT content for internal round — not started yet.
- [ ] README/context polish as prototype evolves.

## Open questions / next steps

- Decide whether to add a second chain (Ethereum) if time allows post-PPT — architecture supports it, heuristics would differ (account model, not UTXO).
- Confirm final pitch framing: position as a focused, working piece of I4C's real CIAT initiative rather than a from-scratch concept.
