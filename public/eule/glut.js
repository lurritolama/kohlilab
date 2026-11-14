/* Hintergrund-Thread für eule.js (kohlilab.ch, 14.11.2026): bereitet die Glut-Tafeln auf, ohne die Seite zu bremsen.
 * Die Glut kommt als gewöhnliches Bild auf Schwarz (20-mal kleiner als mit Transparenz). Hier wird Schwarz durchsichtig,
 * Deckkraft = Helligkeit, und das Ergebnis geht als ImageBitmap (ohne Kopie) zurück an die Seite.
 * Lädt nur von der eigenen Domain (CSP: worker-src fällt auf script-src 'self' zurück, fetch auf connect-src 'self').
 */
self.onmessage = function (e) {
  var id = e.data.id, url = e.data.url;
  fetch(url, { priority: 'low' }).then(function (r) {
    if (!r.ok) throw new Error('Bild fehlt: ' + url);
    return r.blob();
  }).then(function (b) {
    return createImageBitmap(b);
  }).then(function (bm) {
    var c = new OffscreenCanvas(bm.width, bm.height);
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bm, 0, 0);
    if (bm.close) bm.close();
    var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (var i = 0; i < p.length; i += 4) {
      var a = Math.max(p[i], p[i + 1], p[i + 2]);
      if (a < 6) { p[i + 3] = 0; continue; }
      var f = 255 / a;
      p[i] *= f; p[i + 1] *= f; p[i + 2] *= f; p[i + 3] = a;
    }
    x.putImageData(d, 0, 0);
    var aus = c.transferToImageBitmap();
    self.postMessage({ id: id, bild: aus }, [aus]);
  }).catch(function (f) {
    self.postMessage({ id: id, fehler: String((f && f.message) || f) });
  });
};
