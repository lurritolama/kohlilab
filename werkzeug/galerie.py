# -*- coding: utf-8 -*-
"""
Foto-Galerie fuer die Konfigurator-Seiten — ohne Deploy.

Manolo will laufend Fotos gedruckter Organizer zeigen ("es werden noch mehr
folgen"). Jedes Foto als Repo-Datei hiesse: Push + Netlify-Build pro Bild.
Stattdessen liegt die Galerie in der gemeinsamen Supabase und die Seite liest
sie serverseitig — ein Foto ist damit in Sekunden live, wie bei den
Ventilkappen-Sujets.

Anders als dort braucht es aber KEINE Tabelle: die sujets-Tabelle musste
Manolo damals von Hand im SQL-Editor anlegen (unsere Keys koennen kein DDL).
Hier reicht der Storage allein — ein oeffentlicher Bucket `galerie` mit einer
Manifest-Datei je Bereich:

    galerie/organizer/liste.json      [{datei, text, sort}, ...]  hoch = vorne
    galerie/organizer/<slug>.webp     die Bilder

Schreiben kann nur der Service-Key (anonyme Uploads weist die Storage-RLS ab,
im Sicherheitsaudit vom 11.08.2026 nachgemessen: 403).

Bilder werden beim Hochladen auf laengste Kante 1600 px verkleinert und als
WebP (Qualitaet 80) gespeichert — aus 3.4 MB Handyfoto werden ~150 KB, das
Original bleibt unangetastet liegen.

Gebrauch:
    python galerie.py add FOTO.jpg --text "Bildunterschrift" [--sort N] [--slug name]
    python galerie.py liste
    python galerie.py text SLUG "neue Bildunterschrift"
    python galerie.py sort SLUG N
    python galerie.py weg SLUG          # nimmt das Foto aus der Galerie
"""
import argparse, io, json, sys, urllib.request, urllib.error
from pathlib import Path

BEREICH = "organizer"          # spaeter z. B. auch "qr-schilder"
BUCKET = "galerie"
MAX_KANTE = 1600
WEBP_QUALITAET = 80

ENV_DATEIEN = [
    Path(__file__).resolve().parent.parent / ".env",
    Path(r"C:\Users\Allgemein\Projekte\creative-lab-munsby\.env"),
]


def _creds():
    werte = {}
    for f in ENV_DATEIEN:
        if not f.exists():
            continue
        for zeile in f.read_text(encoding="utf-8").splitlines():
            if "=" in zeile and not zeile.lstrip().startswith("#"):
                k, _, v = zeile.partition("=")
                werte.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    url = werte.get("SUPABASE_URL") or werte.get("PUBLIC_SUPABASE_URL")
    key = werte.get("SUPABASE_SERVICE_ROLE_KEY") or werte.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Supabase-Zugang fehlt (SUPABASE_URL + Service-Key in kohlilab/.env oder munsby/.env).")
    return url.rstrip("/"), key


URL, KEY = _creds()
KOPF = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
        # Ohne eigenen User-Agent haelt Supabase manche Clients fuer einen
        # Browser und lehnt den Service-Key ab (drive_sync-Befund).
        "User-Agent": "kohlilab-galerie"}


def _req(methode, pfad, daten=None, content_type=None, ok_fehlt=False, upsert=False):
    kopf = dict(KOPF)
    if content_type:
        kopf["Content-Type"] = content_type
    if upsert:
        # Ueberschreiben geht beim Storage NUR ueber diesen Header — ein
        # ?upsert=true in der URL wird ignoriert und POST liefert 409.
        kopf["x-upsert"] = "true"
    req = urllib.request.Request(f"{URL}{pfad}", daten, kopf, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if ok_fehlt and e.code in (400, 404):
            return None
        sys.exit(f"HTTP {e.code} bei {methode} {pfad}: {e.read().decode()[:300]}")


def bucket_sicherstellen():
    """Legt den public Bucket an, falls er fehlt. Idempotent."""
    info = _req("GET", f"/storage/v1/bucket/{BUCKET}", ok_fehlt=True)
    if info is None:
        _req("POST", "/storage/v1/bucket",
             json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode(),
             "application/json")
        print(f"Bucket '{BUCKET}' (public) angelegt.")
    else:
        assert json.loads(info).get("public"), f"Bucket '{BUCKET}' existiert, ist aber NICHT public!"


def manifest_laden():
    roh = _req("GET", f"/storage/v1/object/{BUCKET}/{BEREICH}/liste.json", ok_fehlt=True)
    return json.loads(roh) if roh else []


def manifest_schreiben(liste):
    liste.sort(key=lambda e: -e.get("sort", 0))
    _req("POST", f"/storage/v1/object/{BUCKET}/{BEREICH}/liste.json",
         json.dumps(liste, ensure_ascii=False, indent=1).encode("utf-8"),
         "application/json", upsert=True)


def verkleinern(pfad):
    from PIL import Image, ImageOps
    im = Image.open(pfad)
    im = ImageOps.exif_transpose(im)       # Handy-Drehung einrechnen
    im = im.convert("RGB")
    f = MAX_KANTE / max(im.size)
    if f < 1:
        im = im.resize((round(im.size[0] * f), round(im.size[1] * f)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=WEBP_QUALITAET)
    return buf.getvalue(), im.size


def cmd_add(a):
    quelle = Path(a.bild)
    if not quelle.exists():
        sys.exit(f"{quelle} gibt es nicht.")
    slug = (a.slug or quelle.stem).lower().replace(" ", "-")
    bucket_sicherstellen()
    daten, groesse = verkleinern(quelle)
    print(f"{quelle.name}: {quelle.stat().st_size/1e6:.1f} MB -> "
          f"{len(daten)/1e3:.0f} KB ({groesse[0]}x{groesse[1]})")
    _req("POST", f"/storage/v1/object/{BUCKET}/{BEREICH}/{slug}.webp",
         daten, "image/webp", upsert=True)
    liste = manifest_laden()
    liste = [e for e in liste if e["datei"] != f"{slug}.webp"]
    sort = a.sort if a.sort is not None else (max((e.get("sort", 0) for e in liste), default=0) + 1)
    liste.append({"datei": f"{slug}.webp", "text": a.text, "sort": sort})
    manifest_schreiben(liste)
    print(f"OK: '{slug}' ist live (sort {sort}) — {len(liste)} Foto(s) in der Galerie.")


def cmd_liste(_):
    liste = manifest_laden()
    if not liste:
        print("Galerie ist leer."); return
    for e in liste:
        print(f"  sort {e.get('sort',0):3d}  {e['datei']:28s}  {e.get('text','')}")


def _aendern(slug, fn):
    liste = manifest_laden()
    treffer = [e for e in liste if e["datei"] == f"{slug}.webp"]
    if not treffer:
        sys.exit(f"'{slug}' ist nicht in der Galerie. `python galerie.py liste` zeigt, was da ist.")
    fn(treffer[0], liste)
    manifest_schreiben(liste)


def cmd_text(a):
    _aendern(a.slug, lambda e, _l: e.update(text=a.text))
    print(f"OK: Text von '{a.slug}' geaendert.")


def cmd_sort(a):
    _aendern(a.slug, lambda e, _l: e.update(sort=a.n))
    print(f"OK: '{a.slug}' hat jetzt sort {a.n}.")


def cmd_weg(a):
    _aendern(a.slug, lambda e, l: l.remove(e))
    # Bild absichtlich liegen lassen — `add` mit demselben Slug reaktiviert es.
    print(f"OK: '{a.slug}' aus der Galerie genommen (Datei bleibt im Bucket).")


p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sub = p.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("add"); s.add_argument("bild"); s.add_argument("--text", required=True)
s.add_argument("--sort", type=int); s.add_argument("--slug"); s.set_defaults(fn=cmd_add)
s = sub.add_parser("liste"); s.set_defaults(fn=cmd_liste)
s = sub.add_parser("text"); s.add_argument("slug"); s.add_argument("text"); s.set_defaults(fn=cmd_text)
s = sub.add_parser("sort"); s.add_argument("slug"); s.add_argument("n", type=int); s.set_defaults(fn=cmd_sort)
s = sub.add_parser("weg"); s.add_argument("slug"); s.set_defaults(fn=cmd_weg)
a = p.parse_args()
a.fn(a)
