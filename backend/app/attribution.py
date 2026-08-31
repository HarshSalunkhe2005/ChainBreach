"""Score transaction relations against the known VASP tag database and
produce a ranked list of attribution candidates plus a graph for display.
"""
import json
import pathlib
from dataclasses import dataclass, field

from trace import HopRelation

TAGS_PATH = pathlib.Path(__file__).parent / "tagdata" / "vasp_tags.json"

# Same-wallet evidence (co-spend) is far stronger than a single transfer.
# Weight decays with hop distance - a 2-hop link is weaker evidence than
# a direct one, but still worth surfacing.
WEIGHTS = {"co_spend": 3, "sent_to": 2, "received_from": 1}

CONFIDENCE_BANDS = [
    (5, "high"),
    (2, "medium"),
    (0, "low"),
]


def _load_tags() -> dict:
    with open(TAGS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


_TAGS = _load_tags()


def confidence_label(score: float) -> str:
    for threshold, label in CONFIDENCE_BANDS:
        if score >= threshold:
            return label
    return "low"


def _edge_endpoints(hr: HopRelation) -> tuple[str, str]:
    rel = hr.relation
    if rel.kind == "co_spend":
        return rel.address, hr.source
    if rel.kind == "sent_to":
        return hr.source, rel.address
    return rel.address, hr.source  # received_from


@dataclass
class Candidate:
    actor: str
    label: str
    category: str
    score: float
    confidence: str
    evidence: list[dict] = field(default_factory=list)


def attribute(target: str, hop_relations: list[HopRelation]) -> dict:
    by_actor: dict[str, Candidate] = {}
    graph_nodes = {target: {"id": target, "role": "target", "hop": 0}}
    graph_edges = []

    def touch_node(address: str, hop: int, extra: dict | None = None):
        existing = graph_nodes.get(address)
        hop_value = min(hop, existing["hop"]) if existing else hop
        node = {"id": address, "hop": hop_value}
        if extra:
            node.update(extra)
        elif existing:
            node.update({k: v for k, v in existing.items() if k not in ("id", "hop")})
        graph_nodes[address] = node

    for hr in hop_relations:
        rel = hr.relation
        tag = _TAGS.get(rel.address)
        src, dst = _edge_endpoints(hr)

        graph_edges.append(
            {"source": src, "target": dst, "kind": rel.kind, "txid": rel.txid, "hop": hr.hop}
        )

        if tag is None:
            touch_node(rel.address, hr.hop, {"role": "unknown"})
            continue

        touch_node(
            rel.address,
            hr.hop,
            {
                "role": "vasp",
                "label": tag["label"],
                "actor": tag["actor"],
                "category": tag.get("category"),
            },
        )

        actor = tag["actor"] or tag["label"]
        cand = by_actor.setdefault(
            actor,
            Candidate(
                actor=actor,
                label=tag["label"],
                category=tag.get("category") or "unknown",
                score=0.0,
                confidence="low",
            ),
        )
        cand.score += WEIGHTS[rel.kind] / hr.hop
        cand.evidence.append(
            {
                "address": rel.address,
                "kind": rel.kind,
                "txid": rel.txid,
                "value_sats": rel.value,
                "source": tag.get("source"),
                "hop": hr.hop,
            }
        )

    candidates = sorted(by_actor.values(), key=lambda c: c.score, reverse=True)
    for c in candidates:
        c.confidence = confidence_label(c.score)
        c.evidence.sort(key=lambda e: e["hop"])

    return {
        "address": target,
        "candidates": [
            {
                "actor": c.actor,
                "label": c.label,
                "category": c.category,
                "score": round(c.score, 1),
                "confidence": c.confidence,
                "evidence": c.evidence,
            }
            for c in candidates
        ],
        "graph": {
            "nodes": list(graph_nodes.values()),
            "edges": graph_edges,
        },
    }
