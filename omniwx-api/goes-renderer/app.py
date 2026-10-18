"""On-demand GOES-19 GeoColor viewport renderer.

The public CIRA/NOAA GeoColor products are published in geostationary image
coordinates. This service reprojects only the requested Web-Mercator viewport,
so no imagery is written to object storage and no scheduled worker is needed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from io import BytesIO
import os
import re
from threading import BoundedSemaphore, Lock
from typing import Any

from flask import Flask, Response, jsonify, request
import numpy as np
from PIL import Image
import requests

app = Flask(__name__)

STAR_PAGE = "https://www.star.nesdis.noaa.gov/GOES/fulldisk_band.php?band=GEOCOLOR&dim=1&length=48&sat=G19"
# NOAA STAR publishes the same CIRA GeoColor frame at several resolutions.
# The 1808px preview is suitable for a full-disk web animation, but it falls
# apart at regional map zoom. 5424px keeps the renderer within Cloud Run's
# memory envelope while supplying enough source detail for a 512px map tile.
STAR_IMAGE = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/{frame}_GOES19-ABI-FD-GEOCOLOR-5424x5424.jpg"
# The STAR loop manifest references its 1808px preview. The timestamp is
# shared by every published size, so use that preview only for discovery and
# request the matching 5424px asset for rendering.
FRAME_RE = re.compile(r"(20\d{9})_GOES19-ABI-FD-GEOCOLOR-1808x1808\.jpg")
FRAME_ID_RE = re.compile(r"^20\d{9}$")
# A fixed lock stripe avoids accumulating one lock for every historical scan
# while still coalescing the concurrent requests for an individual frame.
IMAGE_FRAME_LOCKS = tuple(Lock() for _ in range(16))
# Two distinct 5424px decodes can run safely inside the 1 GiB Cloud Run
# allocation. More would improve a cold loop only marginally while making
# memory consumption and upstream bandwidth much less predictable.
IMAGE_LOAD_LIMIT = BoundedSemaphore(2)

# GOES-R fixed-grid geometry. The rendered GeoColor image is the full disk
# resampled to a square, retaining ABI's +/- 0.151844 radian scan angle range.
SATELLITE_LON = np.deg2rad(-75.2)
SEMI_MAJOR = 6378137.0
SEMI_MINOR = 6356752.31414
SATELLITE_DISTANCE = 42164160.0
SCAN_LIMIT = 0.151844


def cors(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Cache-Control"] = "public, max-age=120, stale-while-revalidate=600"
    return response


def frame_time(frame: str) -> datetime:
    return datetime.strptime(frame, "%Y%j%H%M").replace(tzinfo=timezone.utc)


def iso(frame: str) -> str:
    return frame_time(frame).isoformat().replace("+00:00", "Z")


@lru_cache(maxsize=1)
def fetch_frames() -> tuple[str, ...]:
    response = requests.get(STAR_PAGE, timeout=20, headers={"User-Agent": "omniwx-goes-renderer/1.0"})
    response.raise_for_status()
    seen: set[str] = set()
    frames: list[str] = []
    for frame in FRAME_RE.findall(response.text):
        if frame not in seen:
            seen.add(frame)
            frames.append(frame)
    if not frames:
        raise RuntimeError("NOAA STAR did not publish GeoColor frames")
    return tuple(sorted(frames))


def refreshable_frames() -> tuple[str, ...]:
    # The page itself updates every scan. Keep this process-local cache short
    # by invalidating it per manifest request; Cloud Run remains on-demand.
    fetch_frames.cache_clear()
    return fetch_frames()


@lru_cache(maxsize=3)
def load_image(frame: str) -> np.ndarray:
    url = STAR_IMAGE.format(frame=frame)
    response = requests.get(url, timeout=45, headers={"User-Agent": "omniwx-goes-renderer/1.0"})
    response.raise_for_status()
    with Image.open(BytesIO(response.content)) as image:
        return np.asarray(image.convert("RGB"))


def fetch_image(frame: str) -> np.ndarray:
    if not FRAME_ID_RE.fullmatch(frame):
        raise ValueError("invalid frame")
    # A 5424px decoded RGB frame occupies roughly 85 MiB. Requests for the
    # same frame share one load, while the semaphore permits only two distinct
    # decodes at once. That keeps cold animations responsive without allowing
    # an unbounded playback burst to consume the container's memory.
    frame_lock = IMAGE_FRAME_LOCKS[hash(frame) % len(IMAGE_FRAME_LOCKS)]
    with frame_lock:
        with IMAGE_LOAD_LIMIT:
            return load_image(frame)


def mercator_to_lat_lon(bbox: tuple[float, float, float, float], width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    west, south, east, north = bbox
    x = np.linspace(west, east, width, endpoint=False) + (east - west) / width / 2
    y = np.linspace(north, south, height, endpoint=False) - (north - south) / height / 2
    lon = np.rad2deg(x / SEMI_MAJOR)
    lat = np.rad2deg(2 * np.arctan(np.exp(y / SEMI_MAJOR)) - np.pi / 2)
    return np.meshgrid(lon, lat)


def goes_pixel_coordinates(lon_deg: np.ndarray, lat_deg: np.ndarray, source_width: int, source_height: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    lat = np.deg2rad(lat_deg)
    lon = np.deg2rad(lon_deg)
    eccentricity_sq = 1 - (SEMI_MINOR * SEMI_MINOR) / (SEMI_MAJOR * SEMI_MAJOR)
    radius = SEMI_MAJOR / np.sqrt(1 - eccentricity_sq * np.sin(lat) ** 2)
    relative_lon = lon - SATELLITE_LON
    sx = SATELLITE_DISTANCE - radius * np.cos(lat) * np.cos(relative_lon)
    sy = -radius * np.cos(lat) * np.sin(relative_lon)
    sz = radius * np.sin(lat)
    scan_x = np.arctan2(-sy, sx)
    scan_y = np.arctan2(sz, np.sqrt(sx * sx + sy * sy))
    visible = sx > 0
    px = (scan_x + SCAN_LIMIT) / (2 * SCAN_LIMIT) * (source_width - 1)
    py = (SCAN_LIMIT - scan_y) / (2 * SCAN_LIMIT) * (source_height - 1)
    visible &= (px >= 0) & (px < source_width) & (py >= 0) & (py < source_height)
    return px, py, visible


def render(frame: str, bbox: tuple[float, float, float, float], width: int, height: int) -> bytes:
    source = fetch_image(frame)
    lon, lat = mercator_to_lat_lon(bbox, width, height)
    px, py, visible = goes_pixel_coordinates(lon, lat, source.shape[1], source.shape[0])
    output = np.zeros((height, width, 4), dtype=np.uint8)
    output[..., 3] = np.where(visible, 255, 0)
    # Bilinear sampling prevents the blocky nearest-neighbor look when the
    # requested Web-Mercator pixels do not fall exactly on ABI source pixels.
    source_x = px[visible]
    source_y = py[visible]
    x0 = np.floor(source_x).astype(np.int32)
    y0 = np.floor(source_y).astype(np.int32)
    x1 = np.minimum(x0 + 1, source.shape[1] - 1)
    y1 = np.minimum(y0 + 1, source.shape[0] - 1)
    x_weight = (source_x - x0)[:, np.newaxis]
    y_weight = (source_y - y0)[:, np.newaxis]
    top = source[y0, x0].astype(np.float32) * (1 - x_weight) + source[y0, x1].astype(np.float32) * x_weight
    bottom = source[y1, x0].astype(np.float32) * (1 - x_weight) + source[y1, x1].astype(np.float32) * x_weight
    output[visible, :3] = (top * (1 - y_weight) + bottom * y_weight).astype(np.uint8)
    image = Image.fromarray(output, "RGBA")
    encoded = BytesIO()
    image.save(encoded, format="PNG", optimize=True)
    return encoded.getvalue()


def parse_bbox(value: str | None) -> tuple[float, float, float, float]:
    if not value:
        raise ValueError("bbox is required")
    values = tuple(float(part) for part in value.split(","))
    if len(values) != 4 or not values[0] < values[2] or not values[1] < values[3]:
        raise ValueError("bbox must be west,south,east,north in EPSG:3857")
    return values  # type: ignore[return-value]


def parse_dimension(name: str, default: int) -> int:
    raw = request.args.get(name, str(default))
    value = int(raw)
    if value < 128 or value > 1600:
        raise ValueError(f"{name} must be between 128 and 1600")
    return value


@app.get("/health")
def health() -> Response:
    return cors(jsonify({"ok": True, "service": "goes-geocolor-renderer"}))


@app.get("/frames")
def frames() -> Response:
    try:
        minutes_back = max(30, min(360, int(request.args.get("minutesBack", "120"))))
        now = datetime.now(timezone.utc)
        source_frames = refreshable_frames()
        selected = [frame for frame in source_frames if (now - frame_time(frame)).total_seconds() <= (minutes_back + 15) * 60]
        latest = source_frames[-1]
        return cors(jsonify({
            "ok": True,
            "source": "NOAA STAR / CIRA GOES-19 GeoColor",
            "frames": [{"index": index, "iso": iso(frame), "sourceId": frame} for index, frame in enumerate(selected)],
            "sourceAgeMinutes": max(0, round((now - frame_time(latest)).total_seconds() / 60)),
        }))
    except Exception as error:
        return cors(jsonify({"ok": False, "error": str(error)})), 502


@app.get("/render")
def render_frame() -> Response:
    try:
        frame = request.args.get("frame", "")
        if not FRAME_ID_RE.fullmatch(frame):
            raise ValueError("frame is required")
        payload = render(frame, parse_bbox(request.args.get("bbox")), parse_dimension("width", 960), parse_dimension("height", 960))
        response = Response(payload, content_type="image/png")
        response.headers["X-OMNIwx-GOES-Frame"] = frame
        return cors(response)
    except ValueError as error:
        return cors(jsonify({"ok": False, "error": str(error)})), 400
    except Exception as error:
        return cors(jsonify({"ok": False, "error": str(error)})), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
