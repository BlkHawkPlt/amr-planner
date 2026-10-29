from PIL import Image, ImageDraw, ImageFont
import os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'icons')
def icon(size, maskable=False):
    im = Image.new('RGB', (size, size), '#14243b'); d = ImageDraw.Draw(im)
    pad = int(size * (0.18 if maskable else 0.0))
    if not maskable:
        m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], int(size * .2), fill=255)
        bg = Image.new('RGB', (size, size), '#14243b'); im = Image.new('RGB', (size, size), '#14243b'); im.paste(bg, (0, 0), m)
        d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', int(size * .30))
    f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', int(size * .12))
    cx = size // 2
    # simple instrument "needle" ring
    r = int(size * (.33 if maskable else .38)); c = (cx, int(size * .40))
    d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], outline='#f5b301', width=max(3, size // 40))
    d.line([c[0], c[1], c[0] + int(r * .6), c[1] - int(r * .6)], fill='#f5b301', width=max(3, size // 36))
    d.ellipse([c[0] - size // 40, c[1] - size // 40, c[0] + size // 40, c[1] + size // 40], fill='#f5b301')
    t = 'AMR'; w = d.textlength(t, font=f1)
    d.text((cx - w / 2, int(size * (.66 if not maskable else .64))), t, font=f1, fill='white')
    t = 'PLANNER'; w = d.textlength(t, font=f2)
    d.text((cx - w / 2, int(size * (.88 if not maskable else .84))), t, font=f2, fill='#9fb3d1')
    return im
os.makedirs(out, exist_ok=True)
icon(180).save(out + '/apple-touch-icon.png'); icon(192).save(out + '/icon-192.png'); icon(512).save(out + '/icon-512.png'); icon(512, True).save(out + '/icon-maskable-512.png')
icon(32).save(out + '/favicon.png')
print('icons ok')
