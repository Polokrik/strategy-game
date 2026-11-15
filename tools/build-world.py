#!/usr/bin/env python3
"""
Génère src/data/world/europe-ouest.json : le premier théâtre de la campagne Monde.

Fond : Natural Earth 1:50m « land » (domaine public, naturalearthdata.com). Le découpage en régions est une
ABSTRACTION DE JEU, pas une donnée historique : des cellules de Voronoï autour de points posés à la main sur
de grands ensembles naturels (bassins, massifs, vallées), découpées par le trait de côte. Aucune frontière
politique, ancienne ou moderne, n'y figure. Les noms sont des toponymes géographiques actuels, employés
comme repères ; ils ne désignent aucune société de l'époque jouée.

Usage : python3 tools/build-world.py [ne_50m_land.geojson]   (télécharge le fichier s'il est absent)
Dépendance : shapely
"""
import json
import math
import os
import sys
import urllib.request

from shapely.geometry import MultiPoint, Point, box, shape
from shapely.ops import polylabel, unary_union, voronoi_diagram

URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "world", "europe-ouest.json")

# id -> (nom, longitude, latitude) du point autour duquel la région est découpée
SEEDS = {
    "armorique": ("Armorique", -3.0, 48.2),
    "bassin-parisien": ("Bassin parisien", 2.5, 48.8),
    "val-de-loire": ("Val de Loire", 0.3, 47.2),
    "bassin-aquitain": ("Bassin aquitain", 0.0, 44.6),
    "massif-central": ("Massif central", 2.8, 45.3),
    "golfe-du-lion": ("Golfe du Lion", 3.2, 43.5),
    "vallee-du-rhone": ("Vallée du Rhône", 5.0, 45.3),
    "provence": ("Provence", 6.3, 43.7),
    "plaine-du-nord": ("Plaine du Nord", 3.0, 50.4),
    "plateau-lorrain": ("Plateau lorrain", 6.0, 48.8),
    "seuil-de-bourgogne": ("Seuil de Bourgogne", 4.6, 47.2),
    "vallee-de-l-ebre": ("Vallée de l'Èbre", -0.9, 42.0),
    "cote-cantabrique": ("Côte cantabrique", -5.0, 43.1),
    "galice": ("Galice", -8.0, 42.6),
    "meseta-nord": ("Meseta nord", -4.6, 41.2),
    "meseta-sud": ("Meseta sud", -3.6, 39.2),
    "levant": ("Levant", -0.7, 39.4),
    "guadalquivir": ("Vallée du Guadalquivir", -5.2, 37.5),
    "estuaire-du-tage": ("Estuaire du Tage", -8.4, 39.3),
    "catalogne": ("Catalogne", 1.7, 41.8),
    "rhin-moyen": ("Rhin moyen", 8.0, 50.0),
    "plaine-germanique": ("Plaine germanique", 9.8, 52.6),
    "delta-du-rhin": ("Delta du Rhin", 5.4, 52.0),
    "arc-alpin": ("Arc alpin", 9.2, 46.8),
    "plaine-du-po": ("Plaine du Pô", 10.0, 45.1),
    "haut-danube": ("Haut Danube", 11.2, 48.6),
    "sud-bretagne-insulaire": ("Sud de la Grande-Bretagne", -1.3, 51.4),
    "galles-cornouailles": ("Galles et Cornouailles", -3.7, 52.1),
}
# traversées maritimes proposées (cabotage court) ; tout le reste de la mer est infranchissable en Phase 1
SEA_LINKS = [("plaine-du-nord", "sud-bretagne-insulaire")]

# le théâtre : un cadre, moins l'Afrique du Nord et la péninsule italienne (hors périmètre de ce premier théâtre)
THEATRE = box(-10.6, 35.95, 14.0, 54.2).difference(box(-1.9, 30, 14.5, 37.4)).difference(box(7.6, 30, 20, 43.95))
LAT0 = 46.0
WIDTH = 100.0


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "ne_50m_land.geojson")
    if not os.path.exists(path):
        urllib.request.urlretrieve(URL, path)
    land = unary_union([shape(f["geometry"]) for f in json.load(open(path))["features"]]).intersection(THEATRE)

    ids = list(SEEDS)
    points = [Point(SEEDS[i][1], SEEDS[i][2]) for i in ids]
    cells = list(voronoi_diagram(MultiPoint(points), envelope=THEATRE.buffer(5)).geoms)

    k = math.cos(math.radians(LAT0))
    minx, miny, maxx, maxy = THEATRE.bounds
    scale = WIDTH / ((maxx - minx) * k)
    project = lambda lon, lat: (round((lon - minx) * k * scale, 2), round((maxy - lat) * scale, 2))

    geoms = {}
    for rid, pt in zip(ids, points):
        cell = next(c for c in cells if c.contains(pt))
        pieces = cell.intersection(land)
        pieces = list(pieces.geoms) if hasattr(pieces, "geoms") else [pieces]
        pieces = [p for p in pieces if p.geom_type == "Polygon" and p.area > 0]
        # une région = le morceau de terre qui porte son point (les îles et presqu'îles détachées sont laissées de côté)
        geoms[rid] = min(pieces, key=lambda p: p.distance(pt))

    regions = []
    for rid in ids:
        g = geoms[rid]
        simple = g.simplify(0.04, preserve_topology=True)
        anchor = polylabel(simple, tolerance=0.05)
        x, y = project(anchor.x, anchor.y)
        neighbors = sorted(o for o in ids if o != rid and g.buffer(0.02).intersection(geoms[o]).area > 1e-4 and g.intersection(geoms[o].buffer(0.02)).length > 0.25)
        for a, b in SEA_LINKS:
            if rid in (a, b):
                neighbors = sorted(set(neighbors) | {b if rid == a else a})
        regions.append(
            {
                "id": rid,
                "name": SEEDS[rid][0],
                "x": x,
                "y": y,
                "area": round(g.area * k * scale * scale, 1),
                "shape": [list(project(lon, lat)) for lon, lat in simple.exterior.coords[:-1]],
                "neighbors": neighbors,
            }
        )

    out = {
        "id": "europe-ouest",
        "name": "Europe de l'Ouest",
        "source": {"land": "Natural Earth 1:50m land", "license": "domaine public", "url": "https://www.naturalearthdata.com/"},
        "note": "Découpage abstrait (Voronoï autour de grands ensembles naturels) : hypothèse de jeu, pas une donnée historique.",
        "width": WIDTH,
        "height": round((maxy - miny) * scale, 2),
        "regions": regions,
        "seaLinks": [list(l) for l in SEA_LINKS],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(regions)} régions, {out['width']}x{out['height']}, {os.path.getsize(OUT) // 1024} Ko")
    for r in regions:
        print(f"  {r['name']:28} aire {r['area']:6} voisines {len(r['neighbors'])}: {', '.join(r['neighbors'])}")


if __name__ == "__main__":
    main()
