"""从 aigengtu.com 桌宠动画馆的精灵图生成插件用的逐帧横条（sprite strip）。

用法：
    python build-sprite.py <源精灵图.webp> <输出.webp>

素材来源
--------
DeepSeek娘桌宠动画（包 id: dsh「蓝毛小女仆·经典包」，动作「待机呼吸休闲」）
    https://aigengtu.com/pet-anims
    数据: https://aigengtu.com/public/pet-anims.json
    原图: https://img.aigengtu.com/pets/dsh/<动作名>.webp

版权归原作者（站点声明：DeepSeek娘形象为社区二创，形象版权归各创作者，
女仆鲸鱼娘一系禁商用）。本脚本仅做裁剪/缩放/拼条，供**个人本地使用**；
要公开发布或商用前请自行取得授权，或换用自己的素材。

为什么要在本地拼条
------------------
原图是 8×15 的网格大图（5120×5400），浏览器里用 background-position
无法整齐地逐格播放；先把采样帧裁到同一内容框、缩放到目标高度、
横向拼成一条，就能用一个 steps(N) 动画逐帧播放。
"""

import sys

from PIL import Image

# 原图的网格与内容框（所有帧的并集，保证动画不抖）
COLS, ROWS = 8, 15
CROP = (205, 55, 440, 335)  # 235 x 280
TOTAL_FRAMES = 120
STEP = 4          # 每 4 帧取 1 帧 -> 30 帧，覆盖完整循环
TARGET_H = 140    # 生成 118x140，前端按 80x95 显示（约 1.5x 下采样，更清晰）
QUALITY = 72


def main(src_path: str, out_path: str) -> None:
    src = Image.open(src_path).convert("RGBA")
    fw, fh = src.size[0] // COLS, src.size[1] // ROWS
    cw, ch = CROP[2] - CROP[0], CROP[3] - CROP[1]
    tw, th = round(cw * TARGET_H / ch), TARGET_H

    idx = list(range(0, TOTAL_FRAMES, STEP))
    strip = Image.new("RGBA", (tw * len(idx), th), (0, 0, 0, 0))
    for n, i in enumerate(idx):
        c, r = i % COLS, i // COLS
        frame = src.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)).crop(CROP)
        strip.paste(frame.resize((tw, th), Image.LANCZOS), (n * tw, 0))

    strip.save(out_path, "WEBP", quality=QUALITY, method=6)
    print(f"{out_path}: frames={len(idx)} cell={tw}x{th} strip={strip.size}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
