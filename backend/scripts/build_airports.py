"""Genera frontend/src/data/airports.json desde OurAirports (dominio público).

Solo deja aeropuertos con vuelos comerciales que fli reconoce, para que todo lo que
se elija en el buscador se pueda consultar.

    curl -LO https://davidmegginson.github.io/ourairports-data/airports.csv
    .venv/bin/python scripts/build_airports.py airports.csv
"""

import csv
import json
import sys
from pathlib import Path

from fli.models import Airport

TYPES = {"large_airport": 2, "medium_airport": 1, "small_airport": 0}
OUT = Path(__file__).resolve().parents[2] / "frontend/src/data/airports.json"


def main(csv_path: str) -> None:
    known = {a.name for a in Airport}
    rows = []
    with open(csv_path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            code = r["iata_code"]
            if code in known and r["scheduled_service"] == "yes" and r["type"] in TYPES:
                city = r["municipality"].split(" (")[0].strip()
                rows.append([code, r["name"], city, r["iso_country"], TYPES[r["type"]]])
    rows.sort(key=lambda x: x[0])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(rows)} aeropuertos -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
