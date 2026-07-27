#!/usr/bin/env python3

import argparse
import gzip
import json
import math
from pathlib import Path
import tempfile

import numpy as np
from PIL import Image
import xarray as xr

from render_mrms_proof import colorize, scalar_coord


WEB_MERCATOR_MAX_LAT = 85.05112878


def parse_args():
    parser = argparse.ArgumentParser(description="Create local XYZ proof tiles from a decoded MRMS raster.")
    parser.add_argument("--input", required=True, help="Input .grib2 or .grib2.gz path")
    parser.add_argument("--output-dir", required=True, help="Output XYZ tile directory")
    parser.add_argument("--product", required=True, help="MRMS product label")
    parser.add_argument("--min-z", type=int, default=3, help="Minimum XYZ zoom")
    parser.add_argument("--max-z", type=int, default=4, help="Maximum XYZ zoom")
    parser.add_argument("--tile-size", type=int, default=256, help="Tile size in pixels")
    return parser.parse_args()


def decompressed_path(input_path: Path):
    if input_path.suffix != ".gz":
        return input_path, None
    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".grib2")
    temp_path = Path(temp.name)
    temp.close()
    with gzip.open(input_path, "rb") as src:
        temp_path.write_bytes(src.read())
    return temp_path, temp_path


def lon_to_tile_x(lon, z):
    return int(math.floor(((lon + 180.0) / 360.0) * (2 ** z)))


def lat_to_tile_y(lat, z):
    lat = max(-WEB_MERCATOR_MAX_LAT, min(WEB_MERCATOR_MAX_LAT, lat))
    lat_rad = math.radians(lat)
    return int(math.floor((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * (2 ** z)))


def sample_nearest(data, latitudes, longitudes, tile_lons, tile_lats):
    lon_values = np.where(longitudes > 180.0, longitudes - 360.0, longitudes)
    lon_min = float(np.nanmin(lon_values))
    lon_max = float(np.nanmax(lon_values))
    lat_min = float(np.nanmin(latitudes))
    lat_max = float(np.nanmax(latitudes))

    lon_step = abs(float(lon_values[1] - lon_values[0]))
    lat_step = abs(float(latitudes[1] - latitudes[0]))
    lon0 = float(lon_values[0])
    lat0 = float(latitudes[0])

    inside = (
        (tile_lons >= lon_min) &
        (tile_lons <= lon_max) &
        (tile_lats >= lat_min) &
        (tile_lats <= lat_max)
    )
    rows = np.rint((lat0 - tile_lats) / lat_step).astype(np.int64)
    cols = np.rint((tile_lons - lon0) / lon_step).astype(np.int64)
    rows = np.clip(rows, 0, data.shape[0] - 1)
    cols = np.clip(cols, 0, data.shape[1] - 1)

    sampled = np.full(tile_lons.shape, np.nan, dtype=np.float32)
    sampled[inside] = data[rows[inside], cols[inside]]
    sampled[sampled <= -900] = np.nan
    return sampled


def tile_bounds_for_raster(latitudes, longitudes, z):
    lon_values = np.where(longitudes > 180.0, longitudes - 360.0, longitudes)
    west = float(np.nanmin(lon_values))
    east = float(np.nanmax(lon_values))
    south = float(np.nanmin(latitudes))
    north = float(np.nanmax(latitudes))
    max_index = (2 ** z) - 1
    min_x = max(0, min(max_index, lon_to_tile_x(west, z)))
    max_x = max(0, min(max_index, lon_to_tile_x(east, z)))
    min_y = max(0, min(max_index, lat_to_tile_y(north, z)))
    max_y = max(0, min(max_index, lat_to_tile_y(south, z)))
    return west, south, east, north, min_x, max_x, min_y, max_y


def render_tile(data, latitudes, longitudes, z, x, y, tile_size):
    n = 2 ** z
    px = np.arange(tile_size, dtype=np.float64)
    py = np.arange(tile_size, dtype=np.float64)
    world_x = (x * tile_size + px + 0.5) / tile_size
    world_y = (y * tile_size + py + 0.5) / tile_size
    tile_lons_1d = world_x / n * 360.0 - 180.0
    mercator = math.pi * (1.0 - 2.0 * world_y / n)
    tile_lats_1d = np.degrees(np.arctan(np.sinh(mercator)))
    tile_lons, tile_lats = np.meshgrid(tile_lons_1d, tile_lats_1d)
    sampled = sample_nearest(data, latitudes, longitudes, tile_lons, tile_lats)
    return Image.fromarray(colorize(sampled), "RGBA")


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    grib_path, cleanup_path = decompressed_path(input_path)

    try:
        dataset = xr.open_dataset(str(grib_path), engine="cfgrib", backend_kwargs={"indexpath": ""})
        variable_name = next(iter(dataset.data_vars))
        data = dataset[variable_name].values.astype("float32")
        data[data <= -900] = np.nan
        latitudes = dataset["latitude"].values.astype("float64")
        longitudes = dataset["longitude"].values.astype("float64")

        manifest = {
            "ok": True,
            "source": "NOAA MRMS",
            "product": args.product,
            "variable": variable_name,
            "input": str(input_path),
            "validTime": scalar_coord(dataset, "valid_time"),
            "time": scalar_coord(dataset, "time"),
            "tileSize": args.tile_size,
            "minZoom": args.min_z,
            "maxZoom": args.max_z,
            "sourceShape": list(data.shape),
            "tiles": [],
        }

        for z in range(args.min_z, args.max_z + 1):
            west, south, east, north, min_x, max_x, min_y, max_y = tile_bounds_for_raster(latitudes, longitudes, z)
            manifest["bounds"] = {"west": west, "south": south, "east": east, "north": north}
            for x in range(min_x, max_x + 1):
                for y in range(min_y, max_y + 1):
                    tile = render_tile(data, latitudes, longitudes, z, x, y, args.tile_size)
                    if not np.asarray(tile.getchannel("A")).any():
                        continue
                    path = output_dir / str(z) / str(x) / f"{y}.png"
                    path.parent.mkdir(parents=True, exist_ok=True)
                    tile.save(path)
                    manifest["tiles"].append({
                        "z": z,
                        "x": x,
                        "y": y,
                        "path": str(path),
                        "bytes": path.stat().st_size,
                    })

        manifest_path = output_dir / "manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest["tileCount"] = len(manifest["tiles"])
        manifest["totalBytes"] = sum(tile["bytes"] for tile in manifest["tiles"])
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps({**manifest, "manifestPath": str(manifest_path), "tiles": manifest["tiles"][:12]}, indent=2))
    finally:
        if cleanup_path:
            cleanup_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
