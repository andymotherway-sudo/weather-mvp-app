#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from metpy.io import Level3File


REFLECTIVITY_STOPS = [
    (5.0, (47, 120, 255, 38)),
    (10.0, (50, 155, 245, 72)),
    (15.0, (58, 204, 208, 118)),
    (25.0, (49, 196, 92, 165)),
    (35.0, (145, 214, 17, 190)),
    (40.0, (255, 214, 36, 210)),
    (50.0, (255, 127, 24, 230)),
    (60.0, (224, 36, 43, 240)),
    (70.0, (136, 41, 210, 245)),
]

REFLECTIVITY_MIN_DBZ = 8.0
REFLECTIVITY_WEAK_DBZ = 18.0
REFLECTIVITY_MIN_WEAK_NEIGHBORS = 5

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

CORRELATION_COEFFICIENT_STOPS = [
    (0.20, (92, 64, 153, 120)),
    (0.50, (52, 120, 190, 150)),
    (0.75, (44, 180, 170, 180)),
    (0.88, (92, 205, 120, 210)),
    (0.94, (230, 225, 80, 225)),
    (0.98, (245, 245, 245, 238)),
]

DIFFERENTIAL_REFLECTIVITY_STOPS = [
    (-6.0, (43, 87, 151, 230)),
    (-3.0, (48, 140, 205, 215)),
    (-1.0, (150, 205, 235, 180)),
    (0.0, (210, 215, 220, 125)),
    (1.0, (255, 228, 92, 185)),
    (3.0, (245, 148, 50, 215)),
    (6.0, (205, 55, 65, 235)),
]

VIL_STOPS = [
    (1.0, (46, 120, 210, 90)),
    (5.0, (42, 190, 190, 130)),
    (10.0, (68, 205, 105, 170)),
    (20.0, (255, 220, 75, 210)),
    (40.0, (245, 130, 42, 230)),
    (60.0, (220, 45, 65, 240)),
]

HYDROMETEOR_STOPS = [
    (10.0, (70, 130, 210, 130)),
    (20.0, (52, 190, 190, 165)),
    (30.0, (80, 205, 105, 190)),
    (40.0, (250, 220, 75, 210)),
    (50.0, (245, 145, 45, 225)),
    (60.0, (220, 50, 70, 235)),
    (80.0, (180, 90, 220, 235)),
    (100.0, (230, 230, 235, 230)),
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

    if product_code in {"N0B", "N0Q"}:
        values = values / 2.0 - 32.0
    elif product_code == "N0C":
        values = np.clip(values / 255.0, 0.0, 1.0)
    elif product_code == "N0X":
        values = (values - 128.0) / 16.0
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
    elif product_code == "DVL":
        values = values.astype("float32")
    elif product_code == "N0H":
        values = values.astype("float32")
    else:
        values = values / 2.0 - 32.0

    values[raw <= 1] = np.nan
    return values


def neighbor_count(mask: np.ndarray) -> np.ndarray:
    padded = np.pad(mask.astype(np.uint8), 1, mode="constant", constant_values=0)
    return (
        padded[:-2, :-2] + padded[:-2, 1:-1] + padded[:-2, 2:] +
        padded[1:-1, :-2] + padded[1:-1, 2:] +
        padded[2:, :-2] + padded[2:, 1:-1] + padded[2:, 2:]
    )


def clean_product_values(values: np.ndarray, product_code: str) -> np.ndarray:
    if product_code not in {"N0B", "N0Q"}:
        return values

    cleaned = values.copy()
    valid_echo = np.isfinite(cleaned) & (cleaned >= REFLECTIVITY_MIN_DBZ)
    weak_echo = valid_echo & (cleaned < REFLECTIVITY_WEAK_DBZ)
    isolated_weak_echo = weak_echo & (neighbor_count(valid_echo) < REFLECTIVITY_MIN_WEAK_NEIGHBORS)
    cleaned[isolated_weak_echo] = np.nan
    return cleaned


def colorize(values: np.ndarray, product_code: str) -> np.ndarray:
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    valid = np.isfinite(values)
    if product_code in {"N0S", "N0U"}:
        stops = VELOCITY_STOPS
        valid = valid & (np.abs(values) >= 1)
    elif product_code in {"EET", "NET"}:
        stops = ECHO_TOP_STOPS
        valid = valid & (values >= REFLECTIVITY_MIN_DBZ)
    elif product_code == "N0C":
        stops = CORRELATION_COEFFICIENT_STOPS
        valid = valid & (values >= 0.15)
    elif product_code == "N0X":
        stops = DIFFERENTIAL_REFLECTIVITY_STOPS
        valid = valid & (np.abs(values) <= 8)
    elif product_code == "DVL":
        stops = VIL_STOPS
        valid = valid & (values >= 1)
    elif product_code == "N0H":
        stops = HYDROMETEOR_STOPS
        valid = valid & (values >= 10)
    else:
        stops = REFLECTIVITY_STOPS
        valid = valid & (values >= REFLECTIVITY_MIN_DBZ)

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
    values = clean_product_values(decode_product_value(raw, product_code), product_code)
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
        "rendererCleanup": {
            "reflectivityMinDbz": REFLECTIVITY_MIN_DBZ,
            "reflectivityWeakDbz": REFLECTIVITY_WEAK_DBZ,
            "reflectivityMinWeakNeighbors": REFLECTIVITY_MIN_WEAK_NEIGHBORS,
        },
        "nonTransparentPixels": int(np.count_nonzero(np.asarray(image)[:, :, 3])),
    }

    if args.metadata_output:
        metadata_path = Path(args.metadata_output)
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
