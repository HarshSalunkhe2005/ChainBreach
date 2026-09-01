"""Convert GraphSense TagPack YAML files (raw/) into a single flat vasp_tags.json
lookup: {address: {label, actor, category, source, currency}}. Keeps BTC and
ETH entries - address formats don't collide, so one flat map works for both
chains without a lookup key change.

Source data: https://github.com/graphsense/graphsense-tagpacks (MIT licensed, public tags)
Run once at build time: python build_tags.py
"""
import json
import pathlib

import yaml

RAW_DIR = pathlib.Path(__file__).parent / "raw"
OUT_PATH = pathlib.Path(__file__).parent / "vasp_tags.json"

KEPT_CURRENCIES = {"BTC", "ETH"}


def load_pack(path: pathlib.Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def main():
    tags = {}
    counts = {"BTC": 0, "ETH": 0}
    for path in sorted(RAW_DIR.glob("*.yaml")):
        pack = load_pack(path)
        pack_currency = pack.get("currency")
        pack_actor = pack.get("actor")
        pack_category = pack.get("category") or pack.get("abuse")
        pack_source = pack.get("source")

        for tag in pack.get("tags", []):
            currency = tag.get("currency", pack_currency)
            if currency not in KEPT_CURRENCIES:
                continue
            address = tag["address"].lower() if currency == "ETH" else tag["address"]
            category = tag.get("category") or tag.get("abuse") or pack_category
            tags[address] = {
                "label": tag.get("label", pack.get("title", "")),
                "actor": tag.get("actor", pack_actor),
                "category": category,
                "source": tag.get("source", pack_source),
                "currency": currency,
            }
            counts[currency] += 1

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(tags, f, indent=2, sort_keys=True)

    print(f"wrote {len(tags)} address tags to {OUT_PATH} ({counts})")


if __name__ == "__main__":
    main()
