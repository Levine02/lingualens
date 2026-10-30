#!/usr/bin/env python3
"""生成 LinguaLens 扩展图标（纯标准库手写 PNG，无需 Pillow）。"""
import zlib, struct, math, os

OUT = os.path.dirname(os.path.abspath(__file__))


def write_png(path, size, pixels):
    """pixels: list of rows, each row list of (r,g,b,a)"""
    raw = b""
    for row in pixels:
        raw += b"\x00" + b"".join(struct.pack("4B", *px) for px in row)
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_alpha(x, y, size, radius):
    """返回 0..1 的圆角矩形覆盖率（简单距离判定 + 边缘近似）"""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    d = math.hypot(x - cx, y - cy)
    return max(0.0, min(1.0, radius - d + 0.5))


def in_rect(x, y, x0, y0, x1, y1):
    return x0 <= x <= x1 and y0 <= y <= y1


def render(size):
    s = size / 128.0
    top = (46, 84, 166)      # 主色蓝
    bottom = (24, 47, 104)   # 深蓝
    px = []
    for y in range(size):
        row = []
        for x in range(size):
            # 背景渐变
            t = (x + y) / (2.0 * size)
            r, g, b = lerp(top, bottom, t)
            a = rounded_alpha(x, y, size, size * 0.22)

            # 右上高光
            hx, hy = size * 0.72, size * 0.26
            hr = size * 0.42
            if math.hypot(x - hx, y - hy) < hr:
                k = 1 - math.hypot(x - hx, y - hy) / hr
                r, g, b = lerp((r, g, b), (110, 152, 232), 0.35 * k)

            # 白色字母 L（竖笔 + 横笔）
            if in_rect(x, y, 34 * s, 30 * s, 48 * s, 92 * s) or \
               in_rect(x, y, 34 * s, 78 * s, 84 * s, 92 * s):
                r, g, b = (255, 255, 255)

            # 橙色“透镜”圆环
            cx, cy, rr = 78 * s, 44 * s, 17 * s
            d = math.hypot(x - cx, y - cy)
            if size >= 48 and abs(d - rr) < max(2.0, 3.4 * s):
                # 只画右上 ~120 度的弧，避免压到 L
                ang = math.atan2(y - cy, x - cx)
                if ang > -1.05 and math.degrees(ang) < 105:
                    r, g, b = (255, 158, 84)

            row.append((r, g, b, int(round(a * 255))))
        px.append(row)
    return px


for size in (16, 32, 48, 128):
    write_png(os.path.join(OUT, f"icon{size}.png"), size, render(size))
    print("generated", size)
