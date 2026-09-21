# Hallazgos Cordillera · Demo Nava

Demo comercial estática para mostrar captura, seguimiento y reportería de hallazgos técnicos del tranque ficticio Cordillera.

## Alcance

- Dashboard con KPIs, severidad, muros, tendencia, responsables y foco gerencial.
- Listado con filtros combinables, detalle expandible y exportación CSV UTF-8 BOM con separador `;`.
- Captura manual con ID sugerido, estado derivado del progreso y persistencia local.
- Detección con IA simulada: no procesa el archivo cargado y muestra siempre el aviso de demostración.
- Selector de rol, modo oscuro y responsive desde 400 px.

## Stack

HTML, CSS y JavaScript vanilla. No requiere Firebase, autenticación, backend ni dependencias de npm. El dataset se carga desde `data/hallazgos.json`.

## Ejecutar localmente

Desde esta carpeta:

```bash
python3 -m http.server 8080
```

Luego abrir <http://localhost:8080>.

## Dataset

`data/hallazgos.json` contiene 166 registros normalizados desde el export semicolonado disponible. `scripts/normalize_dataset.py` documenta la transformación: une descripciones multilinea, elimina IDs fuera del esquema, deduplica identificadores repetidos y reemplaza referencias de cliente/tranque por nombres ficticios.

Los hallazgos creados durante la navegación se guardan únicamente en `localStorage` del navegador. No existe persistencia compartida entre usuarios.

## GitHub Pages

Publicar el contenido de esta carpeta como sitio estático en la rama configurada para GitHub Pages. No requiere proceso de build ni variables de entorno.
