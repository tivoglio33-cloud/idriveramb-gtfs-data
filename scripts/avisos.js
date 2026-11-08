// avisos.js — iDriverAMB (08/11/2026)
// Lee alerts.bin (avisos en vivo del AMB: desvíos, huelgas, paradas
// anuladas...) y deja datos/avisos.json limpio para la app:
//   [{ id, efecto, periodos: [[ini, fin]], lineas: ["B24"...], paradas: ["000119"...],
//      titulo: { ca, es }, texto: { ca, es } }]
// Solo los avisos que siguen vigentes o empiezan más adelante.
//
// Uso: node scripts/avisos.js <alerts.bin> <carpeta datos>

'use strict';
const fs = require('fs');
const path = require('path');
const G = require('gtfs-realtime-bindings').transit_realtime;

const [archivo, carpeta] = process.argv.slice(2);
const rec = JSON.parse(fs.readFileSync(path.join(carpeta, 'recorridos.gtfsdata'), 'utf8'));

// Entidades HTML que trae el AMB en los textos (&agrave;, &nbsp;, &#39;...)
const ENT = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  middot: '·', ndash: '–', mdash: '—', hellip: '…', euro: '€', iexcl: '¡', iquest: '¿', laquo: '«', raquo: '»',
  agrave: 'à', aacute: 'á', egrave: 'è', eacute: 'é', igrave: 'ì', iacute: 'í', ograve: 'ò', oacute: 'ó',
  ugrave: 'ù', uacute: 'ú', iuml: 'ï', uuml: 'ü', ccedil: 'ç', ntilde: 'ñ', ordf: 'ª', ordm: 'º',
  Agrave: 'À', Aacute: 'Á', Egrave: 'È', Eacute: 'É', Iacute: 'Í', Ograve: 'Ò', Oacute: 'Ó', Uacute: 'Ú',
  Ccedil: 'Ç', Ntilde: 'Ñ', Iuml: 'Ï', Uuml: 'Ü',
};
function limpiar(t) {
  return String(t || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m)
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function traducciones(ts) {
  const out = {};
  for (const x of (ts && ts.translation) || []) {
    const lang = String(x.language || '').toLowerCase().slice(0, 2) || 'ca';
    out[lang] = limpiar(x.text);
  }
  if (!out.ca && out.es) out.ca = out.es;
  if (!out.es && out.ca) out.es = out.ca;
  return out;
}

const feed = G.FeedMessage.toObject(G.FeedMessage.decode(fs.readFileSync(archivo)), { longs: Number, enums: String });
const ahora = Math.floor(Date.now() / 1000);
const avisos = [];
for (const e of feed.entity || []) {
  const a = e.alert;
  if (!a) continue;
  const periodos = (a.activePeriod || []).map((p) => [Number(p.start || 0), Number(p.end || 0)]);
  // Fuera los que ya han terminado (fin conocido y pasado)
  if (periodos.length && periodos.every(([, fin]) => fin && fin < ahora)) continue;
  const lineas = new Set(), paradas = new Set();
  for (const i of a.informedEntity || []) {
    if (i.routeId && rec[i.routeId]) lineas.add(String(rec[i.routeId].codi).toUpperCase());
    if (i.stopId) paradas.add(String(i.stopId));
  }
  avisos.push({
    id: String(e.id),
    efecto: a.effect || null,
    periodos,
    lineas: [...lineas].sort((x, y) => x.localeCompare(y, 'es', { numeric: true })),
    paradas: [...paradas],
    titulo: traducciones(a.headerText),
    texto: traducciones(a.descriptionText),
  });
}
avisos.sort((x, y) => (x.periodos[0]?.[0] || 0) - (y.periodos[0]?.[0] || 0));
fs.writeFileSync(path.join(carpeta, 'avisos.json'), JSON.stringify(avisos));
console.log('Avisos vigentes o futuros: ' + avisos.length + ' (de ' + (feed.entity || []).length + ' en el archivo)');
for (const v of avisos.slice(0, 5)) console.log('  ' + (v.titulo.es || v.titulo.ca) + ' — líneas: ' + v.lineas.join(', '));
