#!/usr/bin/env python3
"""Draws the 1024x1024 app icon (a pixel-art Ban Khoi face) with only the standard library.
Output has no alpha channel, as the App Store requires."""
import struct, sys, zlib

N = 24                                   # icon grid is 24 x 24 cells
SKY, GRASS, GRASS2 = (126, 200, 255), (108, 192, 74), (92, 172, 62)
MINT, DARK, BELLY, LEG = (127, 227, 180), (92, 200, 150), (201, 247, 223), (79, 185, 140)
EYE, SHINE, EYE2 = (28, 35, 48), (255, 255, 255), (74, 90, 120)
CHEEK, MOUTH, TONGUE, LEAF = (255, 157, 184), (122, 45, 61), (255, 122, 147), (56, 179, 74)

grid = [[SKY] * N for _ in range(N)]
for y in range(N):
    for x in range(N):
        if y >= 19: grid[y][x] = GRASS if (x + y) % 2 else GRASS2
def box(x0, y0, w, h, c):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w): grid[y][x] = c
# body and legs under the head
box(8, 19, 8, 3, MINT); box(10, 20, 4, 2, BELLY); box(8, 22, 3, 2, LEG); box(13, 22, 3, 2, LEG)
box(5, 19, 2, 3, DARK); box(17, 19, 2, 3, DARK)
# head 16 x 16 cells at (4, 3): face drawn on a 16 x 16 grid
HX, HY = 4, 3
box(HX, HY, 16, 16, MINT); box(HX, HY, 16, 1, DARK)
for ex in (2, 11):
    box(HX + ex, HY + 4, 3, 4, EYE); box(HX + ex, HY + 4, 1, 1, SHINE); box(HX + ex + 2, HY + 7, 1, 1, EYE2)
box(HX, HY + 9, 2, 2, CHEEK); box(HX + 14, HY + 9, 2, 2, CHEEK)
box(HX + 5, HY + 10, 1, 1, MOUTH); box(HX + 10, HY + 10, 1, 1, MOUTH); box(HX + 6, HY + 11, 4, 1, MOUTH); box(HX + 7, HY + 12, 2, 1, TONGUE)
# leaf sprout on top
box(11, 1, 2, 2, LEAF); box(8, 1, 3, 1, LEAF); box(13, 1, 3, 1, LEAF)

SIZE = 1024
rows = []
for py in range(SIZE):
    cy = py * N // SIZE
    row = bytearray([0])
    for px in range(SIZE):
        row += bytes(grid[cy][px * N // SIZE])
    rows.append(bytes(row))
raw = b''.join(rows)
def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
open(sys.argv[1] if len(sys.argv) > 1 else 'icon-1024.png', 'wb').write(png)
