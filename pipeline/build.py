"""Fetch, audit and publish a frozen annual EPA dataset. Browser builds are offline."""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
INE_URL = "https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/65985?tip=AM"
EURO_URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lfsa_egan22d?geo=ES&sex=T&age=Y_GE15&sinceTimePeriod=2008&untilTimePeriod=2025&lang=EN"
EURO_SECTIONS_URL = EURO_URL.replace("lfsa_egan22d", "lfsa_egan2")
YEARS = list(range(2008, 2026))
PIPELINE_VERSION = 1
if not __debug__:
    raise RuntimeError("Validation must run without Python -O / PYTHONOPTIMIZE")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"


def read(path):
    return json.loads(path.read_text())


def fetch_sources():
    RAW.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {"retrievedAt": stamp, "sources": []}
    for name, url in [("ine-65985", INE_URL), ("eurostat-divisions", EURO_URL), ("eurostat-sections", EURO_SECTIONS_URL)]:
        request = Request(url, headers={"User-Agent": "Ocupados/1.0 (official annual EPA source audit)"})
        with urlopen(request, timeout=120) as response:
            body = response.read()
            modified = response.headers.get("Last-Modified")
        parsed = json.loads(body)
        # Validate the response before retaining it; no HTML error pages as snapshots.
        assert isinstance(parsed, (list, dict)), "Unexpected source response"
        sha = hashlib.sha256(body).hexdigest()
        filename = "%s-%s.json" % (name, sha[:12])
        target = RAW / filename
        if not target.exists():
            target.write_bytes(body)
        manifest["sources"].append({"id": name, "url": url, "file": filename, "sha256": sha, "sourceUpdatedAt": modified or (parsed.get("updated") if isinstance(parsed, dict) else None)})
    (RAW / "manifest.json").write_text(canonical(manifest))


def parse_ine(data):
    records = {}
    divisions = set()
    for series in data:
        meta = series["MetaData"]
        if not any(x["T3_Variable"].strip() == "Sexo" and x["Nombre"] == "Ambos sexos" for x in meta):
            continue
        if not any(x["T3_Variable"].strip() == "Tipo de dato" and x["Nombre"] == "Valor absoluto" for x in meta):
            continue
        assert series["T3_Escala"] == "Miles" and series["T3_Unidad"] == "Personas", "Changed units"
        activity = next(x for x in meta if x["T3_Variable"].strip() in ("SECCIONES", "DIVISIONES", "TOTALES VARIABLES CNAE"))
        code = activity["Codigo"]
        assert code not in records, "Duplicated INE activity %s" % code
        if activity["T3_Variable"].strip() == "DIVISIONES":
            divisions.add(code)
        values = {}
        for observation in series["Data"]:
            assert observation["T3_Periodo"] == "A", "Non-annual value in annual table"
            year = observation["Anyo"]
            assert year not in values, "Duplicated year"
            value = observation["Valor"]
            persons = None if value is None else Decimal(str(value)) * 1000
            assert persons is None or persons == persons.to_integral_value(), "Unexpected fractional precision"
            values[year] = None if persons is None else int(persons)
        records[code] = {"seriesId": series["COD"], "name": activity["Nombre"], "values": values}
    assert sorted(records["TOTAL"]["values"]) == YEARS, "Annual coverage changed; review the candidate and classification before extending"
    return records, divisions


def parse_euro(data):
    assert data["dimension"]["freq"]["category"]["index"] == {"A": 0}
    assert data["dimension"]["unit"]["category"]["index"] == {"THS_PER": 0}
    assert data["dimension"]["geo"]["category"]["index"] == {"ES": 0}
    assert data["dimension"]["sex"]["category"]["index"] == {"T": 0}
    assert data["dimension"]["age"]["category"]["index"] == {"Y_GE15": 0}
    # Decode using the actual dimension order and strides, not assumptions about order.
    strides = []
    for index in range(len(data["size"])):
        stride = 1
        for size in data["size"][index + 1:]:
            stride *= size
        strides.append(stride)
    dimensions = {key: data["dimension"][key]["category"]["index"] for key in data["id"]}
    result = {}
    for code, ci in dimensions["nace_r2"].items():
        for year, ti in dimensions["time"].items():
            coordinates = {"nace_r2": ci, "time": ti}
            flat = str(sum(coordinates.get(key, 0) * stride for key, stride in zip(data["id"], strides)))
            value = data.get("value", {}).get(flat)
            result[(code, int(year))] = {"persons": None if value is None else int(Decimal(str(value)) * 1000), "flags": data.get("status", {}).get(flat, "")}
    return result


def validate_taxonomy(taxonomy, source_divisions):
    codes = [code for sector in taxonomy["sectors"] for code in sector["codes"]]
    duplicates = [code for code, count in Counter(codes).items() if count != 1]
    assert not duplicates, "Duplicate division assignments: %s" % duplicates
    assert set(codes) == source_divisions, "Missing/new divisions: %s" % (set(codes) ^ source_divisions)
    assert len({s["id"] for s in taxonomy["sectors"]}) == len(taxonomy["sectors"])
    assert len(taxonomy["sectors"]) == 35
    for sector in taxonomy["sectors"]:
        assert sector["parent"] in taxonomy["parents"]
        assert set(sector["name"]) == set(sector["description"]) == {"es", "en"}


def derive(records, taxonomy, euro, euro_sections, manifest):
    source_terms = [term for sector in taxonomy["sectors"] for term in sector["terms"]]
    assert len(source_terms) == len(set(source_terms)), "Overlapping source recipes"
    bound = 50 * (len(source_terms) + 1)
    source_notes = [
        {"id": "base-2021", "kind": "break", "sourceId": "ine-65985", "year": 2021, "messageKey": "baseBreak", "scope": "aggregate"},
        {"id": "method-2021", "kind": "definition", "sourceId": "ine-65985", "year": 2021, "messageKey": "methodBreak", "scope": "aggregate"},
        {"id": "euro-definition", "kind": "definition", "sourceId": "eurostat-divisions", "year": 2021, "messageKey": "euroDefinition", "scope": "source"},
        {"id": "households-98", "kind": "missing", "sourceId": "ine-65985", "messageKey": "householdsNote", "scope": "component", "code": "98"},
    ]
    source_prefix = {code[-2:]: code for code, _ in euro if code[-2:].isdigit()}
    observations = {}
    sectors = []
    parent_index = Counter()
    audit_flags = []
    comparisons = []
    for sector in taxonomy["sectors"]:
        sid = sector["id"]
        base = taxonomy["parents"][sector["parent"]]["colour"]
        rgb = [int(base[i:i + 2], 16) for i in (1, 3, 5)]
        tint = (parent_index[sector["parent"]] % 3) * 0.07
        colour = "#" + "".join("%02x" % round(v + (255 - v) * tint) for v in rgb)
        parent_index[sector["parent"]] += 1
        sectors.append({"id": sid, "name": sector["name"], "short": sector["short"], "description": sector["description"], "divisionCodes": sector["codes"], "sourceTerms": sector["terms"], "sourceSeries": [records[c]["seriesId"] for c in sector["terms"]], "parentId": sector["parent"], "colour": colour})
        observations[sid] = {}
        for year in YEARS:
            terms = [records[code]["values"].get(year) for code in sector["terms"]]
            assert all(v is not None for v in terms), "Unavailable input: %s %s" % (sid, year)
            refs = ["base-2021", "method-2021"] if year == 2021 else []
            if sid == "households":
                refs.append("households-98")
            # Warnings are from Eurostat, explicitly about components, not inferred INE CVs.
            components = []
            for term in sector["terms"]:
                if len(term) == 1:
                    observation = euro_sections.get((term, year), {"flags": "", "persons": None})
                else:
                    observation = euro.get((source_prefix.get(term, term), year), {"flags": "", "persons": None})
                if "u" in observation["flags"]:
                    components.append(term)
            if components:
                qid = "low-%s-%s" % (sid, year)
                refs.append(qid)
                warning_source = "eurostat-sections" if all(len(c) == 1 for c in sector["terms"]) else "eurostat-divisions"
                source_notes.append({"id": qid, "kind": "reliability", "sourceId": warning_source, "year": year, "messageKey": "componentReliability", "scope": "component", "codes": components})
            observations[sid][str(year)] = {"persons": sum(terms), "status": "published", "qualityRefs": refs}
    for code, record in records.items():
        ecode = code if len(code) == 1 or code == "TOTAL" else source_prefix.get(code)
        source = euro_sections if len(code) == 1 else euro
        for year in YEARS:
            eo = source.get((ecode, year)) if ecode else None
            if eo is None:
                continue
            iv = record["values"][year]
            comparisons.append({"code": code, "year": year, "inePersons": iv, "eurostatPersons": eo["persons"], "difference": None if iv is None or eo["persons"] is None else iv - eo["persons"], "eurostatFlags": eo["flags"]})
            if eo["flags"] or eo["persons"] is None:
                audit_flags.append({"code": code, "year": year, **eo})
    totals = {str(y): {"persons": records["TOTAL"]["values"][y], "status": "published", "qualityRefs": ["base-2021", "method-2021"] if y == 2021 else []} for y in YEARS}
    reconciliation = {}
    for year in YEARS:
        total = totals[str(year)]["persons"]
        sector_total = sum(observations[s["id"]][str(year)]["persons"] for s in sectors)
        difference = total - sector_total
        assert abs(difference) <= bound, "Unexplained reconciliation difference"
        reconciliation[str(year)] = {"sectorTotal": sector_total, "nationalTotal": total, "difference": difference, "roundingBound": bound}
    source_hash = hashlib.sha256(canonical({"pipelineVersion": PIPELINE_VERSION, "taxonomy": taxonomy, "sources": [s["sha256"] for s in manifest["sources"]]}).encode()).hexdigest()[:12]
    data = {"schemaVersion": 1, "releaseId": "epa-2008-2025-" + source_hash, "geography": "ES", "frequency": "A", "unit": "persons", "classification": "CNAE-2009", "populationDefinition": "EPA employed residents aged 16 and over in private households, by main-job establishment activity", "years": YEARS, "retrievedAt": manifest["retrievedAt"], "sources": [{k: v for k, v in s.items() if k != "file"} for s in manifest["sources"]], "parents": taxonomy["parents"], "sectors": sectors, "totals": totals, "employment": observations, "qualityNotes": source_notes, "reconciliation": reconciliation}
    audit = {"releaseId": data["releaseId"], "taxonomyVersion": taxonomy["version"], "years": YEARS, "divisionCount": 88, "sectorCount": 35, "observationCount": 630, "sourceTermCount": len(source_terms), "roundingBound": bound, "reconciliation": reconciliation, "sourceFlags": audit_flags, "crossSourceComparisons": comparisons, "unavailableIneDivisions": [{"code": c, "years": [y for y, v in r["values"].items() if v is None]} for c, r in records.items() if c.isdigit() and any(v is None for v in r["values"].values())]}
    return data, audit


def csv_text(data):
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["sector_id", "sector_es", "sector_en", "cnae2009_divisions", "year", "employed_persons", "national_employed_persons", "share", "quality_note_ids", "source", "release_id"])
    for sector in data["sectors"]:
        for year in data["years"]:
            obs = data["employment"][sector["id"]][str(year)]
            total = data["totals"][str(year)]["persons"]
            writer.writerow([sector["id"], sector["name"]["es"], sector["name"]["en"], "|".join(sector["divisionCodes"]), year, obs["persons"], total, obs["persons"] / total, "|".join(obs["qualityRefs"]), "INE EPA 65985", data["releaseId"]])
    return output.getvalue()


def build(check=False):
    manifest = read(RAW / "manifest.json")
    snapshots = {}
    for source in manifest["sources"]:
        body = (RAW / source["file"]).read_bytes()
        assert hashlib.sha256(body).hexdigest() == source["sha256"], "Source snapshot hash mismatch"
        snapshots[source["id"]] = json.loads(body)
    records, divisions = parse_ine(snapshots["ine-65985"])
    taxonomy = read(ROOT / "data" / "taxonomy.json")
    validate_taxonomy(taxonomy, divisions)
    data, audit = derive(records, taxonomy, parse_euro(snapshots["eurostat-divisions"]), parse_euro(snapshots["eurostat-sections"]), manifest)
    outputs = {OUT / "employment.json": canonical(data), OUT / "employment.csv": csv_text(data), ROOT / "data" / "audit.json": canonical(audit)}
    for path, contents in outputs.items():
        if check:
            assert path.read_text() == contents, "Generated output differs from source snapshots: %s" % path
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents)
    print("%s: 35 sectors, 18 years, 630 observations; 88 divisions covered exactly once; max annual rounding difference %s people (bound %s)." % ("Validated" if check else "Built", max(abs(v["difference"]) for v in data["reconciliation"].values()), audit["roundingBound"]))
    return data, audit


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.fetch:
        assert not args.check
        fetch_sources()
    build(check=args.check)
