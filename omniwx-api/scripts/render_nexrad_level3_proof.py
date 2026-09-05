#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from metpy.io import Level3File


REFLECTIVITY_STOPS = [
    (5.0, (47, 120, 255, 95)),
    (15.0, (58, 204, 208, 130)),
    (25.0, (49, 196, 92, 165)),
    (35.0, (145, 214, 17, 190)),
    (40.0, (255, 214, 36, 210)),
    (50.0, (255, 127, 24, 230)),
    (60.0, (224, 36, 43, 240)),
    (70.0, (136, 41, 210, 245)),
]

VELOCITY_STOPS = [
    (-80.0, (66, 25, 128, 230)),
    (-50.0, (46, 89, 190, 215)),
    (-25.0, (45, 185, 220, 190)),
    (-5.0, (76, 210, 120, 155)),
    (0.0, (190, 198, 205, 100)),
    (5.0, (255, 221, 71, 175)),
    (25.0, (255, 221, 71, 175)),
    (50.0, (245, 116, 42, 215)),
    (80.0, (210, 32, 47, 235)),
]

ECHO_TOP_STOPS = [
    (5.0, (62, 130, 220, 100)),
    (15.0, (44, 190, 200, 135)),
    (25.0, (60, 205, 100, 170)),
    (35.0, (255, 222, 65, 205)),
    (45.0, (250, 140, 42, 225)),
    (55.0, (224, 45, 65, 240)),
    (65.0, (225, 75, 220, 245)),
]


def parse_args():
    parser = argparse.ArgumentParser(description="Render a transparent local NEXRAD Level III proof PNG.")
    parser.add_argument("--input", required=True, help="Input Level III file")
    parser.add_argument("--output", required=True, help="Output transparent PNG path")
    parser.add_argument("--metadata-output", help="Optional JSON metadata output")
    parser.add_argument("--size", type=int, default=1024, help="Square proof size")
    parser.add_argument("--max-range-km", type=float, help="Override render radius in km")
    return parser.parse_args()


def decode_product_value(raw: np.ndarray, product_code: str) -> np.ndarray:
    values = raw.astype("float32")
    values[raw <= 1] = np.nan

    if product_code in {"N0B", "N0Q", "N0C", "N0X"}:
        values = values / 2.0 - 32.0
    elif product_code in {"N0S", "N0U"}:
        if raw.size and int(np.nanmax(raw)) <= 15:
            velocity_bins = np.array(
                [np.nan, np.nan, -70.0, -50.0, -36.0, -26.0, -20.0, -10.0, -5.0, 0.0, 5.0, 10.0, 20.0, 26.0, 36.0, 50.0],
                dtype="float32",
            )
            values = velocity_bins[np.clip(raw, 0, len(velocity_bins) - 1)]
        else:
            values = values - 129.0
    elif product_code in {"EET", "NET"}:
        # Echo tops are encoded in kft-like bins for these Level III products.
        values = values.astype("float32")
    else:
        values = values / 2.0 - 32.0

    values[raw <= 1] = np.nan
    return values


def colorize(values: np.ndarray, product_code: str) -> np.ndarray:
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    valid = np.isfinite(values)
    if product_code in {"N0S", "N0U"}:
        stops = VELOCITY_STOPS
        valid = valid & (np.abs(values) >= 1)
    elif product_code in {"EET", "NET"}:
        stops = ECHO_TOP_STOPS
        valid = valid & (values >= 5)
    else:
        stops = REFLECTIVITY_STOPS
        valid = valid & (values >= 5)

    for lower, color in stops:
        rgba[(values >= lower) & valid] = color
    rgba[~valid] = (0, 0, 0, 0)
    return rgba


def packet_to_arrays(packet):
    radials = len(packet["data"])
    gates = max(len(row) for row in packet["data"])
    raw = np.zeros((radials, gates), dtype=np.uint8)
    for index, row in enumerate(packet["data"]):
        if isinstance(row, (bytes, bytearray, memoryview)):
            row_values = np.frombuffer(row, dtype=np.uint8)
        else:
            row_values = np.asarray(row, dtype=np.uint8)
        raw[index, :len(row_values)] = row_values
    start_az = np.asarray(packet["start_az"], dtype="float32")
    end_az = np.asarray(packet["end_az"], dtype="float32")
    azimuths = (start_az + ((end_az - start_az) % 360.0) / 2.0) % 360.0
    return raw, azimuths


def render_cartesian(raw, values, azimuths, max_range_km, size):
    radius_px = size / 2.0
    y, x = np.indices((size, size), dtype="float32")
    x = x - radius_px + 0.5
    y = radius_px - y - 0.5
    range_km = np.hypot(x, y) / radius_px * max_range_km
    azimuth = (np.degrees(np.arctan2(x, y)) + 360.0) % 360.0

    gate_spacing_km = max_range_km / raw.shape[1]
    gate_index = np.floor(range_km / gate_spacing_km).astype("int32")
    azimuth_step = 360.0 / raw.shape[0]
    radial_index = np.floor(((azimuth - azimuths[0]) % 360.0) / azimuth_step).astype("int32")
    radial_index = np.clip(radial_index, 0, raw.shape[0] - 1)

    cart = np.full((size, size), np.nan, dtype="float32")
    in_range = gate_index >= 0
    in_range &= gate_index < raw.shape[1]
    in_range &= range_km <= max_range_km
    cart[in_range] = values[radial_index[in_range], gate_index[in_range]]
    return cart


def iso_or_none(value):
    return value.isoformat() if hasattr(value, "isoformat") else None


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    level3 = Level3File(str(input_path))
    packet = level3.sym_block[0][0]
    raw, azimuths = packet_to_arrays(packet)
    product_code = input_path.name.split("_")[1] if "_" in input_path.name else str(level3.wmo_code or "")
    values = decode_product_value(raw, product_code)
    max_range_km = float(args.max_range_km or level3.max_range or (raw.shape[1] * level3.ij_to_km))
    size = max(256, min(2048, int(args.size)))
    cart = render_cartesian(raw, values, azimuths, max_range_km, size)

    image = Image.fromarray(colorize(cart, product_code), "RGBA")
    image.save(output_path)

    metadata = {
        "ok": True,
        "source": "NOAA NEXRAD Level III",
        "input": str(input_path),
        "output": str(output_path),
        "site": level3.siteID,
        "product": product_code,
        "productName": level3.product_name,
        "lat": level3.lat,
        "lon": level3.lon,
        "heightFt": getattr(level3, "height", None),
        "maxRangeKm": max_range_km,
        "ijToKm": getattr(level3, "ij_to_km", None),
        "radials": int(raw.shape[0]),
        "gates": int(raw.shape[1]),
        "imageSize": size,
        "validTime": iso_or_none(level3.metadata.get("vol_time")),
        "productTime": iso_or_none(level3.metadata.get("prod_time")),
        "valueMin": float(np.nanmin(values)),
        "valueMax": float(np.nanmax(values)),
        "nonTransparentPixels": int(np.count_nonzero(np.asarray(image)[:, :, 3])),
    }

    if args.metadata_output:
        metadata_path = Path(args.metadata_output)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
