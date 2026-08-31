"""Bitcoin on-chain data access.

Tries the public Blockstream Esplora API first (real, live chain data).
Falls back to a bundled fixture (fixtures/<address>.json) if the live
call fails or times out, so the tool keeps working without a network
connection or if the public API is rate-limiting.
"""
import json
import pathlib
from dataclasses import dataclass

import requests

ESPLORA_BASE = "https://blockstream.info/api"
REQUEST_TIMEOUT = 4
MAX_TXS = 20

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


@dataclass
class Vout:
    address: str | None
    value: int


@dataclass
class Vin:
    address: str | None
    value: int


@dataclass
class Tx:
    txid: str
    block_time: int | None
    vin: list[Vin]
    vout: list[Vout]


@dataclass
class AddressData:
    address: str
    txs: list[Tx]
    source: str  # "live" or "sample"


def _slim_from_esplora(raw_tx: dict) -> Tx:
    return Tx(
        txid=raw_tx["txid"],
        block_time=raw_tx.get("status", {}).get("block_time"),
        vin=[
            Vin(
                address=v.get("prevout", {}).get("scriptpubkey_address"),
                value=v.get("prevout", {}).get("value", 0),
            )
            for v in raw_tx.get("vin", [])
        ],
        vout=[
            Vout(
                address=v.get("scriptpubkey_address"),
                value=v.get("value", 0),
            )
            for v in raw_tx.get("vout", [])
        ],
    )


def _fetch_live(address: str, max_txs: int = MAX_TXS) -> AddressData | None:
    try:
        resp = requests.get(
            f"{ESPLORA_BASE}/address/{address}/txs", timeout=REQUEST_TIMEOUT
        )
        resp.raise_for_status()
        raw_txs = resp.json()[:max_txs]
        return AddressData(
            address=address,
            txs=[_slim_from_esplora(t) for t in raw_txs],
            source="live",
        )
    except (requests.RequestException, ValueError):
        return None


def _fetch_fixture(address: str) -> AddressData | None:
    path = FIXTURES_DIR / f"{address}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return AddressData(
        address=address,
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


def list_sample_addresses() -> list[str]:
    if not FIXTURES_DIR.exists():
        return []
    return [p.stem for p in FIXTURES_DIR.glob("*.json")]


def get_address_data(
    address: str, force_sample: bool = False, max_txs: int = MAX_TXS
) -> AddressData | None:
    if force_sample:
        return _fetch_fixture(address)
    live = _fetch_live(address, max_txs)
    if live is not None and len(live.txs) > 0:
        return live
    return _fetch_fixture(address)
