"""Generate the test-only LERC1 grid consumed by ArcGIS elevation workers."""
import math
import struct
from pathlib import Path

size = 257  # Height posts for a 256-pixel geographic tile.
values = [
    1200 + 800 * math.sin(x * 2 * math.pi / 256) * math.sin(y * 2 * math.pi / 256)
    for y in range(size)
    for x in range(size)
]
pixels = struct.pack(f"<{len(values)}f", *values)
header = b"CntZImage " + struct.pack("<iiIId", 11, 8, size, size, 0.1)
valid_mask = struct.pack("<IIIf", 0, 0, 0, 1.0)
pixel_header = struct.pack("<IIIf", 1, 1, len(pixels) + 1, 2000.0)
Path(__file__).with_name("synthetic-terrain.lerc").write_bytes(
    header + valid_mask + pixel_header + b"\x00" + pixels
)
