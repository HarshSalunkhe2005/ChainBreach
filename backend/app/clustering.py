"""Heuristics for linking a wallet address to its transaction counterparties.

Two established Bitcoin forensics heuristics are used:

- Common-input-ownership: addresses that appear together as inputs in the
  same transaction are (almost always) controlled by the same wallet/owner.
- Direct counterparty: an address that receives funds from, or sends funds
  to, the target address in a single hop. This is what "deposit address"
  attribution relies on in practice — a suspect wallet paying directly into
  a known exchange address is strong evidence of which VASP it used.

High fan-out transactions (batched exchange sweeps/payouts with dozens of
inputs or outputs) are excluded from both heuristics: co-spend clustering
across a consolidation transaction is the classic "super-cluster" failure
mode (it would merge thousands of unrelated customers into one cluster),
and a single output among hundreds in a payout batch isn't meaningful
counterparty evidence either.
"""
from dataclasses import dataclass

from bitcoin_client import Tx

MAX_FANOUT = 25


@dataclass
class Relation:
    address: str
    kind: str  # "co_spend" | "sent_to" | "received_from"
    txid: str
    value: int


def find_relations(target: str, txs: list[Tx]) -> list[Relation]:
    relations: list[Relation] = []

    for tx in txs:
        vin_addresses = {v.address for v in tx.vin if v.address}
        target_is_input = target in vin_addresses

        if target_is_input:
            if len(tx.vin) <= MAX_FANOUT:
                for v in tx.vin:
                    if v.address and v.address != target:
                        relations.append(Relation(v.address, "co_spend", tx.txid, v.value))
            if len(tx.vout) <= MAX_FANOUT:
                for v in tx.vout:
                    if v.address and v.address != target:
                        relations.append(Relation(v.address, "sent_to", tx.txid, v.value))
        else:
            if len(tx.vin) <= MAX_FANOUT:
                for v in tx.vout:
                    if v.address == target:
                        for vi in tx.vin:
                            if vi.address:
                                relations.append(
                                    Relation(vi.address, "received_from", tx.txid, vi.value)
                                )

    return relations
