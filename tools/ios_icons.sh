#!/usr/bin/env bash
# Regenerate every app icon from public/icons/icon-1024.png:
#   PWA:  icon-192.png, icon-512.png (also the maskable icon, so keep the art's
#         key content inside the central 80%), apple-touch-icon.png
#   iOS:  AppIcon.appiconset (single 1024 universal icon, no alpha)
#         Splash.imageset (rounded icon shown on the yellow launch screen)
# Needs python3 with Pillow.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=public/icons/icon-1024.png
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

python3 - "$SRC" <<'PY'
import sys
from PIL import Image, ImageDraw

YELLOW = (248, 222, 79)  # #f8de4f, the launch screen / manifest background
src = Image.open(sys.argv[1]).convert('RGBA').resize((1024, 1024), Image.LANCZOS)

def flat(img):
    """Opaque copy: iOS and App Store icons must not have an alpha channel."""
    bg = Image.new('RGBA', img.size, YELLOW + (255,))
    return Image.alpha_composite(bg, img).convert('RGB')

def save(img, size, path):
    img.resize((size, size), Image.LANCZOS).save(path, optimize=True)
    print('  ' + path)

icon = flat(src)
save(icon, 192, 'public/icons/icon-192.png')
save(icon, 512, 'public/icons/icon-512.png')
save(icon, 180, 'public/icons/apple-touch-icon.png')

save(icon, 1024, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')

# Launch screen logo: the icon with iOS-like rounded corners on transparency.
# 768 px covers the 45%-of-height slot on the largest iPad.
r = Image.new('L', (3072, 3072), 0)
ImageDraw.Draw(r).rounded_rectangle((0, 0, 3071, 3071), radius=int(3072 * 0.2237), fill=255)
logo = icon.resize((768, 768), Image.LANCZOS).convert('RGBA')
logo.putalpha(r.resize((768, 768), Image.LANCZOS))
logo.save('ios/App/App/Assets.xcassets/Splash.imageset/splash-logo.png', optimize=True)
print('  ios/App/App/Assets.xcassets/Splash.imageset/splash-logo.png')
PY
