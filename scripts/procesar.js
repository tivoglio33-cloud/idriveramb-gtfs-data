// procesar.js — iDriverAMB
// Lee el GTFS del AMB (ya descomprimido en una carpeta) y genera los datos
// que usa la app: recorridos por linea y compania, paradas y un resumen.
//
// Uso: node scripts/procesar.js <carpeta_gtfs> <carpeta_salida>
//
// Sin dependencias externas: solo Node.js.

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GTFS_DIR = process.argv[2];
const OUT_DIR = process.argv[3];

if (!GTFS_DIR || !OUT_DIR) {
  console.error('Uso: node scripts/procesar.js <carpeta_gtfs> <carpeta_salida>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Lectura de CSV (con comillas, comas dentro de comillas, BOM y fin de linea CRLF)
// ---------------------------------------------------------------------------
function parseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Lee un archivo GTFS fila a fila y llama a onRow(objeto) por cada fila.
async function leerCSV(nombre, onRow, obligatorio = true) {
  const ruta = path.join(GTFS_DIR, nombre);
  if (!fs.existsSync(ruta)) {
    if (obligatorio) throw new Error('Falta el archivo ' + nombre + ' en el GTFS');
    console.log('  (no existe ' + nombre + ', se omite)');
    return 0;
  }
  const rl = readline.createInterface({ input: fs.createReadStream(ruta, 'utf8'), crlfDelay: Infinity });
  let cab = null;
  let n = 0;
  for await (let line of rl) {
    if (!cab) {
      line = line.replace(/^﻿/, '');
      cab = parseLine(line).map(s => s.trim());
      continue;
    }
    if (!line.trim()) continue;
    const v = parseLine(line);
    const o = {};
    for (let i = 0; i < cab.length; i++) o[cab[i]] = (v[i] || '').trim();
    onRow(o);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const r5 = x => Math.round(x * 1e5) / 1e5;

// Simplifica una polilinea (Douglas-Peucker) con tolerancia en metros aprox.
function simplificar(puntos, tolM = 3) {
  if (puntos.length < 3) return puntos;
  const lat0 = puntos[0][0] * Math.PI / 180;
  const mx = 111320 * Math.cos(lat0);
  const my = 110540;
  const xy = puntos.map(p => [p[1] * mx, p[0] * my]);
  const keep = new Uint8Array(puntos.length);
  keep[0] = 1; keep[puntos.length - 1] = 1;
  const pila = [[0, puntos.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx, qy = ay + t * dy;
      const d = Math.hypot(px - qx, py - qy);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolM && idx > 0) {
      keep[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return puntos.filter((_, i) => keep[i]);
}

function fechaMadrid() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }); // "2026-11-08 01:30:00"
}

// ---------------------------------------------------------------------------
// Proceso principal
// ---------------------------------------------------------------------------
async function main() {
  console.log('Procesando GTFS de ' + GTFS_DIR);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1) Companias
  const agencias = {};
  await leerCSV('agency.txt', a => {
    const id = a.agency_id || 'AMB';
    agencias[id] = { id, nombre: a.agency_name || id, url: a.agency_url || '' };
  });
  console.log('  companias: ' + Object.keys(agencias).length);

  // 2) Lineas
  const lineas = {};
  const unicaAgencia = Object.keys(agencias).length === 1 ? Object.keys(agencias)[0] : null;
  await leerCSV('routes.txt', r => {
    lineas[r.route_id] = {
      id: r.route_id,
      codi: r.route_short_name || r.route_id,
      nombre: r.route_long_name || '',
      color: r.route_color ? '#' + r.route_color : null,
      colorTexto: r.route_text_color ? '#' + r.route_text_color : null,
      operador: r.agency_id || unicaAgencia || 'AMB',
      tipo: r.route_type || '3',
    };
  });
  console.log('  lineas: ' + Object.keys(lineas).length);

  // 3) Viajes: agrupamos por linea + sentido + shape
  //    grupos["route|dir|shape"] = { viajes, headsigns{}, tripEjemplo }
  const grupos = {};
  const shapesUsados = new Set();
  let viajesSinShape = 0;
  await leerCSV('trips.txt', t => {
    if (!lineas[t.route_id]) return;
    const dir = t.direction_id === '1' ? '1' : '0';
    const shape = t.shape_id || '';
    if (!shape) viajesSinShape++;
    const k = t.route_id + '|' + dir + '|' + shape;
    let g = grupos[k];
    if (!g) {
      g = grupos[k] = { route: t.route_id, dir, shape, viajes: 0, headsigns: {}, tripEjemplo: t.trip_id };
    }
    g.viajes++;
    const h = t.trip_headsign || '';
    g.headsigns[h] = (g.headsigns[h] || 0) + 1;
    if (shape) shapesUsados.add(shape);
  });
  console.log('  grupos linea/sentido/recorrido: ' + Object.keys(grupos).length + (viajesSinShape ? ' (viajes sin shape: ' + viajesSinShape + ')' : ''));

  // 4) Trazados (solo los que se usan)
  const shapes = {};
  await leerCSV('shapes.txt', s => {
    if (!shapesUsados.has(s.shape_id)) return;
    (shapes[s.shape_id] = shapes[s.shape_id] || []).push([
      Number(s.shape_pt_sequence), Number(s.shape_pt_lat), Number(s.shape_pt_lon),
    ]);
  }, false);
  for (const id in shapes) {
    shapes[id] = shapes[id].sort((a, b) => a[0] - b[0]).map(p => [p[1], p[2]]);
  }
  console.log('  trazados: ' + Object.keys(shapes).length);

  // 5) Paradas
  const paradas = {};
  await leerCSV('stops.txt', s => {
    if (s.location_type && s.location_type !== '0') return;
    paradas[s.stop_id] = {
      id: s.stop_id,
      codi: s.stop_code || String(Number(s.stop_id)) || s.stop_id,
      nombre: s.stop_name,
      lat: r5(Number(s.stop_lat)),
      lon: r5(Number(s.stop_lon)),
      lineas: new Set(),
    };
  });
  console.log('  paradas: ' + Object.keys(paradas).length);

  // 6) Paradas en orden de cada grupo (usando un viaje de ejemplo por grupo)
  const tripAGrupo = {};
  for (const k in grupos) tripAGrupo[grupos[k].tripEjemplo] = k;
  const paradasGrupo = {};
  await leerCSV('stop_times.txt', st => {
    const k = tripAGrupo[st.trip_id];
    if (!k) return;
    (paradasGrupo[k] = paradasGrupo[k] || []).push([Number(st.stop_sequence), st.stop_id]);
  });

  // 7) Montar salida por linea
  const salidaLineas = {};
  for (const k in grupos) {
    const g = grupos[k];
    const L = lineas[g.route];
    const headsign = Object.entries(g.headsigns).sort((a, b) => b[1] - a[1])[0][0];
    const seq = (paradasGrupo[k] || []).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    let puntos = g.shape && shapes[g.shape] ? shapes[g.shape] : null;
    // Si no hay shape, unimos las paradas en orden (peor, pero algo se ve)
    if (!puntos) puntos = seq.map(id => paradas[id]).filter(Boolean).map(p => [p.lat, p.lon]);
    puntos = simplificar(puntos).map(p => [r5(p[0]), r5(p[1])]);
    for (const id of seq) if (paradas[id]) paradas[id].lineas.add(L.codi);

    const out = salidaLineas[g.route] = salidaLineas[g.route] || {
      codi: L.codi, nombre: L.nombre, color: L.color, colorTexto: L.colorTexto,
      operador: L.operador, sentidos: { '0': [], '1': [] },
    };
    out.sentidos[g.dir].push({ headsign, viajes: g.viajes, shape: g.shape || null, paradas: seq, puntos });
  }

  // Ordenar variantes: la que mas viajes tiene primero (la principal).
  // Se juntan las que tienen el mismo trazado fisico (mismos puntos).
  for (const id in salidaLineas) {
    for (const d of ['0', '1']) {
      const lista = salidaLineas[id].sentidos[d];
      const porForma = {};
      for (const v of lista) {
        const firma = JSON.stringify(v.puntos);
        if (porForma[firma]) porForma[firma].viajes += v.viajes;
        else porForma[firma] = v;
      }
      salidaLineas[id].sentidos[d] = Object.values(porForma).sort((a, b) => b.viajes - a.viajes);
    }
  }

  // 8) Companias con sus lineas
  const companias = {};
  for (const id in agencias) companias[id] = { ...agencias[id], lineas: [] };
  for (const id in salidaLineas) {
    const op = salidaLineas[id].operador;
    if (!companias[op]) companias[op] = { id: op, nombre: op, url: '', lineas: [] };
    companias[op].lineas.push(salidaLineas[id].codi);
  }
  const ordenCodi = (a, b) => a.localeCompare(b, 'es', { numeric: true });
  for (const id in companias) companias[id].lineas.sort(ordenCodi);
  // Fuera las companias sin lineas
  for (const id in companias) if (!companias[id].lineas.length) delete companias[id];

  // 9) Paradas: solo las que usa alguna linea
  const salidaParadas = [];
  for (const id in paradas) {
    const p = paradas[id];
    if (!p.lineas.size) continue;
    salidaParadas.push({ id: p.id, codi: p.codi, nombre: p.nombre, lat: p.lat, lon: p.lon, lineas: [...p.lineas].sort(ordenCodi) });
  }

  // 10) Fecha del propio GTFS (feed_info), si viene
  let feed = null;
  await leerCSV('feed_info.txt', f => { feed = { inicio: f.feed_start_date || null, fin: f.feed_end_date || null, version: f.feed_version || null }; }, false);

  // 11) Escribir
  const meta = {
    generado: fechaMadrid(),
    fuente: 'AMB - Àrea Metropolitana de Barcelona (GTFS de dades obertes)',
    gtfs: feed,
    companias: Object.keys(companias).length,
    lineas: Object.keys(salidaLineas).length,
    paradas: salidaParadas.length,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'companias.json'), JSON.stringify(Object.values(companias), null, 1));
  fs.writeFileSync(path.join(OUT_DIR, 'recorridos.gtfsdata'), JSON.stringify(salidaLineas));
  fs.writeFileSync(path.join(OUT_DIR, 'paradas.gtfsdata'), JSON.stringify(salidaParadas));
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 1));

  const kb = f => Math.round(fs.statSync(path.join(OUT_DIR, f)).size / 1024) + ' KB';
  console.log('');
  console.log('Hecho. Hora local de esta ejecucion: ' + meta.generado);
  console.log('  companias.json      ' + kb('companias.json'));
  console.log('  recorridos.gtfsdata ' + kb('recorridos.gtfsdata'));
  console.log('  paradas.gtfsdata    ' + kb('paradas.gtfsdata'));
  console.log('');
  for (const c of Object.values(companias)) console.log('  ' + c.nombre + ': ' + c.lineas.length + ' lineas (' + c.lineas.join(', ') + ')');
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
