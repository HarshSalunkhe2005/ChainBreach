"""Ethereum on-chain data access.

Uses Blockscout's public API (no key required) for live data. Each ETH
transfer is represented as a single-input/single-output "transaction" in
the same Tx/Vin/Vout shape bitcoin_client uses, so clustering.py's
relation-finding logic works unmodified: co-spend clustering naturally
never fires (there's only ever one vin), leaving just the direct-
counterparty heuristics, which is the correct behavior for an
account-based chain.
"""
import datetime
import json
import pathlib

import requests

from bitcoin_client import AddressData, Tx, Vin, Vout

BLOCKSCOUT_BASE = "https://eth.blockscout.com/api/v2"
REQUEST_TIMEOUT = 4
MAX_TXS = 20

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures_eth"


def _slim_from_blockscout(raw_tx: dict) -> Tx | None:
    from_addr = (raw_tx.get("from") or {}).get("hash")
    to_addr = (raw_tx.get("to") or {}).get("hash")
    if not from_addr or not to_addr:
        return None
    value = int(raw_tx.get("value") or 0)
    timestamp = raw_tx.get("timestamp")
    block_time = None
    if timestamp:
        try:
            block_time = int(
                datetime.datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp()
            )
        except ValueError:
            block_time = None
    return Tx(
        txid=raw_tx["hash"],
        block_time=block_time,
        vin=[Vin(address=from_addr.lower(), value=value)],
        vout=[Vout(address=to_addr.lower(), value=value)],
    )


def _fetch_live(address: str, max_txs: int = MAX_TXS) -> AddressData | None:
    try:
        resp = requests.get(
            f"{BLOCKSCOUT_BASE}/addresses/{address}/transactions",
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        raw_txs = resp.json().get("items", [])[:max_txs]
        txs = [t for t in (_slim_from_blockscout(t) for t in raw_txs) if t]
        return AddressData(address=address.lower(), txs=txs, source="live")
    except (requests.RequestException, ValueError):
        return None


def _fetch_fixture(address: str) -> AddressData | None:
    path = FIXTURES_DIR / f"{address.lower()}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return AddressData(
        address=address.lower(),
        txs=[
            Tx(
                txid=t["txid"],
                block_time=t.get("block_time"),
                vin=[Vin(address=v["address"], value=v["value"]) for v in t["vin"]],
                vout=[Vout(address=v["address"], value=v["value"]) for v in t["vout"]],
            )
            for t in data["txs"]
        ],
        source="sample",
    )


def get_address_data(
    address: str, force_sample: bool = False, max_txs: int = MAX_TXS
) -> AddressData | None:
    if force_sample:
        return _fetch_fixture(address)
    live = _fetch_live(address, max_txs)
    if live is not None and len(live.txs) > 0:
        return live
    return _fetch_fixture(address)
