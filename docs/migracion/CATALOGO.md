# Contrato del catálogo público

Los listados públicos de fichas y oferta viven en `/api/catalog`. El piloto conserva los GET de `/api/businesses` y `/api/services`. El contrato de rutas también está en `backend-node/openapi.yaml`.

## Forma de la respuesta

El cuerpo de un listado correcto sigue siendo un **array JSON**. No se envuelve en `{items,total}`. El frontend de producto (`GET /api/catalog/businesses`, `/services`, `/professionals`) y el piloto (`GET /api/businesses`, `GET /api/services`) no cambian de tipo.

`GET /api/catalog/businesses/{id}` no es un listado: responde un **objeto** `PublicBusiness` (los mismos campos que un elemento del listado: `id`, `name`, `sector`, `address`, `timezone`; sin columnas privadas). Sirve para abrir una ficha sin depender de que el negocio esté en la primera página del listado. El `id` es UUID, como en el resto de `/api/catalog`. `0`, negativos, decimales, texto o números que no son UUID responden **400** `{ "code": "invalid_input" }`. Si no existe o no está publicado, **404** `{ "code": "not_found" }` (la consulta exige `is_public=TRUE` en SQL; no se distinguen ambos casos). Los 400 y 404 llevan `Cache-Control: no-store`. No pagina ni envía `X-Has-More`/`Link`. Express registra `/businesses/:id/services` y `/professionals` antes que `/businesses/:id`.

Si hay más filas que el tamaño de página, la respuesta se corta. El cuerpo no indica si hay continuación: eso va en cabeceras.

## Paginación

Query opcional:

| Parámetro | Por defecto | Máximo | Notas |
| --- | --- | --- | --- |
| `page` | `1` | entero positivo cuyo offset quepa en un entero seguro | Base 1 |
| `limit` | `50` | `100` | Entero ≥ 1 |

La consulta SQL pide **`limit + 1`** filas (`LIMIT ? OFFSET ?`) y no usa `COUNT(*)`. Si llega la fila extra, el cuerpo se recorta a `limit` y hay página siguiente.

`page` y `limit` deben ser enteros en decimal sin ceros a la izquierda (no `01`, no `1.5`, no arrays).

Cabeceras de un 200:

| Cabecera | Valor |
| --- | --- |
| `X-Has-More` | `true` o `false` |
| `Link` | solo si hay más: `</api/catalog/businesses?page=3&limit=2>; rel="next"` (ruta actual, `page` siguiente y el mismo `limit`; se conservan otros query como `serviceId`) |
| `Access-Control-Expose-Headers` | `X-Has-More, Link` |

La API es de mismo origen y **no hay middleware CORS**. Se envía `Access-Control-Expose-Headers` para que esas dos cabeceras sigan visibles si más adelante se habilita CORS.

Valores inválidos responden **400**. En `/api/catalog` el cuerpo es `{ "code": "invalid_input" }`, el mismo formato que el resto de errores de entrada de ese router. En `GET /api/businesses` y `GET /api/services` el cuerpo es `{ "error": "invalid" }`, el formato ya usado por el catálogo del piloto.

Los 400 y 404 de catálogo público llevan `Cache-Control: no-store`.

Ejemplos:

```
GET /api/catalog/businesses
GET /api/catalog/businesses?page=2&limit=20
GET /api/catalog/businesses/{id}
GET /api/catalog/businesses/{id}/services?limit=50
GET /api/catalog/businesses/{id}/professionals?serviceId={id}&page=1&limit=50
```

`GET .../professionals` pagina profesionales (no filas del join de servicios). Cada elemento sigue incluyendo todos sus `serviceIds`.

## Caché

Una respuesta **200** de listado público o de `GET /api/catalog/businesses/{id}` lleva:

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

El borde puede guardar la ficha pública. No varía por cookie.

Las respuestas privadas, autenticadas o de un usuario concreto **no se cachean**. En el router de catálogo autenticado la cabecera es `Cache-Control: private, no-store` (horarios, altas, visibilidad, asignaciones). El resto de API de sesión (auth, reservas, membresías, agenda, gestión) mantiene `no-store`.
