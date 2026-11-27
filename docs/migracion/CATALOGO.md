# Contrato del catálogo público

Los listados públicos de fichas y oferta viven en `/api/catalog`. El piloto conserva los GET de `/api/businesses` y `/api/services`. No hay OpenAPI en este repositorio.

## Forma de la respuesta

El cuerpo de un listado correcto sigue siendo un **array JSON**. No se envuelve en `{items,total}`. El frontend de producto (`GET /api/catalog/businesses`, `/services`, `/professionals`) y el piloto (`GET /api/businesses`, `GET /api/services`) no cambian de tipo.

Si hay más filas que el tamaño de página, la respuesta se corta. Quien necesite el resto debe pedir la página siguiente.

## Paginación

Query opcional:

| Parámetro | Por defecto | Máximo | Notas |
| --- | --- | --- | --- |
| `page` | `1` | entero positivo cuyo offset quepa en un entero seguro | Base 1 |
| `limit` | `50` | `100` | Entero ≥ 1 |

La consulta SQL lleva siempre `LIMIT ? OFFSET ?` con esos valores. `page` y `limit` deben ser enteros en decimal sin ceros a la izquierda (no `01`, no `1.5`, no arrays).

Valores inválidos responden **400**. En `/api/catalog` el cuerpo es `{ "code": "invalid_input" }`, el mismo formato que el resto de errores de entrada de ese router. En `GET /api/businesses` y `GET /api/services` el cuerpo es `{ "error": "invalid" }`, el formato ya usado por el catálogo del piloto.

Los 400 y 404 de catálogo público llevan `Cache-Control: no-store`.

Ejemplos:

```
GET /api/catalog/businesses
GET /api/catalog/businesses?page=2&limit=20
GET /api/catalog/businesses/{id}/services?limit=50
GET /api/catalog/businesses/{id}/professionals?serviceId={id}&page=1&limit=50
```

`GET .../professionals` pagina profesionales (no filas del join de servicios). Cada elemento sigue incluyendo todos sus `serviceIds`.

## Caché

Una respuesta **200** de listado público lleva:

```
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

El borde puede guardar la ficha pública. No varía por cookie.

Las respuestas privadas, autenticadas o de un usuario concreto **no se cachean**. En el router de catálogo autenticado la cabecera es `Cache-Control: private, no-store` (horarios, altas, visibilidad, asignaciones). El resto de API de sesión (auth, reservas, membresías, agenda, gestión) mantiene `no-store`.
