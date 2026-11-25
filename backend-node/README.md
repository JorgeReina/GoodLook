# API GoodLook

API de producto en Node 24, Express 5 y TypeScript. Sirve al piloto (`/piloto`) y al producto (`/producto/`) en el mismo origen. Persiste en MySQL 8 o MariaDB 10.11 e incluye autenticación por cookie, catálogo, reservas, citas, agenda y gestión de negocios.

El contrato de rutas está en [`openapi.yaml`](openapi.yaml). El protocolo de reservas está en [`docs/migracion/RESERVAS.md`](../docs/migracion/RESERVAS.md). El recorrido local con datos sintéticos y el paquete de entrega están en [`FrontEndGoodLook/PILOTO.md`](../FrontEndGoodLook/PILOTO.md). El diario de la migración, que esta tarea no reescribe, está en [`docs/migracion/`](../docs/migracion/).

La API no publica la especificación: `openapi.yaml` es un archivo del repositorio, no una ruta HTTP.

## Nota histórica

Queda retirado el texto inicial de este archivo, que describía un esqueleto previo. La API actual autentica, persiste y reserva. La lógica que ejecuta el código está en [Reservas y citas](#reservas-y-citas).

## Variables de entorno

No guardes valores en Git, en la documentación ni en el historial de comandos compartido. Los nombres siguientes son los que lee el proceso.

| Nombre | Cuándo | Descripción |
| --- | --- | --- |
| `PORT` | Opcional | Puerto TCP. Entero entre 1 y 65535. Por defecto `3000`. |
| `APP_ORIGIN` | Arranque | Origen exacto del navegador, sin barra final ni ruta. HTTPS, o HTTP solo si el host es `localhost` o `127.0.0.1`. |
| `DATABASE_URL` | Arranque y migraciones | URL `mysql://usuario:contraseña@servidor:puerto/base`. Sin consulta ni fragmento. |
| `MYSQL_TLS` | Conexión remota | `true` exige TLS y verifica el certificado. |
| `MYSQL_ALLOW_INSECURE_LOCAL` | Solo loopback | `true` permite conexión sin TLS cuando el host es `localhost`, `127.0.0.1` o `::1`. |
| `AUTH_LIMIT_SECRET` | Arranque | Secreto hex aleatorio de al menos 32 bytes (64 caracteres hex). Clave HMAC de los limitadores. El mismo valor en todas las instancias. No es la contraseña de MySQL. |
| `GOODLOOK_MIGRATION_TARGET` | Migraciones | `test`, `development` o `production`. Lo declara quien ejecuta; no detecta si la URL es de producción. |
| `GOODLOOK_MIGRATION_DIALECT` | Migraciones | `mysql` (defecto) o `mariadb`. Elige la serie de archivos. No cambiar de serie en una base ya migrada. |
| `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS` | Migración de producción | Debe ser `YES` si el destino es `production` o si `NODE_ENV=production`. |
| `NODE_ENV` | Migraciones | Si vale `production`, hace falta la señal explícita anterior. |
| `GOODLOOK_RATE_CLEANUP` | Limpieza | Debe ser `YES` para ejecutar el borrado acotado de contadores. |

`npm start` no abre el puerto si faltan `APP_ORIGIN` o `DATABASE_URL`, si la URL no cumple las reglas, o si `AUTH_LIMIT_SECRET` no es hex de al menos 32 bytes. Sin `MYSQL_TLS=true`, la conexión solo se acepta en loopback con `MYSQL_ALLOW_INSECURE_LOCAL=true`.

## Arranque para el piloto y para el producto

Es el mismo proceso. No hay una variable de modo. El navegador y `APP_ORIGIN` tienen que ser el mismo origen, porque las escrituras comparan la cabecera `Origin` y la cookie de sesión es `SameSite=Strict`.

Requisitos: Node 24 (`>=24 <25`, el mismo rango de CI) y una base vacía ya migrada con la serie 001–006. Desde `backend-node`:

```bash
npm ci
npm run build
export PORT=3000
export APP_ORIGIN=http://localhost:4200
export DATABASE_URL='mysql://USUARIO:CONTRASEÑA@127.0.0.1:PUERTO/BASE_DESECHABLE'
export MYSQL_ALLOW_INSECURE_LOCAL=true
export AUTH_LIMIT_SECRET="$(openssl rand -hex 32)"
npm start
```

`APP_ORIGIN=http://localhost:4200` vale para el piloto y para el producto cuando Angular se sirve en ese origen y el proxy reenvía `/api` a `127.0.0.1:3000`. El detalle del proxy, de la demo Docker y del paquete que publica `/piloto` y `/producto/` está en [`FrontEndGoodLook/PILOTO.md`](../FrontEndGoodLook/PILOTO.md). La demo aislada usa el puerto de base `33317` y credenciales solo de esa base desechable.

En el despliegue del paquete, `api/index.ts` exporta la misma aplicación y no ejecuta `npm start`. `APP_ORIGIN` es el origen HTTPS del sitio, `MYSQL_TLS=true` y el secreto viven en el entorno de la plataforma. No subas un archivo `.env`.

Comprobación mínima con el proceso en marcha:

```bash
curl -sS http://127.0.0.1:3000/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/auth/me
```

La salud responde `{"status":"ok"}`. Sin cookie, la identidad responde `401`.

Para aplicar el esquema antes del arranque, en una base desechable:

```bash
export DATABASE_URL='mysql://USUARIO:CONTRASEÑA@127.0.0.1:PUERTO/BASE_DESECHABLE'
export MYSQL_ALLOW_INSECURE_LOCAL=true
export GOODLOOK_MIGRATION_TARGET=development
export GOODLOOK_MIGRATION_DIALECT=mysql
node db/migrate.mjs
```

Con MariaDB 10.11 usa `GOODLOOK_MIGRATION_DIALECT=mariadb`. El ejecutor, el bloqueo y la recuperación de una migración interrumpida están en [`db/README.md`](db/README.md). No lances el migrador contra la base del sistema antiguo ni contra una base compartida de preview y producción.

## Autenticación

La cookie se llama `goodlook_session`. Es `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/`. El servidor guarda el SHA-256 del token, no el token. La sesión dura 24 horas. La contraseña se guarda como hash scrypt con sal aleatoria.

| Método y ruta | Sesión | Efecto |
| --- | --- | --- |
| `POST /api/auth/register` | No | Crea la cuenta. Cuerpo: `email`, `password` (10–128) y `displayName` (1–120). Responde `201` con `id`, `email` y `displayName`. No inicia sesión. `409` si el correo ya existe. |
| `POST /api/auth/login` | No | Comprueba la contraseña y envía la cookie. Responde el mismo perfil público. `401` si las credenciales no valen. |
| `GET /api/auth/me` | Sí | Devuelve el perfil de la cookie. `401` sin sesión. |
| `POST /api/auth/logout` | Cookie opcional | Revoca la sesión si el token es válido y borra la cookie. `204`. |

Las peticiones que no son `GET` exigen que `Origin` sea exactamente `APP_ORIGIN`. Si no, `403` con `{ "error": "Forbidden origin" }`. No hay CORS de orígenes cruzados: el navegador habla con el mismo origen y un proxy reenvía `/api`.

El registro y el acceso comparten un limitador en MySQL (migración 004): 100 intentos por dirección de cliente y 10 por identidad, en ventanas fijas de 15 minutos. El exceso responde `429` con `Retry-After`. Si el limitador no puede usar la base o no hay una dirección de cliente fiable, responde `503` y no autentica. La clave es un HMAC; no se guardan el correo ni la IP en claro. El cupo por identidad sigue aplicándose además del cupo por IP: agotar la IP no crea contadores de otras cuentas, y agotar una cuenta no consume el cupo de otra. El limitador no frena por sí solo tráfico distribuido, y el cupo por identidad puede bloquear temporalmente una cuenta conocida.

La dirección de cliente no sale de `req.ip` ni de `trust proxy`. Express queda con `trust proxy` desactivado: activarlo haría que `X-Forwarded-For` eligiera el cupo, y esa cabecera la puede escribir el cliente fuera de Vercel.

#### Identidad del cliente

Hay dos modos. El modo lo decide solo la variable `VERCEL`, que la plataforma pone a `1` en preview y producción. No hace falta otra variable ni un secreto nuevo. No definir `VERCEL` en local, en CI ni en ningún proceso que no sea el runtime de Vercel.

- Sin `VERCEL=1` (local, CI y cualquier otro host): la clave es la dirección del socket TCP. Se ignoran `Forwarded`, `X-Forwarded-For`, `X-Real-IP` y `X-Vercel-Forwarded-For`. Así un cliente no elige su cupo.
- Con `VERCEL=1`: la clave es solo `x-vercel-forwarded-for`. No hay reserva hacia el socket ni hacia `X-Forwarded-For` o `X-Real-IP`. Si la cabecera falta, está vacía o contiene algún tramo que no es una IP, la ruta responde 503. La clave es la primera dirección de la lista; el resto no abre otro cupo. `node:net` `SocketAddress` acepta el texto. Una IPv4, también la embebida en `::ffff:`, se guarda entera. Cualquier otra IPv6 se guarda como su prefijo /64 en forma canónica: dos grafías o dos direcciones del mismo /64 comparten cupo, y dos /64 distintos no.

Esa cabecera es la que el borde documenta como equivalente a la IP pública del cliente y que permanece aunque algo reescriba después `x-forwarded-for`. La documentación de Vercel consultada el 2026-11-20 ([Request headers](https://vercel.com/docs/headers/request-headers)) dice que Vercel sobrescribe `X-Forwarded-For` para impedir la suplantación y no reenvía la IP de un proxy externo, y que `x-vercel-forwarded-for` es idéntica salvo que `x-forwarded-for` puede ser reescrita si hay un proxy por encima de Vercel. La guía del WAF ([honeypot](https://vercel.com/kb/guide/how-to-build-a-honeypot-with-vercel-web-application-firewall)) toma la primera dirección de la izquierda cuando Vercel es el borde y ha sobrescrito el valor recibido. `x-real-ip` está documentada como idéntica a `x-forwarded-for`; no la usamos, para no ampliar la confianza a otra cabecera.

En Vercel el socket es el proxy, así que seguir usándolo metería a todos los visitantes en el mismo cupo. Con `VERCEL=1`, dos clientes del mismo despliegue y el mismo origen HTTP tienen cupos distintos si su `x-vercel-forwarded-for` es distinta. Un cliente que añada `X-Forwarded-For` o `X-Real-IP` no cambia de cupo.

#### Comprobación en preview o staging

Los tests automáticos cubren el 429, `Retry-After` y el aislamiento. Para repetirlo a mano, usar un preview cuya base no sea la de producción. Hoy preview y producción pueden compartir la misma base y la misma tabla `auth_rate_limits`: un ráfaga contra ese preview escribe contadores reales y puede bloquear esa IP también en producción. No lanzar la ráfaga mientras sigan compartiendo datos.

Cuando la base del preview esté aislada:

1. Confirmar que el proyecto no anula `VERCEL` (la plataforma la deja en `1`). No hace falta configurar otra variable para esta política.
2. Elegir `GET /api/appointments/availability` con identificadores publicados y válidos. El cupo es 30 peticiones por minuto e IP. La petición 31 en esa ventana debe responder 429 con `Retry-After` en segundos. No hace falta sesión.
3. Desde otra red, con otra IP pública, repetir la misma URL dentro del mismo minuto. La respuesta debe ser la de negocio (200 o el error funcional), no 429.
4. Desde la red ya bloqueada, repetir la petición añadiendo `X-Forwarded-For: 203.0.113.50`, `X-Real-IP: 203.0.113.50` y `X-Vercel-Forwarded-For: 203.0.113.50`. Debe seguir en 429. La documentación pública de Vercel no dice con una frase aparte que descarte un `X-Vercel-Forwarded-For` escrito por el cliente; este paso lo comprueba en el preview. Si la respuesta deja de ser 429, el borde ha reenviado el valor del cliente y la política no está calibrada: no promover.
5. El caso de cabecera ausente (503) no se puede forzar desde Internet: Vercel escribe `x-vercel-forwarded-for`. Lo cubre el test automático. Si en el preview todas las peticiones de acceso o disponibilidad responden 503, la cabecera no llega o no es una sola lista de IPs: parar y revisar el formato antes de fiarse del límite.

Registro e inicio de sesión comparten cupo: 100 intentos por IP y 10 por correo en 15 minutos. No usarlos para la ráfaga manual; crean más filas y pueden bloquear una cuenta concreta. Los correos y las IP no se registran en claro. Los contadores anteriores, calculados con la IP del socket del proxy, dejan de usarse al desplegar esta política; la limpieza habitual borra ventanas de más de 24 horas.

#### Riesgo residual

- Varias personas detrás de la misma IP pública (NAT, móvil, VPN) siguen compartiendo el cupo de IP. El cupo por correo del acceso no separa a los anónimos de disponibilidad.
- Otro proxy delante de Vercel hace que `x-vercel-forwarded-for` sea la IP de ese proxy, no la del visitante. Vercel no recomienda ese montaje. El plan Enterprise Trusted Proxy vuelve a aceptar un `X-Forwarded-For` externo; este código no lo lee. Activarlo no cambia el limitador. Habría que diseñar otra política antes de poner Cloudflare u otro CDN delante.
- `VERCEL=1` fuera del runtime de Vercel, incluido un `.env` copiado o `vercel dev`, haría caso a `x-vercel-forwarded-for` sin la garantía de que el borde la haya sobrescrito. No exportar `VERCEL` en local ni en CI.
- Si el borde pasara a reenviar un prefijo escrito por el cliente, la primera IP dejaría de ser fiable. Antes de fiarse en producción, mirar en un preview aislado que la primera dirección de `x-vercel-forwarded-for` es la del visitante.
- El cupo IPv6 es el /64, no la dirección completa. Quien comparta ese prefijo (una casa, una delegación o un bloque del operador) comparte el cupo. Las IPv4 siguen siendo una dirección cada una, así que una NAT IPv4 también comparte cupo, y un `::ffff:` no se mezcla con el resto de su /64.
- El límite no sustituye a un WAF ni frena un ataque distribuido. No se ha vuelto a ejecutar la integración MySQL en esta tanda; el SQL no cambió.

### Mantenimiento del límite de acceso

El límite se aplica primero a la dirección de cliente descrita arriba y, solo si no se ha superado, a la identidad. Un cliente ya bloqueado no crea nuevos contadores de identidad. Los dos tipos de bucket tienen espacios HMAC distintos; cada transacción adquiere primero el bloqueo de IP y después, como máximo, el de una identidad. Sigue siendo un límite preliminar: una persona puede bloquear temporalmente una identidad conocida. Una IP pública compartida (NAT, operador móvil o VPN) sigue compartiendo el cupo de IP. Calibrar límites y mantener el WAF.

La limpieza no es un cron del proceso. Tras `npm run build`:

```bash
GOODLOOK_RATE_CLEANUP=YES node dist/cleanup-rate-limits.js
```

Usa la misma `DATABASE_URL`, `APP_ORIGIN` y TLS que el servicio. Cada ejecución borra como máximo 500 filas cuya ventana empezó hace más de 24 horas, según el reloj UTC de MySQL. Hay que repetirla con un planificador externo. No hay límite duro de tamaño: una distribución de IPs, cuentas diferentes o ejecución insuficiente de la limpieza puede seguir generando muchos registros. No se leen ni registran correos o direcciones IP en claro.

## Recursos y rutas

Con `npm start` quedan montadas todas las rutas de esta tabla. Las respuestas de negocio llevan `Cache-Control: no-store`, salvo `GET /health`. Un JSON ilegible responde `400` `{ "error": "Invalid JSON" }`. Un cuerpo mayor de 32 KiB responde `413`. Una ruta desconocida responde `404` `{ "error": "Not found" }`.

Hay dos familias conviviendo. El piloto sigue usando el catálogo y las citas de `/api/appointments`. El producto usa `/api/catalog`, `/api/bookings`, `/api/me`, `/api/agenda` y `/api/manage`.

| Método y ruta | Auth | Recurso |
| --- | --- | --- |
| `GET /health` | No | `{ "status": "ok" }`. |
| `GET /api/businesses` | No | Negocios publicados: `id`, `name`, `timezone`. |
| `POST /api/businesses` | Sí | Crea un negocio privado y la membresía `owner`. Cuerpo: `name`, `timezone` IANA. `201`. |
| `PUT /api/businesses/visibility` | Sí, solo owner | Cuerpo: `businessId`, `isPublic`. En el arranque real pasa por gestión. La primera publicación exige nombre, sector, dirección y al menos una oferta con profesional vinculado, asignación, servicio activo y horario. `204`. |
| `GET /api/services?businessId=` | No | Servicios activos de un negocio publicado. |
| `POST /api/services` | Sí | Alta de servicio por owner/admin. `201`. |
| `POST /api/services/assign` | Sí | Asigna un servicio activo a un profesional. `204`. |
| `GET /api/schedules` | Sí | Horario semanal. Owner, admin o el profesional asignado. |
| `PUT /api/schedules` | Sí | Sustituye el horario. Owner/admin. Puede exigir la cabecera de impacto. `204`. |
| `GET /api/professionals?businessId=` | No | Profesionales activos de un negocio publicado: `id`, `businessId`, `displayName`. |
| `POST /api/professionals` | Sí | Crea un perfil sin cuenta vinculada. Owner/admin. `201`. No envía correo. |
| `GET /api/catalog/businesses` | No | Fichas publicadas, también las que se quedan sin oferta. |
| `GET /api/catalog/businesses/:id/services` | No | Oferta activa reservable de ese negocio. |
| `GET /api/catalog/businesses/:id/professionals?serviceId=` | No | Profesionales vinculados, con membresía, asignación y horario, para ese servicio. |
| `GET /api/me/memberships` | Sí | Pertenencias activas de la sesión. |
| `GET /api/me/bookings` | Sí | Citas del cliente entre `from` y `to`. |
| `GET /api/agenda` | Sí | Semana de un profesional: horario, cierres y citas. |
| `POST /api/manage/businesses` | Sí | Alta de negocio con ficha (`name`, `timezone`, `sector`, `address`). Queda privado. |
| `GET /api/manage/businesses/:id` | Sí | Ficha, servicios y equipo del negocio. |
| `PATCH /api/manage/businesses/:id/profile` | Sí, solo owner | Cambia nombre, sector, dirección o zona. Cambiar la zona con citas futuras reservadas responde `409` `timezone_has_bookings`. |
| `PUT /api/manage/businesses/:id/visibility` | Sí, solo owner | Publica o retira. Cuerpo: `{ "isPublic": true }`. Misma regla de primera publicación que `/api/businesses/visibility`. |
| `POST /api/manage/businesses/:id/services` | Sí | Alta de servicio con descripción, duración, precio y moneda. |
| `PATCH /api/manage/businesses/:id/services/:serviceId` | Sí | Edita o desactiva el servicio. |
| `POST /api/manage/businesses/:id/staff` | Sí | Alta de perfil profesional. |
| `PATCH /api/manage/businesses/:id/staff/:professionalId` | Sí | Cambia el nombre público o `active`. |
| `PUT /api/manage/businesses/:id/staff/:professionalId/services` | Sí | Sustituye las asignaciones. Cuerpo: `{ "serviceIds": [] }`. |
| `GET` y `PUT .../hours` | Sí | Lee o sustituye la jornada. El `PUT` recibe `{ "hours": [] }`. |
| `GET` y `POST .../closures` | Sí | Cierres del perfil. El alta recibe `startAt` y `endAt` en UTC con milisegundos. |
| `DELETE .../closures/:closureId` | Sí | Elimina un cierre. `204`. |
| `POST /api/invitations` | Sí | Emite un token de un uso para un perfil sin vincular. `201` con `token` y `expiresInSeconds`. |
| `POST /api/invitations/accept` | Sí | Cuerpo: `{ "token" }`. Vincula la cuenta de la sesión. `204`. |
| `DELETE /api/manage/businesses/:id/staff/:professionalId/invitation` | Sí | Revoca invitaciones vigentes. `204`. |

Las escrituras de gestión y de reservas exigen `Origin`. Varias mutaciones que afectan a citas futuras responden `409` con `impact_confirmation_required`, `affectedCount` e `impactToken` hasta que se repite la petición con la cabecera `X-GoodLook-Impact` igual a ese token. Los códigos de gestión usan `{ "code": "..." }`. El catálogo de `/api/businesses` y `/api/services` usa `{ "error": "..." }`.

Los UUID de ruta y de cuerpo aceptan mayúsculas y se normalizan. Los instantes de reserva y de cierre usan `YYYY-MM-DDTHH:mm:ss.sssZ`.

## Reservas y citas

La API reserva. El piloto y el producto escriben en la tabla `appointments` mediante la misma función `reserve` de `src/appointments/service.ts`. El cliente es siempre la sesión: un `actorId` enviado en el cuerpo se ignora. Las dos entradas son estas.

| Método y ruta | Qué hace | Auth |
| --- | --- | --- |
| `GET /api/appointments/availability` | Huecos orientativos. No aparta el hueco. | No |
| `POST /api/appointments` | Reserva del piloto. `201` y la cita. | Sí |
| `GET /api/appointments/me` | Citas del cliente entre `from` y `to`. Máximo 31 días y 100 filas. | Sí |
| `GET /api/appointments/agenda` | Citas de un profesional en un intervalo de hasta 31 días. | Sí |
| `POST /api/bookings` | Reserva de producto, con clave de idempotencia y oferta confirmada. | Sí |
| `GET /api/me/bookings` | Citas de producto del cliente, con cursor. | Sí |
| `GET /api/agenda` | Semana local de un profesional: horario, cierres y citas. | Sí |

### Consulta de huecos

`GET /api/appointments/availability` exige negocio publicado, profesional activo y servicio activo y asignado. `from` y `to` son UTC con milisegundos y la ventana no pasa de siete días. Genera candidatos futuros en pasos de 15 minutos UTC que caben enteros en la jornada de ese día, en la zona IANA del negocio. Acepta un fin exacto a las 24:00. Descarta un hueco que cruce medianoche o un cambio de desfase. En la hora repetida de otoño los dos instantes UTC se calculan por separado.

Resta las citas `booked`, `completed` y `no_show` del perfil y, si el perfil tiene cuenta, las de los demás perfiles de esa cuenta. También resta los cierres `professional_closures` de ese perfil. Las canceladas no ocupan. Si hay más de 100 franjas semanales o más de 5000 intervalos ocupados, responde error en vez de recortar y mostrar huecos falsos. La respuesta es `{ "timezone", "slots": [{ "startAt", "endAt" }] }` y no incluye clientes ni notas. Hay un límite de 30 consultas por minuto y por dirección de cliente, con la misma política de identidad que el acceso.

Dos clientes pueden ver el mismo hueco. La reserva no usa esa respuesta como bloqueo.

### Escritura

`POST /api/appointments` recibe `businessId`, `professionalId`, `serviceId`, `startAt` y, si viene, `notes` (hasta 500 caracteres). El inicio tiene que ser futuro. No lleva clave de idempotencia. Precio, moneda y duración salen del servicio en la base, no del cuerpo.

`POST /api/bookings` añade la cabecera `Idempotency-Key` (UUID) y `quote` con `priceCents`, `currency` (tres letras mayúsculas) y `durationMinutes`. El perfil tiene que estar vinculado a una cuenta. La clave se guarda por cuenta, con el SHA-256 del cuerpo canónico: UUID en minúsculas, instante, nota (nula si falta) y los tres valores de la oferta.

Las dos rutas abren una transacción `READ COMMITTED` y, si el motor informa un interbloqueo, repiten el intento hasta dos veces. El orden de bloqueo es el de `src/appointments/booking-locks.ts`:

1. En la reserva de producto, insertar o bloquear la fila de `appointment_requests` de esa cuenta y esa clave. Si la clave ya tiene otro cuerpo, `409` `idempotency_conflict`. Si ya tiene cita, responder `200` con esa cita y no volver a mirar la hora ni la oferta.
2. Bloquear la fila del negocio. Leer el perfil. Si tiene cuenta, bloquear esa cuenta y después el perfil.
3. Releer bajo el bloqueo la oferta activa: negocio publicado, servicio activo, asignación activa y, cuando el perfil tiene cuenta, membresía activa. La duración y el precio usados son los de esa lectura.
4. En producto, si `priceCents`, `currency` o `durationMinutes` no coinciden con la `quote`, responder `409` `offer_changed` e incluir la oferta vigente. La transacción revierte la clave, así que se puede confirmar de nuevo.
5. Calcular el fin sumando la duración del servicio. El intervalo tiene que caer en un solo tramo laboral de ese día local, o terminar justo a las 24:00 cuando el tramo termina a esa hora. Se rechaza cruzar de día, cruzar un cambio de desfase o terminar antes de empezar.
6. Rechazar si un cierre del perfil solapa el intervalo. Rechazar si ya hay una cita `booked`, `completed` o `no_show` que solape, en ese perfil o en otro perfil de la misma cuenta profesional. El solape es semiabierto: hay conflicto cuando `start_at < fin` y `end_at > inicio`. Dos citas pueden quedar pegadas. Una cita cancelada deja el intervalo libre.
7. Insertar la cita con estado `booked`, el precio y la moneda del servicio, y el intervalo calculado. En producto, guardar el identificador de la cita en la misma transacción que la clave.

El piloto responde `201` con la cita. Un solape o una oferta ilocalizable usa `{ "error": "conflict" }` o `{ "error": "unavailable" }`. El producto traduce esos dos resultados a `409` `{ "code": "slot_unavailable" }`. Una reserva nueva de producto responde `201`; el reintento idéntico responde `200`.

`GET /api/appointments/agenda` devuelve las columnas de la consulta (`id`, `service_id`, `customer_user_id`, `start_at`, `end_at`, `status`, `notes`). El resto de citas usa camelCase. Unificar esos nombres sería un cambio de código, no de esta documentación. La semana de producto usa `weekStart` (un lunes `YYYY-MM-DD`) y devuelve horario, cierres y citas. `GET /api/me/bookings` pagina con un `cursor` opaco.

El protocolo largo y las pruebas de carrera están en [`docs/migracion/RESERVAS.md`](../docs/migracion/RESERVAS.md) y en [`src/appointments/README.md`](src/appointments/README.md). Las invitaciones están en [`src/invitations/README.md`](src/invitations/README.md).

## Migraciones

Hay dos series paralelas, de `001` a `006`:

| Versión | MySQL 8 y MariaDB 10.11 |
| --- | --- |
| 001 | Esquema inicial: cuentas, sesiones, negocios, servicios, profesionales, horarios y citas. |
| 002 | Invitaciones de profesional. El token se guarda solo como SHA-256. |
| 003 | `businesses.is_public`. Los negocios nacen privados. |
| 004 | Contadores `auth_rate_limits` para acceso y disponibilidad. |
| 005 | Ficha (`sector`, `address`), `first_published_at`, descripción de servicio y `revoked_at` de invitaciones. |
| 006 | Cierres, clave idempotente de reserva, índice temporal e asignación activa. |

Los archivos MySQL están en `db/migrations`. Los de MariaDB, con su propia colación, están en `db/migrations-mariadb`. Los checksums no se intercambian. Cómo ejecutarlas y qué hacer si una queda en `applying` está en [`db/README.md`](db/README.md).

## Pruebas y comprobación estática

No hay ESLint. La comprobación de TypeScript es `npm run typecheck`. La especificación se valida con `npm run lint:openapi` (`@redocly/cli`, versión fijada). El mismo comando corre en CI, dentro del paso de build y pruebas de la API, antes de `npm test`.

Desde `backend-node`, con las dependencias de `npm ci`:

```bash
npm test
npm run typecheck
npm run build
node --test db/tests/*.test.mjs
```

`npm test` ejecuta `test/*.test.ts` con repositorios simulados. No abre MySQL. `db/tests/*.test.mjs` ejercita el migrador con conexiones simuladas.

La integración con motor real necesita Docker Engine, Compose y el puerto de loopback `33317` libre:

```bash
bash ./scripts/test-mysql-integration.sh mysql
bash ./scripts/test-mysql-integration.sh mariadb
```

Crea un proyecto Compose efímero, comprueba migraciones, aislamiento y carreras de reservas, y lo destruye al salir. No usa datos reales. El fallo es explícito si Docker no está. Qué cubre la suite está en [`test/integration/README.md`](test/integration/README.md) y en [`docs/migracion/RESERVAS.md`](../docs/migracion/RESERVAS.md).

## CI

El flujo [`.github/workflows/goodlook-product.yml`](../.github/workflows/goodlook-product.yml) se ejecuta en `push` y `pull_request` hacia `main` y `work/goodlook-migracion`, y también con `workflow_dispatch`. El job `product` usa `ubuntu-latest`, Node 24 y un tiempo límite de 20 minutos.

La parte de API, en `backend-node`, hace:

```bash
npm ci --no-audit --no-fund
npm run build
npm test
node --test db/tests/*.test.mjs
bash ./scripts/test-mysql-integration.sh mysql
bash ./scripts/test-mysql-integration.sh mariadb
```

El mismo job compila el frontend, ejecuta pruebas Angular y la aceptación de navegador. Esos pasos no son el arranque de la API.
