import pathlib

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import bitcoin_client
import clustering
from attribution import attribute

app = FastAPI(title="ChainBreach Wallet Attribution API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = pathlib.Path(__file__).parent.parent.parent / "frontend"

SAMPLE_ADDRESSES = {
    "1KVUqmhw1X5AEXcKSFcDrkzVsApebVNjqA": "Real 2014 deposit into a known exchange (C-Cex.com) — expect a match.",
    "1BfRMjJsX3154EoDWgXqW9Jf4kzqfKQHnp": "Real wallet with no known VASP counterparties — expect no match.",
}


class AttributeRequest(BaseModel):
    address: str
    force_sample: bool = False


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

    data = bitcoin_client.get_address_data(address, force_sample=req.force_sample)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="No transaction data available for this address (live lookup failed and no sample exists).",
        )

    relations = clustering.find_relations(address, data.txs)
    result = attribute(address, relations)
    result["data_source"] = data.source
    result["tx_count_analyzed"] = len(data.txs)
    return result


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
