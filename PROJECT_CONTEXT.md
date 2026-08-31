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
- **VASP tag database: GraphSense TagPacks.** Public, MIT-licensed dataset (github.com/graphsense/graphsense-tagpacks). Converted the BTC-relevant entries into a flat `tagdata/vasp_tags.json` via `tagdata/build_tags.py`. Real, citable, no API key needed. Now at **8,435 addresses** (177 exchanges, plus ransomware/darknet-market/mixer/sanctions categories via the `abuse` field fallback) — up from an initial ~440 exchange-only subset. `raw/samourai.yaml` (36k uncategorized coinjoin-participant addresses, low individual value) deliberately excluded to keep the dataset lean; more GraphSense pack files exist upstream (`raw/all_urls.txt`-style full pull) but downloading them hit intermittent rate-limiting from raw.githubusercontent.com — single sequential requests work fine, tight loops don't. Revisit if more coverage is wanted later.
- **Risk categorization:** candidate/graph nodes whose tag category is in `{ransomware, market, mixing_service, extremism, service_hack, coinjoin}` get a red "flagged" badge in the UI, separate from the confidence score — lets the tool surface "this links to a known-illicit entity" distinctly from "this links to a legitimate exchange."
- **Heuristics implemented:** common-input-ownership (co-spend) clustering, and direct-counterparty (deposit/withdrawal) matching. High fan-out transactions (>25 inputs or outputs — batched exchange sweeps) are excluded from both to avoid the "super-cluster" explosion problem known in blockchain forensics.
- **Stack:** Python/FastAPI backend, vanilla JS frontend with vis-network for the graph. Single process serves both API and static frontend (`uvicorn main:app`) — simplest possible run story for judges.
- **Repo hygiene (standing rule, also in `C:\Users\Harsh\Projects\PERMANENT_INSTRUCTIONS.txt`):** no AI/Claude/Anthropic mentions anywhere in this repo; commits pushed via GitHub Credential Manager under the `HarshSalunkhe2005` account (switched from a scoped-PAT + plaintext `git-credential-store` approach after the original PAT turned out to belong to the wrong GitHub account).
- **Design system (standing rule, also in PERMANENT_INSTRUCTIONS.txt):** deliberately avoid the generic "AI-generated" look. Typography: IBM Plex Sans (UI) + IBM Plex Mono (addresses/hashes/data), via Google Fonts. Palette: near-black navy surfaces (`#0a0e14`/`#0f1520`/`#131a27`), one restrained accent (teal `#35d0ba`), red reserved strictly for flagged/illicit-category content, amber for medium confidence. No gradients, no emoji-as-icons, no glow/3D effects — flat, bordered panels with a small geometric SVG brand mark (two interlocking rounded squares, evoking a broken chain link).
- **Batch upload feature:** `/api/attribute/batch` (POST `{addresses: [...]}`, capped at `MAX_BATCH_SIZE=15`) runs the same fetch→cluster→attribute pipeline per address and returns a results array (top candidate + confidence per address). Frontend has a tabbed UI (Single Address / Batch Upload) with drag-and-drop file upload or a paste-in textarea, rendered as a results table.
- **`/api/stats`** exposes dataset size (tagged address count, distinct actors, category breakdown) — shown as a badge in the top bar so the "more data" story is visible at a glance, not just claimed in the pitch.

## Demo addresses (bundled as fixtures + sample buttons in the UI)

- `1KVUqmhw1X5AEXcKSFcDrkzVsApebVNjqA` — real 2014 Bitcoin address that deposited directly into a tagged C-Cex.com exchange address. Produces a "medium confidence" match via the direct-counterparty heuristic. Good positive-case demo.
- `1BfRMjJsX3154EoDWgXqW9Jf4kzqfKQHnp` — real address with no known VASP counterparties in its transaction history. Produces "no match" honestly. Good negative-case demo (shows the tool doesn't force false positives).

## Current status

- [x] Backend: fetch, cluster, attribute, API — working end-to-end, verified against both live API and offline fixtures.
- [x] Frontend: address input, sample-address shortcuts, candidate list with evidence + source links, transaction graph visualization — verified in browser.
- [x] Fixed a bug where high-fan-out transactions (exchange batch sweeps, one with 501 outputs) blew up the graph to 1700+ nodes; capped via `MAX_FANOUT` in `clustering.py`.
- [x] Redesigned frontend: new design system (see above), tabbed single/batch UI, dataset stats badge, risk-flag badges on illicit-category matches — verified in browser (single address, batch upload, both demo fixtures).
- [x] Batch upload endpoint + UI — verified end-to-end with real addresses.
- [x] Expanded VASP tag dataset from ~440 to 8,435 addresses.
- [x] PPT content drafted for internal round, matching the official SIT/SIH 6-slide template exactly (title, idea, technical approach, feasibility, impact, references) — given directly to the user, not stored in this repo.
- [ ] README polish to reflect the new frontend/batch feature (still describes the old single-page UI).

## Known tooling quirk (not a product bug)

The Browser-pane screenshot tool intermittently returns solid-black frames after scrolling on this page, seemingly tied to the vis-network canvas + scroll state, even though the underlying DOM/canvas content is provably correct (verified via direct pixel sampling and DOM inspection). Reloading the page or resizing the viewport clears it. Don't mistake a black screenshot for the graph being broken — check console errors and pixel/DOM state before assuming a real bug.

## Open questions / next steps

- Decide whether to add a second chain (Ethereum) if time allows post-PPT — architecture supports it, heuristics would differ (account model, not UTXO).
- Confirm final pitch framing: position as a focused, working piece of I4C's real CIAT initiative rather than a from-scratch concept.
