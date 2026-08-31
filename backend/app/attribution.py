"""Score transaction relations against the known VASP tag database and
produce a ranked list of attribution candidates plus a graph for display.
"""
import json
import pathlib
from dataclasses import dataclass, field

from clustering import Relation

TAGS_PATH = pathlib.Path(__file__).parent / "tagdata" / "vasp_tags.json"

# Same-wallet evidence (co-spend) is far stronger than a single transfer.
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


def confidence_label(score: int) -> str:
    for threshold, label in CONFIDENCE_BANDS:
        if score >= threshold:
            return label
    return "low"


@dataclass
class Candidate:
    actor: str
    label: str
    category: str
    score: int
    confidence: str
    evidence: list[dict] = field(default_factory=list)


def attribute(target: str, relations: list[Relation]) -> dict:
    by_actor: dict[str, Candidate] = {}
    graph_nodes = {target: {"id": target, "role": "target"}}
    graph_edges = []

    for rel in relations:
        tag = _TAGS.get(rel.address)

        if rel.kind == "co_spend":
            src, dst = rel.address, target
        elif rel.kind == "sent_to":
            src, dst = target, rel.address
        else:  # received_from
            src, dst = rel.address, target

        graph_edges.append(
            {"source": src, "target": dst, "kind": rel.kind, "txid": rel.txid}
        )

        if tag is None:
            graph_nodes.setdefault(
                rel.address, {"id": rel.address, "role": "unknown"}
            )
            continue

        graph_nodes[rel.address] = {
            "id": rel.address,
            "role": "vasp",
            "label": tag["label"],
            "actor": tag["actor"],
        }

        actor = tag["actor"] or tag["label"]
        cand = by_actor.setdefault(
            actor,
            Candidate(
                actor=actor,
                label=tag["label"],
                category=tag.get("category") or "unknown",
                score=0,
                confidence="low",
            ),
        )
        cand.score += WEIGHTS[rel.kind]
        cand.evidence.append(
            {
                "address": rel.address,
                "kind": rel.kind,
                "txid": rel.txid,
                "value_sats": rel.value,
                "source": tag.get("source"),
            }
        )

    candidates = sorted(by_actor.values(), key=lambda c: c.score, reverse=True)
    for c in candidates:
        c.confidence = confidence_label(c.score)

    return {
        "address": target,
        "candidates": [
            {
                "actor": c.actor,
                "label": c.label,
                "category": c.category,
                "score": c.score,
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
