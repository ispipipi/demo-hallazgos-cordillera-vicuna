#!/usr/bin/env python3
"""Normalize the legacy semicolon export into the demo's stable data model.

The source export contains multiline descriptions and a few malformed Excel
rows. This script keeps valid hallazgo identifiers, joins continuation lines,
deduplicates repeated identifiers, anonymizes the project names, and writes a
deterministic 166-record JSON dataset for the static demo.
"""

from __future__ import annotations

import json
import re
import html
from pathlib import Path


SOURCE = Path("/Users/julioespinoza/Downloads/Hallazgos Tranque Las Tórtolas.csv")
TARGET = Path(__file__).resolve().parents[1] / "data" / "hallazgos.json"

START_RE = re.compile(r"^(H-[A-Z]+-\d{4}-\d{3}|(?:TRP|DSR)\d{2}-(?:LT(?:/PC)?-\d{2}))(?=;)")
YEAR_RE = re.compile(r"(?:H-[A-Z]+-(20\d{2})|(?:TRP|DSR)(\d{2}))")
SEVERITIES = {"Low": "Baja", "Medium": "Media", "Significant": "Alta", "High": "Crítica"}
BOOLEAN_VALUES = {"true", "false"}
INVALID_IDS = {"TRP21-05", "TRP21-08"}


def clean_text(value: str) -> str:
    value = html.unescape(value.replace('""', '"').replace('"', ""))
    value = re.sub(r"\s+", " ", value).strip(" ;")
    replacements = {
        "Las Tórtolas": "Cordillera",
        "Las Tortolas": "Cordillera",
        "Las Tortalas": "Cordillera",
        "Los Bronces": "Vicuña",
        "Pérez Caldera": "Vicuña",
        "Anglo American": "el consorcio minero",
        "Jose Illanes": "responsable EoR principal",
        "Jaime Urquidi": "responsable EoR alterno",
        "Arcadis": "la EoR",
        "Golder": "la consultora geotécnica",
        "KCB": "el panel técnico",
        "Hatch": "el consultor externo",
        "Ardum": "el consultor externo",
        "AA operations": "la operación",
        "AA (": "el consorcio (",
        "AA should": "el consorcio debería",
        "AA may": "el consorcio podría",
        "AA ": "el consorcio ",
    }
    for source, replacement in replacements.items():
        value = value.replace(source, replacement)
    return value


def parse_progress(segment: list[str]) -> int:
    for value in segment[:7]:
        match = re.fullmatch(r"\s*(\d{1,3})%\s*", value)
        if match:
            return max(0, min(100, int(match.group(1))))
    joined = " ".join(segment[:7])
    match = re.search(r"\b(\d{1,3})%\b", joined)
    return max(0, min(100, int(match.group(1)))) if match else 0


def parse_severity(segment: list[str]) -> str:
    for value in reversed(segment):
        if value.strip() in SEVERITIES:
            return SEVERITIES[value.strip()]
    return "Media"


def parse_bool(segment: list[str]) -> bool:
    return any(value.strip().lower() == "true" for value in segment)


def source_year(identifier: str) -> int:
    match = YEAR_RE.search(identifier)
    if not match:
        return 2025
    return int(match.group(1) or f"20{match.group(2)}")


def wall_label(wall: str) -> str:
    return {
        "MO": "Muro Oeste",
        "MP": "Muro Principal",
        "ME": "Muro Este",
        "MPL": "Muro Planta",
        "General": "General",
    }.get(wall, "General")


def normalize_id(identifier: str) -> str:
    return identifier.replace("/", "-")


def build_record(segment: list[str]) -> dict:
    first = segment[0].split(";")
    raw_id = first[0].strip()
    origin = (first[1] if len(first) > 1 else "EoR").strip() or "EoR"
    wall = (first[2] if len(first) > 2 else "General").strip() or "General"
    name = clean_text(first[3] if len(first) > 3 else "") or f"Hallazgo {raw_id}"
    progress = parse_progress(first)

    description_parts: list[str] = []
    bool_index = next((index for index, value in enumerate(first[5:], start=5) if value.strip().lower() in BOOLEAN_VALUES), None)
    description_end = bool_index if bool_index is not None else len(first)
    for value in first[5:description_end]:
        cleaned = clean_text(value)
        if cleaned and not re.fullmatch(r"\d{1,3}%", cleaned):
            description_parts.append(cleaned)

    for continuation in segment[1:]:
        for value in continuation.split(";"):
            cleaned = clean_text(value)
            if not cleaned or cleaned.startswith("#¿NOMBRE?") or cleaned.lower() in BOOLEAN_VALUES or cleaned in SEVERITIES:
                continue
            if re.fullmatch(r"\d{1,3}%", cleaned) or set(cleaned) <= {"-", "_"}:
                continue
            description_parts.append(cleaned)

    description = clean_text(" ".join(dict.fromkeys(description_parts)))
    if not description:
        description = "Hallazgo registrado para seguimiento y gestión del plan de acción."

    year = source_year(raw_id)
    status = "Abierto" if progress == 0 else "Cerrado" if progress == 100 else "En proceso"
    responsible = {
        "EoR": "Equipo Geotecnia",
        "TRP": "Panel TRP",
        "DSR": "Panel DSR",
    }.get(origin, "Equipo Geotecnia")

    return {
        "id": normalize_id(raw_id),
        "origen": origin if origin in {"EoR", "TRP", "DSR"} else "EoR",
        "muro": wall if wall in {"MO", "MP", "ME", "MPL", "General"} else "General",
        "muroLabel": wall_label(wall),
        "nombre": name,
        "descripcion": description,
        "severidad": parse_severity(first),
        "progreso": progress,
        "status": status,
        "responsable": responsible,
        "fecha": f"{year}-12-15",
        "planAccion": parse_bool(first),
    }


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8-sig").splitlines()[1:]
    starts = [index for index, line in enumerate(lines) if START_RE.match(line)]
    segments: list[list[str]] = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        segments.append(lines[start:end])

    records: list[dict] = []
    seen: set[str] = set()
    for segment in segments:
        raw_id = segment[0].split(";", 1)[0].strip()
        if raw_id in INVALID_IDS:
            continue
        record = build_record(segment)
        if record["id"] in seen:
            continue
        seen.add(record["id"])
        records.append(record)

    records.sort(key=lambda record: (record["fecha"], record["id"]))
    if len(records) != 166:
        raise SystemExit(f"Se esperaban 166 hallazgos normalizados, se obtuvieron {len(records)}")

    TARGET.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Escritos {len(records)} hallazgos en {TARGET}")


if __name__ == "__main__":
    main()
