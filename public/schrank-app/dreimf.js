// 3MF-Hilfen für die Küchenschrank-App: Mesh-Prüfung und 3MF-XML.
// Kopie aus public/lithophane-app/mesh.js, damit der Küchenschrank ohne die
// (pausierte) Lithophane-App auskommt. Mesh-Format: { pos, idx, farbe, palette }.

function z3(v) { const s = v.toFixed(3); return s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, ''); }

export function volumen(mesh) {
  const p = mesh.pos, t = mesh.idx;
  let v = 0;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
        + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2])
        + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}

export function pruefe(mesh) {
  const t = mesh.idx, n = mesh.pos.length / 3;
  const m = new Map();
  const key = (a, b) => a * n + b;
  for (let k = 0; k < t.length; k += 3) {
    const e = [[t[k], t[k + 1]], [t[k + 1], t[k + 2]], [t[k + 2], t[k]]];
    for (const [a, b] of e) { const kk = key(a, b); m.set(kk, (m.get(kk) || 0) + 1); }
  }
  let offen = 0, doppelt = 0;
  for (const [kk, c] of m) {
    if (c > 1) doppelt++;
    const a = Math.floor(kk / n), b = kk % n;
    if (!m.has(key(b, a))) offen++;
  }
  return { geschlossen: offen === 0 && doppelt === 0, offen, doppelt, volumenMm3: volumen(mesh), dreiecke: t.length / 3 };
}

export function modelXml(koerper, app = 'KohliLab Lithophane') {
  const objekte = [], items = [];
  let ressourcen = '';
  let naechsteId = 1;
  koerper.forEach((k) => {
    const p = k.mesh.pos, t = k.mesh.idx, f = k.mesh.farbe, pal = k.mesh.palette;
    const v = new Array(p.length / 3), tr = new Array(t.length / 3);
    for (let i = 0; i < p.length; i += 3) v[i / 3] = `<vertex x="${z3(p[i])}" y="${z3(p[i + 1])}" z="${z3(p[i + 2])}"/>`;
    let pid = '';
    if (pal && f) {
      const cg = naechsteId++;
      ressourcen += `<m:colorgroup id="${cg}">${pal.map((h) => `<m:color color="${h.toUpperCase()}FF"/>`).join('')}</m:colorgroup>`;
      pid = ` pid="${cg}" pindex="0"`;
      for (let i = 0; i < t.length; i += 3) tr[i / 3] = `<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}" p1="${f[i / 3]}"/>`;
    } else {
      for (let i = 0; i < t.length; i += 3) tr[i / 3] = `<triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>`;
    }
    const id = naechsteId++;
    objekte.push(`<object id="${id}" name="${k.name}" type="model"${pid}><mesh><vertices>${v.join('')}</vertices><triangles>${tr.join('')}</triangles></mesh></object>`);
    items.push(`<item objectid="${id}"/>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><metadata name="Application">${app}</metadata><resources>${ressourcen}${objekte.join('')}</resources><build>${items.join('')}</build></model>`;
}

export const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
export const RELS = `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
