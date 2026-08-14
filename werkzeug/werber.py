# -*- coding: utf-8 -*-
"""
Werber-Verwaltung (Empfehlungs-Kuerzel) — ohne Deploy erweiterbar.

Manolos Freund (Kuerzel EGLI) macht Marketing; Kundschaft traegt sein Kuerzel
beim Checkout ein. Die Liste der Werber lebt wie die Galerie im Storage,
aber in einem PRIVATEN Bucket `intern` — sie enthaelt die Zugangsschluessel
fuer die Werber-Ansicht (kohlilab.ch/werber?k=...) und darf darum nie
oeffentlich lesbar sein. Lesen koennen sie nur die Server (Service-Key).

Provisionsmodell (Manolo 13.08.2026): Gewinn = gewinn_anteil vom Warenwert
(ohne Versand), Provision = satz vom Gewinn. Standard 10 % von 10 % — also
effektiv 1 % vom Warenwert. Beides steht in werber.json und ist ohne Deploy
aenderbar; gezaehlt und verguetet werden nur BEZAHLTE Bestellungen.

Gebrauch:
    python werber.py add EGLI --name "Egli"           # legt an, druckt den Link
    python werber.py liste
    python werber.py satz EGLI 0.15                   # 15 % vom Gewinn
    python werber.py token-neu EGLI                   # alter Link wird ungueltig
    python werber.py aus EGLI / an EGLI               # deaktivieren/aktivieren
"""
import argparse, datetime, json, secrets, sys, urllib.request, urllib.error
from pathlib import Path

BUCKET = "intern"                       # PRIVAT — enthaelt Zugangsschluessel
PFAD = "werber.json"
BASIS = "https://kohlilab.ch/werber"

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
        sys.exit("Supabase-Zugang fehlt (munsby/.env).")
    return url.rstrip("/"), key


URL, KEY = _creds()
KOPF = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "User-Agent": "kohlilab-werber"}


def _req(methode, pfad, daten=None, content_type=None, ok_fehlt=False, upsert=False):
    kopf = dict(KOPF)
    if content_type:
        kopf["Content-Type"] = content_type
    if upsert:
        kopf["x-upsert"] = "true"       # Storage-Upsert geht NUR ueber den Header
    req = urllib.request.Request(f"{URL}{pfad}", daten, kopf, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if ok_fehlt and e.code in (400, 404):
            return None
        sys.exit(f"HTTP {e.code} bei {methode} {pfad}: {e.read().decode()[:300]}")


def bucket_sicherstellen():
    info = _req("GET", f"/storage/v1/bucket/{BUCKET}", ok_fehlt=True)
    if info is None:
        _req("POST", "/storage/v1/bucket",
             json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode(),
             "application/json")
        print(f"Privater Bucket '{BUCKET}' angelegt.")
    else:
        # Sicherheitsnetz: wird der Bucket je versehentlich public geschaltet,
        # laegen die Zugangsschluessel offen.
        assert not json.loads(info).get("public"), \
            f"Bucket '{BUCKET}' ist PUBLIC — sofort auf privat stellen, er enthaelt Schluessel!"


def laden():
    roh = _req("GET", f"/storage/v1/object/{BUCKET}/{PFAD}", ok_fehlt=True)
    return json.loads(roh) if roh else {"gewinn_anteil": 0.10, "werber": []}


def speichern(d):
    _req("POST", f"/storage/v1/object/{BUCKET}/{PFAD}",
         json.dumps(d, ensure_ascii=False, indent=1).encode("utf-8"),
         "application/json", upsert=True)


def _finde(d, kuerzel):
    k = kuerzel.strip().upper()
    for w in d["werber"]:
        if w["kuerzel"] == k:
            return w
    sys.exit(f"'{k}' gibt es nicht. `python werber.py liste` zeigt alle.")


def cmd_add(a):
    bucket_sicherstellen()
    d = laden()
    k = a.kuerzel.strip().upper()
    if any(w["kuerzel"] == k for w in d["werber"]):
        sys.exit(f"'{k}' existiert schon.")
    token = f"{k}-{secrets.token_hex(12)}"
    d["werber"].append({
        "kuerzel": k, "name": a.name or k, "satz": a.satz,
        "token": token, "aktiv": True,
        "seit": datetime.date.today().isoformat(),
    })
    speichern(d)
    eff = a.satz * d["gewinn_anteil"] * 100
    print(f"OK: {k} angelegt — {a.satz*100:.0f} % vom Gewinn = {eff:.1f} % vom Warenwert.")
    print(f"Persoenlicher Link (nur an {a.name or k} geben):\n  {BASIS}?k={token}")


def cmd_liste(_):
    d = laden()
    print(f"Gewinn-Anteil: {d['gewinn_anteil']*100:.0f} % vom Warenwert\n")
    if not d["werber"]:
        print("Keine Werber angelegt."); return
    for w in d["werber"]:
        eff = w["satz"] * d["gewinn_anteil"] * 100
        print(f"  {w['kuerzel']:8s} {w.get('name',''):16s} "
              f"{w['satz']*100:3.0f} % v. Gewinn (= {eff:.1f} % v. Warenwert)  "
              f"{'aktiv' if w.get('aktiv') else 'AUS'}  seit {w.get('seit','?')}")
        print(f"           Link: {BASIS}?k={w['token']}")


def cmd_satz(a):
    d = laden(); w = _finde(d, a.kuerzel)
    w["satz"] = a.satz; speichern(d)
    print(f"OK: {w['kuerzel']} hat jetzt {a.satz*100:.0f} % vom Gewinn.")


def cmd_token_neu(a):
    d = laden(); w = _finde(d, a.kuerzel)
    w["token"] = f"{w['kuerzel']}-{secrets.token_hex(12)}"; speichern(d)
    print(f"OK: neuer Link fuer {w['kuerzel']} (der alte ist ungueltig):\n  {BASIS}?k={w['token']}")


def cmd_aus(a):
    d = laden(); w = _finde(d, a.kuerzel)
    w["aktiv"] = False; speichern(d)
    print(f"OK: {w['kuerzel']} deaktiviert — Link tot, alte Bestellungen behalten die Zuordnung.")


def cmd_an(a):
    d = laden(); w = _finde(d, a.kuerzel)
    w["aktiv"] = True; speichern(d)
    print(f"OK: {w['kuerzel']} ist wieder aktiv.")


p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sub = p.add_subparsers(dest="cmd", required=True)
s = sub.add_parser("add"); s.add_argument("kuerzel"); s.add_argument("--name")
s.add_argument("--satz", type=float, default=0.10); s.set_defaults(fn=cmd_add)
s = sub.add_parser("liste"); s.set_defaults(fn=cmd_liste)
s = sub.add_parser("satz"); s.add_argument("kuerzel"); s.add_argument("satz", type=float); s.set_defaults(fn=cmd_satz)
s = sub.add_parser("token-neu"); s.add_argument("kuerzel"); s.set_defaults(fn=cmd_token_neu)
s = sub.add_parser("aus"); s.add_argument("kuerzel"); s.set_defaults(fn=cmd_aus)
s = sub.add_parser("an"); s.add_argument("kuerzel"); s.set_defaults(fn=cmd_an)
a = p.parse_args()
a.fn(a)
