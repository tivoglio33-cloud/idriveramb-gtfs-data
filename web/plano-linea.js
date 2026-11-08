// GENERADO a partir de src/utils/planoLinea.ts (no tocar a mano).
// Para regenerarlo: node scripts/generar-plano-js.js
// ------------------------------------------------------------------
// PLANO DE LA LÍNEA EN PDF (31/10/2026). Web; la app lo pide a public/plano.html
//
// Lo pidió Alberto: compañeros que no se saben una línea le piden el
// recorrido, y un pantallazo no sirve porque no se leen las calles.
// Con el botón 🗺️ del mapa se hace un PDF de UNA sola página, muy
// grande, con toda la línea sobre el mapa de calles (ida y vuelta en sus
// colores, paradas con su nombre) y la cabecera con el logo de iDriverAMB.
// Al abrirlo en el móvil se amplía con los dedos y se leen las calles.
//
// Cómo se hace (sin librerías de fuera):
//   1. Se calcula el recuadro de la línea a zoom 15 (calles con nombre).
//   2. Se crea un mapa escondido de 1024x1024 y se va moviendo por
//      trozos ("baldosas"); cada trozo se saca como foto JPEG.
//      (Una sola foto gigante no cabe en la memoria de un iPhone.)
//   3. Las baldosas se pegan una al lado de la otra en la misma página
//      del PDF. Si la línea es muy larga se baja un poco el zoom para no
//      pasar de MAX_BALDOSAS.
// Cada baldosa se dibuja con un margen de más alrededor (MARGEN_BALDOSA)
// que luego se recorta: así los nombres de calle del borde no salen
// cortados a medias entre dos baldosas.
// ------------------------------------------------------------------
export const ZOOM_PLANO = 15;
const LADO_BALDOSA = 1024; // px de pantalla por baldosa
const MARGEN_BALDOSA = 160; // px dibujados de más alrededor y recortados
const RESOLUCION = 2; // nitidez (2 = como pantalla de móvil)
const MAX_BALDOSAS = 36;
const MARGEN_LINEA_PX = 140; // aire alrededor del recorrido
const CABECERA_PT = 120;
export const TEXTOS_PLANO = {
    ca: {
        boton: 'Plànol',
        preparando: 'Preparant el plànol de la línia…',
        trozo: 'Tros {n} de {total}',
        listo: 'Plànol llest',
        listoTexto: "PDF de tota la línia amb els carrers. Obre'l i amplia amb els dits.",
        compartir: 'Compartir',
        descargar: 'Descarregar',
        cerrar: 'Tancar',
        error: "No s'ha pogut fer el plànol. Comprova la connexió i torna-ho a provar.",
        sinLinea: 'Tria primer una línia.',
        linea: 'Línia',
        ida: 'Anada',
        vuelta: 'Tornada',
    },
    es: {
        boton: 'Plano',
        preparando: 'Preparando el plano de la línea…',
        trozo: 'Trozo {n} de {total}',
        listo: 'Plano listo',
        listoTexto: 'PDF de toda la línea con las calles. Ábrelo y amplía con los dedos.',
        compartir: 'Compartir',
        descargar: 'Descargar',
        cerrar: 'Cerrar',
        error: 'No se ha podido hacer el plano. Comprueba la conexión y vuelve a probar.',
        sinLinea: 'Elige primero una línea.',
        linea: 'Línea',
        ida: 'Ida',
        vuelta: 'Vuelta',
    },
};
// ------------------------------------------------------------------
// Cuentas del mapa (Web Mercator, baldosas de 512 como MapLibre)
// ------------------------------------------------------------------
export function aPixel(lng, lat, zoom) {
    const tam = 512 * Math.pow(2, zoom);
    const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
    return [((lng + 180) / 360) * tam, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * tam];
}
export function aLngLat(x, y, zoom) {
    const tam = 512 * Math.pow(2, zoom);
    const lng = (x / tam) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / tam;
    return [lng, (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
}
// Elige zoom y reparte el recorrido en baldosas.
export function repartirBaldosas(puntos) {
    const buenos = puntos.filter((p) => isFinite(p === null || p === void 0 ? void 0 : p[0]) && isFinite(p === null || p === void 0 ? void 0 : p[1]));
    if (buenos.length < 2)
        return null;
    for (let zoom = ZOOM_PLANO; zoom >= 11; zoom -= 0.5) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [lng, lat] of buenos) {
            const [x, y] = aPixel(lng, lat, zoom);
            if (x < minX)
                minX = x;
            if (x > maxX)
                maxX = x;
            if (y < minY)
                minY = y;
            if (y > maxY)
                maxY = y;
        }
        const ancho = maxX - minX + 2 * MARGEN_LINEA_PX;
        const alto = maxY - minY + 2 * MARGEN_LINEA_PX;
        const columnas = Math.max(1, Math.ceil(ancho / LADO_BALDOSA));
        const filas = Math.max(1, Math.ceil(alto / LADO_BALDOSA));
        if (columnas * filas <= MAX_BALDOSAS || zoom <= 11) {
            // Centrado: lo que sobra de la última baldosa se reparte a los lados.
            const x0 = (minX + maxX) / 2 - (columnas * LADO_BALDOSA) / 2;
            const y0 = (minY + maxY) / 2 - (filas * LADO_BALDOSA) / 2;
            return { zoom, x0, y0, columnas, filas };
        }
    }
    return null;
}
function colorPdf(hex) {
    const h = hex.replace('#', '');
    const n = (i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3);
    return `${n(0)} ${n(2)} ${n(4)}`;
}
// Texto en WinAnsi (vale para catalán y castellano). Lo que no cabe se cambia.
function textoPdf(t) {
    let s = '';
    // Signos que no están en latin-1 pero sí en WinAnsi (p. ej. el guion largo
    // de "Casa Batlló – Museu Tàpies").
    const WIN = { '€': 0x80, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '…': 0x85 };
    for (const ch of t.replace(/→/g, '>')) {
        const c = ch.charCodeAt(0);
        if (ch === '(' || ch === ')' || ch === '\\')
            s += '\\' + ch;
        else if (WIN[ch])
            s += '\\' + WIN[ch].toString(8).padStart(3, '0');
        else if (c >= 32 && c <= 126)
            s += ch;
        else if (c >= 160 && c <= 255)
            s += '\\' + c.toString(8).padStart(3, '0');
        else
            s += '?';
    }
    return s;
}
// Ancho aproximado de un texto en Helvetica (para alinear a la derecha).
export function anchoTexto(t, tam, negrita = false) {
    let u = 0;
    for (const ch of t) {
        if ('il.,:;|!\'·'.includes(ch))
            u += 0.28;
        else if ('fjtrI() '.includes(ch))
            u += 0.33;
        else if ('mwMW'.includes(ch))
            u += 0.85;
        else if (ch >= 'A' && ch <= 'Z')
            u += 0.68;
        else
            u += 0.56;
    }
    return u * tam * (negrita ? 1.06 : 1);
}
export function crearPdf(anchoPt, altoPt, rects, imagenes, textos) {
    const trozos = [];
    let largo = 0;
    const offsets = [];
    const poner = (d) => {
        const b = typeof d === 'string' ? latin1(d) : d;
        trozos.push(b);
        largo += b.length;
    };
    // Los textos del contenido ya vienen escapados a ASCII.
    function latin1(s) {
        const b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++)
            b[i] = s.charCodeAt(i) & 0xff;
        return b;
    }
    const nImg = imagenes.length;
    // Números de objeto: 1 catálogo, 2 páginas, 3 página, 4 contenido,
    // 5 Helvetica, 6 Helvetica-Bold, 7.. imágenes.
    const primeraImg = 7;
    let contenido = '';
    for (const r of rects) {
        contenido += `${colorPdf(r.color)} rg ${r.x.toFixed(2)} ${(altoPt - r.y - r.h).toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)} re f\n`;
    }
    imagenes.forEach((im, i) => {
        contenido += `q ${im.w.toFixed(3)} 0 0 ${im.h.toFixed(3)} ${im.x.toFixed(3)} ${(altoPt - im.y - im.h).toFixed(3)} cm /Im${i} Do Q\n`;
    });
    for (const t of textos) {
        contenido += `BT /${t.negrita ? 'F2' : 'F1'} ${t.tam} Tf ${colorPdf(t.color)} rg ${t.x.toFixed(2)} ${(altoPt - t.y).toFixed(2)} Td (${textoPdf(t.texto)}) Tj ET\n`;
    }
    poner('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const obj = (n, cuerpo) => { offsets[n] = largo; poner(`${n} 0 obj\n${cuerpo}\nendobj\n`); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    const xobjs = imagenes.map((_, i) => `/Im${i} ${primeraImg + i} 0 R`).join(' ');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${anchoPt.toFixed(2)} ${altoPt.toFixed(2)}] ` +
        `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << ${xobjs} >> >> /Contents 4 0 R >>`);
    obj(4, `<< /Length ${contenido.length} >>\nstream\n${contenido}endstream`);
    obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    imagenes.forEach((im, i) => {
        const n = primeraImg + i;
        offsets[n] = largo;
        poner(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.anchoPx} /Height ${im.altoPx} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`);
        poner(im.jpeg);
        poner('\nendstream\nendobj\n');
    });
    const total = primeraImg + nImg;
    const inicioXref = largo;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++)
        xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    poner(xref);
    poner(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
    const salida = new Uint8Array(largo);
    let p = 0;
    for (const t of trozos) {
        salida.set(t, p);
        p += t.length;
    }
    return salida;
}
// ------------------------------------------------------------------
// Cabecera y montaje de la página
// ------------------------------------------------------------------
export function montarPagina(d, reparto, baldosas, logo, fecha) {
    const tx = TEXTOS_PLANO[d.idioma];
    const anchoMapa = reparto.columnas * LADO_BALDOSA;
    const altoMapa = reparto.filas * LADO_BALDOSA;
    // 1 px de pantalla = 1 pt, salvo que no quepa (el PDF admite 14400 pt).
    const esc = Math.min(1, 14000 / anchoMapa, (14000 - CABECERA_PT) / altoMapa);
    const anchoPt = Math.max(anchoMapa * esc, 900);
    const mapaX = (anchoPt - anchoMapa * esc) / 2;
    const altoPt = CABECERA_PT + altoMapa * esc;
    const rects = [
        { x: 0, y: 0, w: anchoPt, h: CABECERA_PT, color: '#121212' },
        { x: 0, y: CABECERA_PT, w: anchoPt, h: altoPt - CABECERA_PT, color: '#f2f2f2' },
    ];
    const imagenes = [];
    const textos = [];
    let x = 24;
    if (logo) {
        const h = CABECERA_PT - 20;
        const w = (logo.anchoPx / logo.altoPx) * h;
        imagenes.push({ ...logo, x, y: 10, w, h });
        x += w + 28;
    }
    textos.push({ texto: `${tx.linea} ${d.linea}`, x, y: 46, tam: 34, color: '#ffffff', negrita: true });
    const primera = (l) => { var _a, _b; return (_b = (_a = l[0]) === null || _a === void 0 ? void 0 : _a.nom) !== null && _b !== void 0 ? _b : ''; };
    const ultima = (l) => { var _a, _b; return (_b = (_a = l[l.length - 1]) === null || _a === void 0 ? void 0 : _a.nom) !== null && _b !== void 0 ? _b : ''; };
    const filas = [];
    if (d.tramosIda.length)
        filas.push([tx.ida, d.idaColor, d.paradasIda]);
    if (d.tramosVuelta.length)
        filas.push([tx.vuelta, d.vueltaColor, d.paradasVuelta]);
    filas.forEach(([nombre, color, paradas], i) => {
        const y = 76 + i * 24;
        rects.push({ x, y: y - 10, w: 30, h: 7, color });
        const recorrido = paradas.length ? `: ${primera(paradas)} > ${ultima(paradas)}` : '';
        textos.push({ texto: `${nombre}${recorrido}`, x: x + 40, y, tam: 15, color: '#e0e0e0' });
    });
    const derecha = [
        { texto: fecha, tam: 13, color: '#bdbdbd', y: 40 },
        { texto: '© OpenStreetMap · OpenFreeMap', tam: 10, color: '#8a8a8a', y: 100 },
    ];
    for (const r of derecha) {
        textos.push({ ...r, x: anchoPt - 24 - anchoTexto(r.texto, r.tam) });
    }
    const ladoPt = LADO_BALDOSA * esc;
    for (const b of baldosas) {
        imagenes.push({
            jpeg: b.jpeg, anchoPx: b.anchoPx, altoPx: b.altoPx,
            x: mapaX + b.col * ladoPt, y: CABECERA_PT + b.fila * ladoPt, w: ladoPt, h: ladoPt,
        });
    }
    return crearPdf(anchoPt, altoPt, rects, imagenes, textos);
}
// ------------------------------------------------------------------
// Parte del navegador: el mapa escondido que hace las fotos
// ------------------------------------------------------------------
function base64ABytes(dataUrl) {
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}
async function cargarLogo() {
    try {
        const img = new Image();
        img.src = 'logo-plano.png'; // relativa: sirve en la web de la app y en la página del plano
        await new Promise((ok, mal) => { img.onload = ok; img.onerror = mal; });
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const g = cv.getContext('2d');
        g.fillStyle = '#121212';
        g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(img, 0, 0);
        return { jpeg: base64ABytes(cv.toDataURL('image/jpeg', 0.92)), anchoPx: cv.width, altoPx: cv.height };
    }
    catch (e) {
        return null;
    }
}
// Busca en el estilo del mapa qué letra usa para los nombres (para poner
// los nombres de las paradas con la misma).
function fuenteDelEstilo(estilo) {
    var _a, _b;
    if (!estilo || typeof estilo !== 'object' || !estilo.glyphs)
        return null;
    let cualquiera = null;
    for (const capa of (_a = estilo.layers) !== null && _a !== void 0 ? _a : []) {
        const f = (_b = capa === null || capa === void 0 ? void 0 : capa.layout) === null || _b === void 0 ? void 0 : _b['text-font'];
        if (Array.isArray(f) && f.every((x) => typeof x === 'string')) {
            if (f.some((x) => /bold/i.test(x)))
                return f;
            cualquiera = cualquiera !== null && cualquiera !== void 0 ? cualquiera : f;
        }
    }
    return cualquiera;
}
function geoLineas(tramos) {
    return { type: 'FeatureCollection', features: tramos.map((t) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: t } })) };
}
function geoParadas(lista, sentido) {
    return {
        type: 'FeatureCollection',
        features: lista.map((p) => ({ type: 'Feature', properties: { nom: p.nom, s: sentido }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
    };
}
function esperarIdle(mapa, ms = 25000) {
    return new Promise((ok) => {
        let hecho = false;
        const fin = () => { if (!hecho) {
            hecho = true;
            clearTimeout(t);
            ok();
        } };
        const t = setTimeout(fin, ms);
        mapa.once('idle', fin);
        try {
            mapa.triggerRepaint();
        }
        catch (e) { /* nada */ }
    });
}
export async function generarPlano(ml, estilo, d, alProgreso) {
    var _a, _b;
    const todos = [...d.tramosIda.flat(), ...d.tramosVuelta.flat(),
        ...d.paradasIda.map((p) => [p.lng, p.lat]), ...d.paradasVuelta.map((p) => [p.lng, p.lat])];
    const reparto = repartirBaldosas(todos);
    if (!reparto)
        throw new Error('Sin recorrido');
    const total = reparto.columnas * reparto.filas;
    alProgreso(0, total);
    const ladoDibujo = LADO_BALDOSA + 2 * MARGEN_BALDOSA;
    const caja = document.createElement('div');
    caja.style.cssText = `position:fixed;left:-${ladoDibujo + 4000}px;top:0;width:${ladoDibujo}px;height:${ladoDibujo}px;pointer-events:none;`;
    document.body.appendChild(caja);
    const centro0 = aLngLat(reparto.x0 + LADO_BALDOSA / 2, reparto.y0 + LADO_BALDOSA / 2, reparto.zoom);
    const mapa = new ml.Map({
        container: caja,
        style: typeof estilo === 'string' ? estilo : JSON.parse(JSON.stringify(estilo)),
        center: centro0,
        zoom: reparto.zoom,
        interactive: false,
        attributionControl: false,
        preserveDrawingBuffer: true,
        pixelRatio: RESOLUCION,
        fadeDuration: 0,
    });
    try {
        await new Promise((ok, mal) => {
            const t = setTimeout(() => mal(new Error('El mapa no carga')), 30000);
            mapa.once('load', () => { clearTimeout(t); ok(); });
        });
        // Recorrido: vuelta debajo, ida encima, cada una un poco a su derecha.
        const grosor = 6;
        mapa.addSource('pl-vuelta', { type: 'geojson', data: geoLineas(d.tramosVuelta) });
        mapa.addSource('pl-ida', { type: 'geojson', data: geoLineas(d.tramosIda) });
        for (const [id, color] of [['pl-vuelta', d.vueltaColor], ['pl-ida', d.idaColor]]) {
            mapa.addLayer({
                id, type: 'line', source: id,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': color, 'line-width': grosor, 'line-opacity': 0.85, 'line-offset': grosor / 2 + 1 },
            });
        }
        // Paradas: círculo blanco con borde del color de su sentido.
        const paradas = {
            type: 'FeatureCollection',
            features: [...geoParadas(d.paradasVuelta, 'v').features, ...geoParadas(d.paradasIda, 'i').features],
        };
        mapa.addSource('pl-paradas', { type: 'geojson', data: paradas });
        mapa.addLayer({
            id: 'pl-paradas', type: 'circle', source: 'pl-paradas',
            paint: {
                'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-width': 3,
                'circle-stroke-color': ['case', ['==', ['get', 's'], 'i'], d.idaColor, d.vueltaColor],
            },
        });
        const fuente = fuenteDelEstilo((_b = (_a = mapa.getStyle) === null || _a === void 0 ? void 0 : _a.call(mapa)) !== null && _b !== void 0 ? _b : estilo);
        if (fuente) {
            mapa.addLayer({
                id: 'pl-nombres', type: 'symbol', source: 'pl-paradas',
                layout: {
                    'text-field': ['get', 'nom'], 'text-font': fuente, 'text-size': 13,
                    'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.9,
                    'text-justify': 'auto', 'text-max-width': 12, 'text-padding': 1,
                },
                paint: {
                    'text-color': ['case', ['==', ['get', 's'], 'i'], d.idaColor, d.vueltaColor],
                    'text-halo-color': '#ffffff', 'text-halo-width': 2,
                },
            });
        }
        const lienzo = mapa.getCanvas();
        const recorte = document.createElement('canvas');
        const ladoSalida = LADO_BALDOSA * RESOLUCION;
        recorte.width = ladoSalida;
        recorte.height = ladoSalida;
        const g = recorte.getContext('2d');
        const baldosas = [];
        let hechas = 0;
        for (let fila = 0; fila < reparto.filas; fila++) {
            for (let col = 0; col < reparto.columnas; col++) {
                const cx = reparto.x0 + col * LADO_BALDOSA + LADO_BALDOSA / 2;
                const cy = reparto.y0 + fila * LADO_BALDOSA + LADO_BALDOSA / 2;
                mapa.jumpTo({ center: aLngLat(cx, cy, reparto.zoom), zoom: reparto.zoom, bearing: 0, pitch: 0 });
                await esperarIdle(mapa);
                // El lienzo puede ser algo distinto de lo pedido (límites del móvil):
                // se recorta el centro en proporción.
                const f = lienzo.width / ladoDibujo;
                g.fillStyle = '#f2f2f2';
                g.fillRect(0, 0, ladoSalida, ladoSalida);
                g.drawImage(lienzo, MARGEN_BALDOSA * f, MARGEN_BALDOSA * f, LADO_BALDOSA * f, LADO_BALDOSA * f, 0, 0, ladoSalida, ladoSalida);
                baldosas.push({ jpeg: base64ABytes(recorte.toDataURL('image/jpeg', 0.85)), anchoPx: ladoSalida, altoPx: ladoSalida, col, fila });
                hechas++;
                alProgreso(hechas, total);
            }
        }
        const logo = await cargarLogo();
        const hoy = new Date();
        const fecha = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
        const bytes = montarPagina(d, reparto, baldosas, logo, fecha);
        return new Blob([bytes], { type: 'application/pdf' });
    }
    finally {
        try {
            mapa.remove();
        }
        catch (e) { /* nada */ }
        try {
            caja.remove();
        }
        catch (e) { /* nada */ }
    }
}
export function nombreArchivoPlano(linea) {
    return `plano-linea-${String(linea).replace(/[^A-Za-z0-9]+/g, '') || 'bus'}.pdf`;
}
// ------------------------------------------------------------------
// LA APP DEL MÓVIL (31/10/2026, 1.0.10)
// El mapa del móvil no puede sacar fotos tan grandes. La app empaqueta la
// línea tal como se ve (recorrido, paradas, colores) en el enlace y abre
// /plano.html de la web en el navegador, que hace el PDF con este mismo
// código (public/plano-linea.js es este archivo pasado a JavaScript).
// El paquete va detrás de "#": no sale del móvil, no llega a ningún servidor.
// Los trazados se simplifican (puntos a menos de ~3 m de la línea fuera) y
// se escriben comprimidos (formato "polyline" de Google) para que quepan.
// ------------------------------------------------------------------
function simplificar(pts, tol = 0.00003) {
    if (pts.length < 3)
        return pts;
    const guardar = new Uint8Array(pts.length);
    guardar[0] = 1;
    guardar[pts.length - 1] = 1;
    const pila = [[0, pts.length - 1]];
    while (pila.length) {
        const [a, b] = pila.pop();
        const [x1, y1] = pts[a], [x2, y2] = pts[b];
        const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
        let peor = -1, dMax = 0;
        for (let i = a + 1; i < b; i++) {
            const [x, y] = pts[i];
            let t = l2 ? ((x - x1) * dx + (y - y1) * dy) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            const ex = x1 + t * dx - x, ey = y1 + t * dy - y;
            const d = ex * ex + ey * ey;
            if (d > dMax) {
                dMax = d;
                peor = i;
            }
        }
        if (peor > 0 && dMax > tol * tol) {
            guardar[peor] = 1;
            pila.push([a, peor], [peor, b]);
        }
    }
    return pts.filter((_, i) => guardar[i]);
}
function codificarTramo(pts) {
    let s = '', pLat = 0, pLng = 0;
    const num = (v) => {
        let n = v < 0 ? ~(v << 1) : v << 1;
        while (n >= 0x20) {
            s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
            n >>= 5;
        }
        s += String.fromCharCode(n + 63);
    };
    for (const [lng, lat] of pts) {
        const la = Math.round(lat * 1e5), ln = Math.round(lng * 1e5);
        num(la - pLat);
        num(ln - pLng);
        pLat = la;
        pLng = ln;
    }
    return s;
}
function decodificarTramo(s) {
    const out = [];
    let i = 0, lat = 0, lng = 0;
    const num = () => {
        let r = 0, sh = 0, b;
        do {
            b = s.charCodeAt(i++) - 63;
            r |= (b & 0x1f) << sh;
            sh += 5;
        } while (b >= 0x20);
        return r & 1 ? ~(r >> 1) : r >> 1;
    };
    while (i < s.length) {
        lat += num();
        lng += num();
        out.push([lng / 1e5, lat / 1e5]);
    }
    return out;
}
export function empaquetarPlano(d) {
    const p = (l) => l.map((x) => [Math.round(x.lng * 1e5), Math.round(x.lat * 1e5), x.nom]);
    return encodeURIComponent(JSON.stringify({
        v: 1, l: d.linea, i: d.idioma, ci: d.idaColor, cv: d.vueltaColor,
        ti: d.tramosIda.map((t) => codificarTramo(simplificar(t))),
        tv: d.tramosVuelta.map((t) => codificarTramo(simplificar(t))),
        pi: p(d.paradasIda), pv: p(d.paradasVuelta),
    }));
}
export function desempaquetarPlano(texto) {
    var _a, _b, _c;
    try {
        const o = JSON.parse(decodeURIComponent(texto));
        const p = (l) => (Array.isArray(l) ? l : []).map((x) => { var _a; return ({ lng: x[0] / 1e5, lat: x[1] / 1e5, nom: String((_a = x[2]) !== null && _a !== void 0 ? _a : '') }); });
        return {
            linea: String((_a = o.l) !== null && _a !== void 0 ? _a : ''), idioma: o.i === 'es' ? 'es' : 'ca',
            idaColor: String(o.ci || '#d32f2f'), vueltaColor: String(o.cv || '#1976d2'),
            tramosIda: ((_b = o.ti) !== null && _b !== void 0 ? _b : []).map(decodificarTramo), tramosVuelta: ((_c = o.tv) !== null && _c !== void 0 ? _c : []).map(decodificarTramo),
            paradasIda: p(o.pi), paradasVuelta: p(o.pv),
        };
    }
    catch (e) {
        return null;
    }
}
