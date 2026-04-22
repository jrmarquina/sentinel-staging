#!/usr/bin/env python3
"""
Convert Puerto Rico KML ward file → Guaynabo-only GeoJSON.

Usage:
  python3 tools/convert_kml_guaynabo.py \
      --kml /path/to/pr-wards.kml \
      --out apps/web/public/data/guaynabo-wards.geojson

The script filters features whose name or any attribute contains
"Guaynabo" (case-insensitive) and writes a GeoJSON FeatureCollection.

Place the output file at:
  apps/web/public/data/guaynabo-wards.geojson

The map page loads it from /data/guaynabo-wards.geojson.

Requirements: pip install fastkml lxml  (or: pip install pykml)
If fastkml is unavailable, the script falls back to pure-XML parsing.
"""

import argparse
import json
import sys
import re
from pathlib import Path

# ── Coordinate conversion helper ─────────────────────────────────────────────

def kml_coords_to_geojson(coord_str: str) -> list:
    """Convert KML coordinate string to GeoJSON coordinate list."""
    coords = []
    for triplet in coord_str.strip().split():
        parts = triplet.split(',')
        lng = float(parts[0])
        lat = float(parts[1])
        coords.append([lng, lat])
    return coords


# ── XML-based parser (no extra deps) ─────────────────────────────────────────

def parse_kml_xml(kml_path: str) -> dict:
    """Parse KML using stdlib xml.etree.ElementTree."""
    import xml.etree.ElementTree as ET

    tree = ET.parse(kml_path)
    root = tree.getroot()

    # KML namespace (may vary)
    ns_match = re.match(r'\{[^}]+\}', root.tag)
    ns = ns_match.group(0) if ns_match else ''

    features = []

    def find_placemarks(node):
        for child in node:
            tag = child.tag.replace(ns, '')
            if tag == 'Placemark':
                yield child
            else:
                yield from find_placemarks(child)

    for pm in find_placemarks(root):
        name_el = pm.find(f'{ns}name')
        name = name_el.text.strip() if name_el is not None and name_el.text else ''

        # Extended data — look for any field containing "Guaynabo"
        ext_text = ET.tostring(pm, encoding='unicode')
        is_guaynabo = 'guaynabo' in (name + ext_text).lower()

        if not is_guaynabo:
            continue

        # Extract ward name from ExtendedData if available
        ward_name = name
        barrio_name = ''
        for sdata in pm.iter(f'{ns}SimpleData'):
            val = sdata.text or ''
            attr_name = sdata.get('name', '').lower()
            if 'barrio' in attr_name or 'ward' in attr_name or 'name' in attr_name:
                if val and 'guaynabo' not in val.lower():
                    barrio_name = val
        if barrio_name:
            ward_name = barrio_name

        # Extract geometry
        geometry = None
        for poly_el in pm.iter(f'{ns}Polygon'):
            outer = poly_el.find(f'.//{ns}outerBoundaryIs//{ns}coordinates')
            if outer is not None and outer.text:
                coords = kml_coords_to_geojson(outer.text)
                if coords:
                    # Close ring if needed
                    if coords[0] != coords[-1]:
                        coords.append(coords[0])
                    geometry = {'type': 'Polygon', 'coordinates': [coords]}
                    break

        for mpoly_el in pm.iter(f'{ns}MultiGeometry'):
            polys = []
            for poly_el in mpoly_el.iter(f'{ns}Polygon'):
                outer = poly_el.find(f'.//{ns}outerBoundaryIs//{ns}coordinates')
                if outer is not None and outer.text:
                    coords = kml_coords_to_geojson(outer.text)
                    if coords:
                        if coords[0] != coords[-1]:
                            coords.append(coords[0])
                        polys.append([coords])
            if polys:
                geometry = {'type': 'MultiPolygon', 'coordinates': polys}
                break

        if geometry:
            features.append({
                'type': 'Feature',
                'properties': {
                    'name': ward_name,
                    'municipality': 'Guaynabo',
                },
                'geometry': geometry,
            })

    return {
        'type': 'FeatureCollection',
        'name': 'Guaynabo Wards',
        'crs': {
            'type': 'name',
            'properties': {'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'},
        },
        'features': features,
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Extract Guaynabo ward boundaries from PR KML file'
    )
    parser.add_argument(
        '--kml', required=True,
        help='Path to the PR wards KML file'
    )
    parser.add_argument(
        '--out', default='apps/web/public/data/guaynabo-wards.geojson',
        help='Output GeoJSON path (default: apps/web/public/data/guaynabo-wards.geojson)'
    )
    parser.add_argument(
        '--list-names', action='store_true',
        help='Only list feature names in the KML (for debugging)'
    )
    args = parser.parse_args()

    kml_path = Path(args.kml)
    if not kml_path.exists():
        print(f'ERROR: KML file not found: {kml_path}', file=sys.stderr)
        sys.exit(1)

    print(f'Parsing KML: {kml_path}')

    if args.list_names:
        # Debug mode — list all feature names
        import xml.etree.ElementTree as ET
        tree = ET.parse(str(kml_path))
        root = tree.getroot()
        ns_match = re.match(r'\{[^}]+\}', root.tag)
        ns = ns_match.group(0) if ns_match else ''
        names = set()
        for el in root.iter(f'{ns}name'):
            if el.text:
                names.add(el.text.strip())
        for name in sorted(names):
            print(f'  {name}')
        return

    geojson = parse_kml_xml(str(kml_path))

    if not geojson['features']:
        print('WARNING: No Guaynabo features found. Check the KML structure.')
        print('Try running with --list-names to see all feature names.')
        sys.exit(1)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f'Wrote {len(geojson["features"])} features to {out_path}')
    for feat in geojson['features']:
        print(f'  → {feat["properties"]["name"]}')


if __name__ == '__main__':
    main()
