#!/usr/bin/env python3
"""Regenerates the photo-spike fixtures in test/fixtures/ (docs/decisions.md L2, item M0-04).

    python3 scripts/make-photo-fixtures.py [output-dir]

Needs Python 3 with Pillow, and the `exiv2` command line tool (for the XMP block).
Writes:
  clean-1.jpg, clean-2.jpg  two different JPEGs with no metadata at all (the two required photos)
  gps.jpg                   EXIF GPS (lat/long/altitude) plus DateTimeOriginal
  xmp-gps.jpg               no EXIF; XMP GPS (exif:GPSLatitude/GPSLongitude) written by exiv2
  text-chunk.png            PNG with tEXt chunks holding coordinates and an iTXt XMP packet
  trailer-gps.jpg           a clean JPEG with an EXIF/XMP packet appended AFTER the end-of-image marker
                            (extra to the four in decisions.md L2: a scan that stops at the image data misses it)
  large-clean.jpg           a clean JPEG of about 4.5 MB (the field allows 5 MB), for the hook timing test;
                            gitignored, regenerate with this script

It does NOT make iphone.heic. A fake HEIC would prove nothing about what an iPhone writes;
drop a real one from a phone into test/fixtures/iphone.heic (AirDrop or a cable, never
through an app that re-encodes it).

The spot is made up: 43.1234 N, 77.5678 W (Lake Ontario). Tests look for these digits
("43", "77.5678", "7.404"), so keep them in step with test/spike/ if you change them.
"""
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from PIL.PngImagePlugin import PngInfo

LAT, LON, ALT = (43, 7, 24.24), (77, 34, 4.08), 75  # 43.1234 N, 77.5678 W as d/m/s
LAT_DECIMAL, LON_DECIMAL = "43.1234", "77.5678"
TAKEN = "2026:10:03 06:58:12"  # DateTimeOriginal as a phone writes it (local time, no zone)

WIDTH, HEIGHT = 640, 480


def picture(seed: int) -> Image.Image:
    """A plain gradient with the seed drawn on it, so every fixture differs byte for byte."""
    img = Image.new("RGB", (WIDTH, HEIGHT))
    px = img.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            px[x, y] = ((x + seed * 40) % 256, (y * 255 // HEIGHT + seed * 70) % 256, (x + y + seed * 25) % 256)
    ImageDraw.Draw(img).text((20, 20), f"fixture {seed}", fill=(255, 255, 255))
    return img


def rational(dms):
    return tuple(float(v) for v in dms)


def write_gps_jpeg(path: Path) -> None:
    img = picture(2)
    exif = Image.Exif()
    exif_ifd = exif.get_ifd(0x8769)
    exif_ifd[0x9003] = TAKEN  # DateTimeOriginal
    exif_ifd[0x9004] = TAKEN  # DateTimeDigitized
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2] = "N", rational(LAT)
    gps[3], gps[4] = "W", rational(LON)
    gps[5], gps[6] = 0, float(ALT)
    exif[0x010F] = "FixtureCam"  # Make
    exif[0x0110] = "Spike 1"  # Model
    img.save(path, "JPEG", quality=85, exif=exif)


def write_xmp_gps_jpeg(path: Path) -> None:
    picture(3).save(path, "JPEG", quality=85)  # no EXIF at all
    commands = [
        "set Xmp.exif.GPSLatitude 43,7.404N",
        "set Xmp.exif.GPSLongitude 77,34.068W",
        "set Xmp.exif.DateTimeOriginal 2026-10-03T06:58:12",
    ]
    args = ["exiv2"]
    for command in commands:
        args += ["-M", command]
    args.append(str(path))
    subprocess.run(args, check=True)


def write_text_chunk_png(path: Path) -> None:
    info = PngInfo()
    info.add_text("Location", f"{LAT_DECIMAL} N, {LON_DECIMAL} W")
    info.add_text("Comment", "GPS 43.1234,-77.5678 taken at the north weed bed")
    xmp = (
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="43,7.404N" '
        'exif:GPSLongitude="77,34.068W"/></rdf:RDF></x:xmpmeta>'
    )
    info.add_itxt("XML:com.adobe.xmp", xmp)
    picture(4).save(path, "PNG", pnginfo=info)


def write_trailer_jpeg(path: Path) -> None:
    clean = (path.parent / "clean-1.jpg").read_bytes()
    packet = (
        b'<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">'
        b'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description '
        b'xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="43,7.404N" exif:GPSLongitude="77,34.068W"/>'
        b"</rdf:RDF></x:xmpmeta><?xpacket end='w'?>"
    )
    path.write_bytes(clean + b"Exif\x00\x00" + packet)


def write_large_jpeg(path: Path) -> None:
    import random

    rng = random.Random(7)
    img = Image.frombytes("RGB", (2560, 1920), rng.randbytes(2560 * 1920 * 3))
    for quality in (92, 88, 84, 80, 70, 60):
        img.save(path, "JPEG", quality=quality)
        if path.stat().st_size < 4_900_000:
            return
    sys.exit("could not make large-clean.jpg under 4.9 MB")


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "test" / "fixtures"
    out.mkdir(parents=True, exist_ok=True)
    if shutil.which("exiv2") is None:
        sys.exit("exiv2 not found: install it (dnf install exiv2 / apt install exiv2)")
    picture(0).save(out / "clean-1.jpg", "JPEG", quality=85)
    picture(1).save(out / "clean-2.jpg", "JPEG", quality=85)
    write_gps_jpeg(out / "gps.jpg")
    write_xmp_gps_jpeg(out / "xmp-gps.jpg")
    write_text_chunk_png(out / "text-chunk.png")
    write_trailer_jpeg(out / "trailer-gps.jpg")
    write_large_jpeg(out / "large-clean.jpg")
    for name in ("clean-1.jpg", "clean-2.jpg", "gps.jpg", "xmp-gps.jpg", "text-chunk.png", "trailer-gps.jpg", "large-clean.jpg"):
        print(f"wrote {out / name} ({(out / name).stat().st_size} bytes)")
    print("not written: iphone.heic (needs a real iPhone; see the header of this script)")


if __name__ == "__main__":
    main()
