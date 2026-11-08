# idriveramb-gtfs-data

Datos públicos para la app **iDriverAMB** (conductores de los operadores de bus del AMB, excepto TMB).

Cada noche el proceso **Actualizar datos AMB** (`.github/workflows/actualizar-datos.yml`) descarga el GTFS de datos abiertos del AMB, lo procesa con `scripts/procesar.js` y deja en `datos/`:

- `companias.json`: compañías y sus líneas
- `recorridos.gtfsdata`: recorridos por línea, sentido y variante (con paradas en orden)
- `paradas.gtfsdata`: paradas con las líneas que pasan
- `meta.json`: fecha de generación y resumen

Fuente: AMB - Àrea Metropolitana de Barcelona (dades obertes).
