"""Multi-hop transaction tracing.

Starting from a suspect address, follow transaction relations outward
(BFS) up to MAX_HOPS deep, so the trail can pass through one or more
intermediate wallets before reaching a known VASP - not just addresses
the suspect touched directly.

Expansion stops at a node once it's identified as a known VASP (that's
the destination, no need to trace past it) and is bounded by
MAX_EXPANSIONS total addresses so a busy wallet can't blow up runtime
or the graph size. Each hop's addresses are fetched in parallel since
this is I/O-bound (waiting on the block explorer API).
"""
import concurrent.futures as cf
from dataclasses import dataclass

import bitcoin_client
import clustering

MAX_HOPS = 2
MAX_EXPANSIONS = 4
MAX_WORKERS = 6
HOP1_MAX_TXS = 20
DEEPER_MAX_TXS = 10


@dataclass
class HopRelation:
    hop: int
    source: str
    relation: clustering.Relation


@dataclass
class TraceResult:
    relations: list[HopRelation]
    target_source: str | None
    target_tx_count: int
    addresses_traced: int


def trace(target: str, force_sample: bool, tags: dict, max_hops: int = MAX_HOPS) -> TraceResult:
    visited = {target}
    frontier = [target]
    all_relations: list[HopRelation] = []
    expansions_used = 0
    target_source = None
    target_tx_count = 0
    addresses_traced = 0

    for hop in range(1, max_hops + 1):
        if not frontier:
            break

        max_txs = HOP1_MAX_TXS if hop == 1 else DEEPER_MAX_TXS
        with cf.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            future_to_addr = {
                ex.submit(bitcoin_client.get_address_data, addr, force_sample, max_txs): addr
                for addr in frontier
            }
            results = {}
            for fut in cf.as_completed(future_to_addr):
                addr = future_to_addr[fut]
                try:
                    results[addr] = fut.result()
                except Exception:
                    results[addr] = None

        next_frontier = []
        for addr in frontier:
            data = results.get(addr)
            if addr == target:
                target_source = data.source if data else None
                target_tx_count = len(data.txs) if data else 0
            if data is None:
                continue
            addresses_traced += 1

            relations = clustering.find_relations(addr, data.txs)
            for rel in relations:
                all_relations.append(HopRelation(hop=hop, source=addr, relation=rel))
                if rel.address in visited:
                    continue
                visited.add(rel.address)
                if rel.address in tags:
                    continue  # known VASP - trail ends here, don't expand past it
                if hop < max_hops and expansions_used < MAX_EXPANSIONS:
                    next_frontier.append(rel.address)
                    expansions_used += 1

        frontier = next_frontier

    return TraceResult(
        relations=all_relations,
        target_source=target_source,
        target_tx_count=target_tx_count,
        addresses_traced=addresses_traced,
    )
