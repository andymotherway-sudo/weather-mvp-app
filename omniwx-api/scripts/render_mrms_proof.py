#!/usr/bin/env python3

import argparse
import gzip
import json
from pathlib import Path
import tempfile

import numpy as np
from PIL import Image
import xarray as xr


REFLECTIVITY_COLOR_STOPS = [
    (-32.0, (0, 0, 0, 0)),
    (5.0, (44, 150, 255, 72)),
    (15.0, (50, 210, 95, 122)),
    (25.0, (250, 230, 65, 170)),
    (35.0, (250, 150, 45, 205)),
    (45.0, (235, 45, 55, 230)),
    (55.0, (220, 70, 210, 242)),
    (65.0, (255, 255, 255, 250)),
]

ECHO_TOP_COLOR_STOPS = [
    (-1.0, (0, 0, 0, 0)),
    (5.0, (65, 170, 255, 72)),
    (15.0, (50, 210, 140, 124)),
    (25.0, (245, 222, 60, 176)),
    (35.0, (250, 138, 44, 210)),
    (45.0, (232, 54, 72, 232)),
    (55.0, (176, 68, 220, 244)),
    (65.0, (255, 255, 255, 250)),
]

PRECIP_RATE_COLOR_STOPS = [
    (-0.01, (0, 0, 0, 0)),
    (0.2, (54, 156, 255, 64)),
    (1.0, (45, 205, 120, 112)),
    (3.0, (152, 215, 44, 150)),
    (8.0, (250, 220, 64, 190)),
    (16.0, (250, 142, 42, 220)),
    (32.0, (228, 48, 60, 240)),
    (64.0, (190, 72, 230, 250)),
]


def parse_args():
    parser = argparse.ArgumentParser(description="Render a downsampled transparent MRMS proof PNG.")
    parser.add_argument("--input", required=True, help="Input .grib2 or .grib2.gz path")
    parser.add_argument("--output", required=True, help="Output PNG path")
    parser.add_argument("--product", default="MergedReflectivityQCComposite", help="MRMS product label")
    parser.add_argument("--max-width", type=int, default=1400, help="Downsampled proof width")
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


def product_palette(product: str):
    normalized = (product or "").lower()
    if "echotop" in normalized:
        return ECHO_TOP_COLOR_STOPS, 5.0
    if "preciprate" in normalized:
        return PRECIP_RATE_COLOR_STOPS, 0.2
    return REFLECTIVITY_COLOR_STOPS, 5.0


def colorize(values: np.ndarray, product: str = "MergedReflectivityQCComposite") -> np.ndarray:
    stops, minimum_visible = product_palette(product)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    valid = np.isfinite(values)
    for lower, color in stops:
        rgba[(values >= lower) & valid] = color
    rgba[(values < minimum_visible) | ~valid] = (0, 0, 0, 0)
    return rgba


def scalar_coord(dataset, name: str):
    if name not in dataset.coords:
        return None
    value = dataset.coords[name].values
    if np.issubdtype(np.asarray(value).dtype, np.datetime64):
        return np.datetime_as_string(value, unit="s")
    if hasattr(value, "item"):
        value = value.item()
    return str(value)


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    grib_path, cleanup_path = decompressed_path(input_path)

    try:
        dataset = xr.open_dataset(str(grib_path), engine="cfgrib", backend_kwargs={"indexpath": ""})
        variable_name = next(iter(dataset.data_vars))
        data = dataset[variable_name].values.astype("float32")
        max_width = max(256, min(args.max_width, data.shape[1]))
        stride = max(1, int(np.ceil(data.shape[1] / max_width)))
        sampled = data[::stride, ::stride]
        image = Image.fromarray(colorize(sampled, args.product), "RGBA")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path)

        payload = {
            "ok": True,
            "input": str(input_path),
            "output": str(output_path),
            "product": args.product,
            "variable": variable_name,
            "sourceShape": list(data.shape),
            "proofShape": [image.height, image.width],
            "stride": stride,
            "validTime": scalar_coord(dataset, "valid_time"),
            "time": scalar_coord(dataset, "time"),
            "min": float(np.nanmin(data)),
            "max": float(np.nanmax(data)),
        }
        print(json.dumps(payload, indent=2))
    finally:
        if cleanup_path:
            cleanup_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
