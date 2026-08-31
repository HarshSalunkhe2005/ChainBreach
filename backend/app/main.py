import pathlib
from collections import Counter

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import trace as trace_mod
from attribution import _TAGS, attribute

app = FastAPI(title="ChainBreach Wallet Attribution API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = pathlib.Path(__file__).parent.parent.parent / "frontend"

MAX_BATCH_SIZE = 15

SAMPLE_ADDRESSES = {
    "1KVUqmhw1X5AEXcKSFcDrkzVsApebVNjqA": "Real 2014 deposit into a known exchange (C-Cex.com) — expect a match.",
    "1BfRMjJsX3154EoDWgXqW9Jf4kzqfKQHnp": "Real wallet with no known VASP counterparties — expect no match.",
}


class AttributeRequest(BaseModel):
    address: str
    force_sample: bool = False


class BatchAttributeRequest(BaseModel):
    addresses: list[str]
    force_sample: bool = False


def run_attribution(address: str, force_sample: bool, max_hops: int = trace_mod.MAX_HOPS) -> dict:
    trace_result = trace_mod.trace(address, force_sample, _TAGS, max_hops=max_hops)
    if trace_result.target_source is None:
        raise ValueError("no transaction data available (live lookup failed and no sample exists)")

    result = attribute(address, trace_result.relations)
    result["data_source"] = trace_result.target_source
    result["tx_count_analyzed"] = trace_result.target_tx_count
    result["addresses_traced"] = trace_result.addresses_traced
    result["hops"] = max_hops
    return result


@app.get("/api/stats")
def get_stats():
    categories = Counter(v.get("category") or "unlabeled" for v in _TAGS.values())
    actors = {v.get("actor") for v in _TAGS.values() if v.get("actor")}
    return {
        "tagged_addresses": len(_TAGS),
        "distinct_actors": len(actors),
        "categories": categories.most_common(),
    }


@app.get("/api/samples")
def get_samples():
    return [
        {"address": addr, "description": desc}
        for addr, desc in SAMPLE_ADDRESSES.items()
    ]


@app.post("/api/attribute")
def post_attribute(req: AttributeRequest):
    address = req.address.strip()
    if not address:
        raise HTTPException(status_code=400, detail="address is required")

    try:
        return run_attribution(address, req.force_sample)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/attribute/batch")
def post_attribute_batch(req: BatchAttributeRequest):
    addresses = [a.strip() for a in req.addresses if a.strip()]
    if not addresses:
        raise HTTPException(status_code=400, detail="at least one address is required")
    if len(addresses) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"batch limited to {MAX_BATCH_SIZE} addresses per request (got {len(addresses)})",
        )

    results = []
    for address in addresses:
        try:
            result = run_attribution(address, req.force_sample, max_hops=1)
            top = result["candidates"][0] if result["candidates"] else None
            results.append(
                {
                    "address": address,
                    "ok": True,
                    "data_source": result["data_source"],
                    "tx_count_analyzed": result["tx_count_analyzed"],
                    "top_candidate": top,
                    "candidate_count": len(result["candidates"]),
                }
            )
        except ValueError as e:
            results.append({"address": address, "ok": False, "error": str(e)})

    return {"results": results}


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
