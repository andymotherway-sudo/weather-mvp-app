#!/usr/bin/env python3

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from metpy.io import Level3File

from render_nexrad_level3_proof import colorize, decode_product_value, packet_to_arrays


WEB_MERCATOR_MAX_LAT = 85.05112878
EARTH_RADIUS_KM = 6371.0088


def parse_args():
    parser = argparse.ArgumentParser(description="Create local XYZ proof tiles from a NEXRAD Level III frame.")
    parser.add_argument("--input", required=True, help="Input Level III file")
    parser.add_argument("--output-dir", required=True, help="Output XYZ tile directory")
    parser.add_argument("--min-z", type=int, default=6, help="Minimum XYZ zoom")
    parser.add_argument("--max-z", type=int, default=7, help="Maximum XYZ zoom")
    parser.add_argument("--tile-size", type=int, default=256, help="Tile size in pixels")
    parser.add_argument("--supersample", type=int, default=1, help="Render larger then downsample for smoother tiles")
    parser.add_argument("--max-range-km", type=float, help="Override station render radius in km")
    return parser.parse_args()


def lon_to_tile_x(lon, z):
    return int(math.floor(((lon + 180.0) / 360.0) * (2 ** z)))


def lat_to_tile_y(lat, z):
    lat = max(-WEB_MERCATOR_MAX_LAT, min(WEB_MERCATOR_MAX_LAT, lat))
    lat_rad = math.radians(lat)
    return int(math.floor((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * (2 ** z)))


def tile_bounds_for_station(lat, lon, range_km, z):
    lat_delta = math.degrees(range_km / EARTH_RADIUS_KM)
    lon_delta = math.degrees(range_km / (EARTH_RADIUS_KM * max(0.2, math.cos(math.radians(lat)))))
    west = lon - lon_delta
    east = lon + lon_delta
    south = lat - lat_delta
    north = lat + lat_delta
    max_index = (2 ** z) - 1
    min_x = max(0, min(max_index, lon_to_tile_x(west, z)))
    max_x = max(0, min(max_index, lon_to_tile_x(east, z)))
    min_y = max(0, min(max_index, lat_to_tile_y(north, z)))
    max_y = max(0, min(max_index, lat_to_tile_y(south, z)))
    return west, south, east, north, min_x, max_x, min_y, max_y


def render_tile(values, azimuths, station_lat, station_lon, max_range_km, z, x, y, tile_size, product_code):
    n = 2 ** z
    px = np.arange(tile_size, dtype=np.float64)
    py = np.arange(tile_size, dtype=np.float64)
    world_x = (x * tile_size + px + 0.5) / tile_size
    world_y = (y * tile_size + py + 0.5) / tile_size
    tile_lons_1d = world_x / n * 360.0 - 180.0
    mercator = math.pi * (1.0 - 2.0 * world_y / n)
    tile_lats_1d = np.degrees(np.arctan(np.sinh(mercator)))
    tile_lons, tile_lats = np.meshgrid(tile_lons_1d, tile_lats_1d)

    dy_km = np.radians(tile_lats - station_lat) * EARTH_RADIUS_KM
    dx_km = np.radians(tile_lons - station_lon) * EARTH_RADIUS_KM * math.cos(math.radians(station_lat))
    range_km = np.hypot(dx_km, dy_km)
    azimuth = (np.degrees(np.arctan2(dx_km, dy_km)) + 360.0) % 360.0

    gate_spacing_km = max_range_km / values.shape[1]
    gate_index = np.floor(range_km / gate_spacing_km).astype("int32")
    azimuth_step = 360.0 / values.shape[0]
    radial_index = np.floor(((azimuth - azimuths[0]) % 360.0) / azimuth_step).astype("int32")
    radial_index = np.clip(radial_index, 0, values.shape[0] - 1)

    sampled = np.full((tile_size, tile_size), np.nan, dtype="float32")
    in_range = (range_km <= max_range_km) & (gate_index >= 0) & (gate_index < values.shape[1])
    sampled[in_range] = values[radial_index[in_range], gate_index[in_range]]
    return Image.fromarray(colorize(sampled, product_code), "RGBA")


def downsample_tile(tile, tile_size):
    if tile.size == (tile_size, tile_size):
        return tile
    resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    return tile.resize((tile_size, tile_size), resampling)


def iso_or_none(value):
    return value.isoformat() if hasattr(value, "isoformat") else None


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    level3 = Level3File(str(input_path))
    packet = level3.sym_block[0][0]
    raw, azimuths = packet_to_arrays(packet)
    product_code = input_path.name.split("_")[1] if "_" in input_path.name else str(level3.wmo_code or "")
    values = decode_product_value(raw, product_code)
    max_range_km = float(args.max_range_km or level3.max_range or (raw.shape[1] * level3.ij_to_km))
    finite_values = values[np.isfinite(values)]
    alpha_preview = np.asarray(colorize(values, product_code))[:, :, 3]

    manifest = {
        "ok": True,
        "source": "NOAA NEXRAD Level III",
        "input": str(input_path),
        "site": level3.siteID,
        "product": product_code,
        "productName": level3.product_name,
        "lat": level3.lat,
        "lon": level3.lon,
        "maxRangeKm": max_range_km,
        "radials": int(raw.shape[0]),
        "gates": int(raw.shape[1]),
        "rawMin": int(np.min(raw)) if raw.size else None,
        "rawMax": int(np.max(raw)) if raw.size else None,
        "finiteValueCount": int(finite_values.size),
        "valueMin": float(np.min(finite_values)) if finite_values.size else None,
        "valueMax": float(np.max(finite_values)) if finite_values.size else None,
        "nonTransparentSourceCells": int(np.count_nonzero(alpha_preview)),
        "validTime": iso_or_none(level3.metadata.get("vol_time")),
        "productTime": iso_or_none(level3.metadata.get("prod_time")),
        "tileSize": args.tile_size,
        "supersample": max(1, min(4, int(args.supersample))),
        "minZoom": args.min_z,
        "maxZoom": args.max_z,
        "byZoom": {},
        "tiles": [],
    }

    for z in range(args.min_z, args.max_z + 1):
        west, south, east, north, min_x, max_x, min_y, max_y = tile_bounds_for_station(level3.lat, level3.lon, max_range_km, z)
        manifest["bounds"] = {"west": west, "south": south, "east": east, "north": north}
        manifest["byZoom"][str(z)] = {"tileCount": 0, "totalBytes": 0}
        for x in range(min_x, max_x + 1):
            for y in range(min_y, max_y + 1):
                render_size = args.tile_size * manifest["supersample"]
                tile = render_tile(values, azimuths, level3.lat, level3.lon, max_range_km, z, x, y, render_size, product_code)
                tile = downsample_tile(tile, args.tile_size)
                if not np.asarray(tile.getchannel("A")).any():
                    continue
                path = output_dir / str(z) / str(x) / f"{y}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                tile.save(path)
                size_bytes = path.stat().st_size
                manifest["byZoom"][str(z)]["tileCount"] += 1
                manifest["byZoom"][str(z)]["totalBytes"] += size_bytes
                manifest["tiles"].append({
                    "z": z,
                    "x": x,
                    "y": y,
                    "path": str(path),
                    "bytes": size_bytes,
                })

    manifest_path = output_dir / "manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest["tileCount"] = len(manifest["tiles"])
    manifest["totalBytes"] = sum(tile["bytes"] for tile in manifest["tiles"])
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({**manifest, "manifestPath": str(manifest_path), "tiles": manifest["tiles"][:12]}, indent=2))


if __name__ == "__main__":
    main()
