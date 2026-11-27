# Disponibilidad y reservas

La disponibilidad devuelve la zona IANA del negocio y huecos UTC informativos para una ventana de hasta 168 horas. La reserva vuelve a comprobar cada hueco dentro de una transacción. Los intervalos son semiabiertos `[inicio, fin)`. Dos citas pueden ser contiguas. Cada cita debe caber en un solo tramo laboral. Puede terminar a medianoche si el tramo termina a las 24:00. Durante un cambio de hora se distinguen instantes UTC aunque coincida su hora local y se rechazan las citas que crucen el cambio de desfase.

Los cierres bloquean solo el perfil y local a los que pertenecen. Las citas `booked`, `completed` y `no_show` bloquean el tiempo de la cuenta profesional en todos sus locales, incluidos sus perfiles inactivos. Las citas canceladas dejan el intervalo libre. La respuesta pública contiene los huecos del local solicitado.

## Contratos HTTP

- `GET /api/catalog/businesses` lista las fichas publicadas, incluidas las que se quedan sin oferta. Los endpoints `/api/catalog/businesses/:id/services` y `/api/catalog/businesses/:id/professionals?serviceId=…` exponen las ofertas activas con profesional vinculado, pertenencia activa, asignación y horario. No incluyen identificadores de cuenta.
- `POST /api/bookings` obtiene el cliente de la sesión y valida el origen. Requiere una cabecera `Idempotency-Key` con UUID y un cuerpo con `businessId`, `professionalId`, `serviceId`, `startAt`, `quote` y, opcionalmente, `notes`. `startAt` usa el formato exacto `YYYY-MM-DDTHH:mm:ss.sssZ` y debe caer en la rejilla UTC de 15 minutos (`epoch_ms % 900000 === 0`; minutos 00/15/30/45 y segundos y milisegundos a cero). Un inicio desalineado responde `400` con `{code:"invalid_input"}` y no crea la cita. El hash canónico incluye los UUID de recursos en minúscula, el instante, la nota opcional normalizada a nulo cuando falta y los tres valores de la oferta.
- Una reserva nueva devuelve `201`. Repetir la misma solicitud con su clave devuelve la cita con `200`, incluso si ya pasó la hora o cambió la oferta. Usar una clave completada con otro cuerpo devuelve `409 idempotency_conflict`. Las claves se aíslan por cuenta.
- La oferta contiene `priceCents`, `currency` y `durationMinutes`. Si cambia cualquiera, la API responde `409` con `{code:"offer_changed",quote}` y revierte la clave para permitir una nueva confirmación. Si se pierde el hueco, devuelve `409 slot_unavailable`. La cita conserva precio, moneda e intervalo de la confirmación.
- El piloto conserva `POST /api/appointments` y `GET /api/appointments/availability`. Los perfiles activos sin vínculo siguen disponibles para el flujo del piloto y su ocupación se consulta por perfil. El producto exige vínculo. Las rutas compartidas aplican el mismo cálculo de horarios, cierres y solapes.

## Protocolo transaccional

1. Para una confirmación del producto, insertar o bloquear la fila de `appointment_requests` de la cuenta y clave. Si ya está completada, devolver la cita de esa cuenta. El hash y el vínculo a la cita se escriben en la misma transacción que la reserva.
2. Bloquear la fila de negocio y descubrir bajo ese bloqueo las cuentas profesionales candidatas. Bloquear las cuentas por UUID y después los perfiles por UUID. Revalidar el vínculo bajo bloqueo antes de leer las condiciones. Las funciones compartidas están en `backend-node/src/appointments/booking-locks.ts`.
3. Comprobar visibilidad, pertenencia, oferta, horario, cierre y ocupación actuales. La creación usa `READ COMMITTED` y lecturas bloqueantes para las condiciones y la ocupación. Hay solape si `start_at < fin AND end_at > inicio`. Las filas estables de negocio, cuenta y perfil serializan incluso cuando todavía no existe ninguna cita.
4. Insertar la cita con sus referencias de negocio y confirmar. Un error provoca rollback. Ante un interbloqueo transitorio se reintenta la transacción completa hasta dos veces. Un fallo de conexión con resultado incierto se resuelve repitiendo la clave del producto.

Las mutaciones vigentes de catálogo, horario y vinculación adquieren el bloqueo de negocio. Los cambios de asignación, horario y vínculo bloquean también la cuenta y el perfil cuando corresponda. Las futuras mutaciones de Gestión y Agenda deben seguir el mismo orden y revalidar el impacto bajo bloqueo. La tarea 5 mantiene la responsabilidad de permitir vínculos en varios negocios desde las invitaciones.

La migración 006 de ambos dialectos incorpora cierres, claves de confirmación, un índice temporal por perfil y la marca de asignación activa. Desactivar una asignación conserva su fila y las referencias de citas históricas.

## Verificación local

La suite Docker cubre la actualización y reaplicación de migraciones, el contrato HTTP de catálogo y reserva, carreras de dos conexiones para el mismo perfil y entre locales, adyacencia, histórico inactivo, idempotencia concurrente y rollback. También comprueba reservas frente a cambios de precio, visibilidad, horario partido y cierres, y la compatibilidad del piloto con perfiles sin vínculo. Las pruebas unitarias cubren cambios de hora y límites de jornada.

Con Node 24.22.3 pasaron `npm test` (93 pruebas), `node --test db/tests/*.test.mjs` (33 pruebas), `npm run typecheck` y `npm run build`. Los comandos `bash ./scripts/test-mysql-integration.sh mysql` y `bash ./scripts/test-mysql-integration.sh mariadb` pasaron en serie con MySQL 8.4.13 y MariaDB 10.11.19 y retiraron sus contenedores y redes.

Con las rutas reales de Gestión integradas, la suite ejecuta en paralelo `POST /api/bookings` y operaciones HTTP de cierres, horarios, precio y visibilidad. Comprueba que una cita nueva invalida un aviso de impacto anterior, que la nueva confirmación conserva las citas existentes y que el cliente recibe las condiciones vigentes si cambia la oferta. El mismo arnés verifica el alcance de la agenda y dos aceptaciones simultáneas de una invitación. Pasaron las cinco pruebas de integración en cada motor en la verificación del 20-11-2026.
