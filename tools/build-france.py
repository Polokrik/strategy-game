#!/usr/bin/env python3
"""
Génère src/data/france.json : les provinces d'Ancien Régime, obtenues en fusionnant des départements actuels.

Il n'existe pas de jeu de données ouvert des provinces historiques ; les départements (IGN, via
gregoiredavid/france-geojson, Licence Ouverte) en sont une bonne approximation, car la Révolution les a
découpés dans les provinces. Le tableau ci-dessous est APPROXIMATIF : certains départements chevauchaient
plusieurs provinces (Haute-Loire, Oise, Ain, Gironde...). Pour corriger le découpage, modifier PROVINCES
puis relancer ce script.

Usage : python3 tools/build-france.py [departements.geojson]   (télécharge le fichier s'il est absent)
Dépendance : shapely (pip install shapely)
"""
import json
import math
import os
import sys
import urllib.request

import numpy as np
import shapely
from shapely.geometry import shape
from shapely.ops import polylabel, unary_union

URL = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "france.json")

# id -> (nom, départements). Découpage de la carte « provinces » fournie par Paul (26 provinces).
PROVINCES = {
    "flandre-artois": ("Flandre-Artois", ["59", "62"]),
    "picardie": ("Picardie", ["80", "02", "60"]),
    "normandie": ("Normandie", ["76", "27", "14", "50", "61"]),
    "bretagne": ("Bretagne", ["29", "22", "56", "35", "44"]),
    "maine": ("Maine", ["72", "53"]),
    "anjou-touraine": ("Anjou-Touraine", ["49", "37"]),
    "poitou": ("Poitou", ["86", "79", "85"]),
    "saintonge": ("Saintonge", ["17", "16"]),
    "gascogne": ("Gascogne", ["33", "40", "32", "65", "64"]),
    "guyenne": ("Guyenne", ["24", "47", "46", "12", "82"]),
    "languedoc": ("Languedoc", ["11", "34", "30", "48", "81", "31", "09", "66", "07"]),
    "provence": ("Provence", ["13", "83", "84", "04", "06"]),
    "dauphine": ("Dauphiné", ["38", "26", "05"]),
    "savoie": ("Savoie", ["73", "74"]),
    "lyonnais": ("Lyonnais", ["69", "42"]),
    "auvergne": ("Auvergne", ["63", "15", "43", "03"]),
    "limousin": ("Limousin", ["87", "19", "23"]),
    "berry": ("Berry", ["18", "36"]),
    "orleanais": ("Orléanais", ["45", "41", "28"]),
    "ile-de-france": ("Île-de-France", ["75", "77", "78", "91", "92", "93", "94", "95"]),
    "champagne": ("Champagne", ["51", "10", "52", "08"]),
    "lorraine": ("Lorraine", ["54", "55", "57", "88"]),
    "alsace": ("Alsace", ["67", "68"]),
    "franche-comte": ("Franche-Comté", ["25", "39", "70", "90"]),
    "bourgogne": ("Bourgogne", ["21", "71", "89", "58", "01"]),
    "corse": ("Corse", ["2A", "2B"]),
}

WORLD_W = 100.0
MIN_ISLAND = 1.2  # on ignore les îlots plus petits (unités monde au carré)
SIMPLIFY = 0.14
MIN_SHARED_BORDER = 0.6  # longueur de frontière commune pour être voisines


def load(path):
    if not os.path.exists(path):
        print("téléchargement", URL)
        urllib.request.urlretrieve(URL, path)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "departements.geojson")
    data = load(src)
    depts = {f["properties"]["code"]: shape(f["geometry"]) for f in data["features"]}

    assigned = [c for _, (_, codes) in PROVINCES.items() for c in codes]
    missing = sorted(set(depts) - set(assigned))
    dupes = sorted({c for c in assigned if assigned.count(c) > 1})
    unknown = sorted(set(assigned) - set(depts))
    assert not missing and not dupes and not unknown, f"manquants {missing}, doublons {dupes}, inconnus {unknown}"

    allgeom = unary_union(list(depts.values()))
    lon0, lat0, lon1, _ = allgeom.bounds[0], allgeom.bounds[3], allgeom.bounds[2], allgeom.bounds[1]
    k = WORLD_W / ((lon1 - lon0) * math.cos(math.radians(46.5)))

    def proj_geom(g):
        return shapely.transform(
            g,
            lambda c: np.column_stack(
                ((c[:, 0] - lon0) * math.cos(math.radians(46.5)) * k, (lat0 - c[:, 1]) * k)
            ),
        )

    raw = {pid: proj_geom(unary_union([depts[c] for c in codes])) for pid, (_, codes) in PROVINCES.items()}
    height = max(g.bounds[3] for g in raw.values())

    out = []
    for pid, (name, _) in PROVINCES.items():
        g = raw[pid]
        parts = [g] if g.geom_type == "Polygon" else list(g.geoms)
        parts = sorted((p for p in parts if p.area >= MIN_ISLAND), key=lambda p: -p.area)
        main = parts[0]
        anchor = polylabel(main, tolerance=0.1)
        shapes = []
        for p in parts:
            s = p.simplify(SIMPLIFY, preserve_topology=True)
            if s.geom_type == "MultiPolygon":
                s = max(s.geoms, key=lambda q: q.area)
            shapes.append([[round(x, 2), round(y, 2)] for x, y in s.exterior.coords][:-1])
        out.append(
            {
                "id": pid,
                "name": name,
                "x": round(anchor.x, 2),
                "y": round(anchor.y, 2),
                "area": round(g.area, 1),
                "shapes": shapes,
                "neighbors": [],
            }
        )

    ids = list(PROVINCES)
    by_id = {p["id"]: p for p in out}
    for i, a in enumerate(ids):
        for b in ids[i + 1 :]:
            shared = raw[a].intersection(raw[b])
            if shared.length >= MIN_SHARED_BORDER:
                by_id[a]["neighbors"].append(b)
                by_id[b]["neighbors"].append(a)

    # îles sans voisin terrestre : liaison maritime vers la province continentale la plus proche
    sea = []
    for p in out:
        if not p["neighbors"]:
            nearest = min((q for q in ids if q != p["id"]), key=lambda q: raw[p["id"]].distance(raw[q]))
            sea.append([p["id"], nearest])
            by_id[p["id"]]["neighbors"].append(nearest)
            by_id[nearest]["neighbors"].append(p["id"])

    result = {"width": WORLD_W, "height": round(height, 1), "provinces": out, "seaLinks": sea}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    pts = sum(len(s) for p in out for s in p["shapes"])
    print(f"{len(out)} provinces, {pts} sommets, hauteur {result['height']}, {os.path.getsize(OUT) // 1024} Ko -> {OUT}")
    for p in out:
        print(f"  {p['name']:<16} {len(p['neighbors'])} voisins : {', '.join(p['neighbors'])}")


if __name__ == "__main__":
    main()
