# Phone steps for the photo spike (M0-04, question 4)

What you are finding out: for each phone browser, does `DateTimeOriginal` survive in the file the browser hands the page, what type of file is
it (especially for an iPhone HEIC), and is the browser's own canvas re-encode free of EXIF? The page is `web/exif-probe.html`. It reads
the photo on the phone and uploads nothing. Claude has not run any of this on a phone: its reader is tested in Node against the fixtures
(`test/spike/exifProbe.test.ts`) and the page loads in desktop Chrome, nothing more.

## Set-up (once)

1. On the dev machine, in your own terminal: `npm run dev -- --host`. (Claude does not start the dev server.)
2. Find the address of the machine running Vite. The phone must be on the same network and able to reach port 5173. If a firewall or VLAN stops it, copy `web/exif-probe.html` to any machine the phone can reach and serve it with `python3 -m http.server`: the page is one file with no dependencies.
3. On the phone, open `http://<address>:5173/exif-probe.html`. The line under the title shows the browser's user agent.
4. Take two or three **new** photos with the phone's own camera app first, outdoors if you can (so location is on), plus pick one older photo
   that has a place on it.

## iPhone Safari

Run each step, then note what the cards say.

1. Settings, Camera, Formats: note whether it says **High Efficiency** (HEIC) or **Most Compatible** (JPEG). Run the whole list once for each setting, with a fresh photo each time.
2. Control 1 (`image/*`): tap, **Photo Library**, pick a fresh photo. Before you confirm, tap **Options** at the bottom of the picker and note whether **Location** is on. Run it again with Location on and off.
3. Control 2 (`image/jpeg`): pick the same photo.
4. Control 3 (`capture`): tap, **Take Photo**, take one.
5. Control 4 (`image/heic,image/heif,image/jpeg`): pick a photo that was shot in High Efficiency.
6. After each pick, read the card: **type**, **name** (does `.HEIC` become `.jpeg`?), **DateTimeOriginal**, **GPS in the delivered file**, and the **canvas re-encode** line.
7. Press **Build results**, copy the text box.

## Android Chrome

1. Control 1 (`image/*`): tap, choose **Photos** or **Files** (note which picker Android shows: the Photo Picker or the document picker) and pick a fresh photo.
2. Control 3 (`capture`): tap, take a photo with the camera.
3. Control 1 again with an **older** photo that has a place on it, if you have one.
4. If you have a HEIC or HEIF file on the phone (some Samsung or iPhone-shared photos), pick it with control 1 and control 4: the canvas line will probably say FAILED to decode, which is what we need to know.
5. Press **Build results**, copy the text box.

## What to paste back

Paste the **Build results** text for each phone, and answer these in your own words:

```
Phone and OS version:
Browser and version:
iPhone only: Camera format setting (High Efficiency / Most Compatible):
iPhone only: picker Options, Location on or off, for the runs above:
Android only: which picker appeared (Photo Picker / document picker):
Anything that looked odd (a photo that could not be picked, a page error, a long wait):

[paste Build results here]
```

## How Claude reads the results

- `DateTimeOriginal: NOT FOUND` on a fresh camera photo means the browser stripped or converted it, and the client cannot read the capture time from that control (`no_capture_time` would then be set on every catch from that phone).
- `GPS in delivered file: YES` is fine for the page but proves the server check matters: the file reaches the app with a location in it.
- `EXIF in output: YES` on the canvas line is the one that breaks Option B (every upload from that phone would be refused). If it appears, say so first.
- `canvas re-encode: FAILED` on a HEIC means that browser cannot convert HEIC on the client; the app would have to refuse HEIC there or ask for a JPEG.
