# API GoodLook: base inicial

Servicio independiente en desarrollo con Node 24, Express 5 y TypeScript. Incluye `GET /health`, respuestas de error JSON y una primera implementación de autenticación persistente. Todavía no tiene lógica de reservas ni preparación para producción; no sustituye a la API .NET.

```bash
npm ci
npm test
npm run typecheck
npm run build
npm start
```

`PORT` es opcional; el valor por defecto es 3000. No configurar credenciales en este repositorio.

## Identidad (en desarrollo)

Para iniciar la API con identidad es obligatorio establecer `APP_ORIGIN` (origen HTTPS exacto de la aplicación, sin barra final; HTTP solo en localhost) y `DATABASE_URL` (`mysql://usuario:contraseña@servidor:3306/base`). El servicio requiere el esquema de `users` y `auth_sessions` de la migración MySQL. `MYSQL_TLS=true` exige TLS con validación del certificado para la conexión MySQL. Se rechaza cualquier conexión sin TLS, salvo `localhost`, `127.0.0.1` o `::1` cuando `MYSQL_ALLOW_INSECURE_LOCAL=true` se establece explícitamente para desarrollo. No incluyas valores reales en Git ni en registros. Esta configuración inicial está orientada a servir frontend y API bajo el mismo origen; no añade CORS para orígenes cruzados.

`POST /api/auth/register` admite `email`, `password` (10–128 caracteres) y `displayName`. `POST /api/auth/login` crea una cookie Secure, HttpOnly y SameSite=Strict con sesión de 24 horas; el servidor guarda solo el hash del token. `GET /api/auth/me` identifica al usuario de la sesión y `POST /api/auth/logout` la revoca. Las solicitudes POST requieren cabecera Origin que coincida exactamente con APP_ORIGIN. Las contraseñas se guardan como hash scrypt con sal aleatoria.

Las pruebas HTTP usan un repositorio en memoria como fixture, no comprueban el driver ni la migración MySQL. Antes de despliegue faltan pruebas de integración con MySQL real, limitación de intentos y protección frente a abuso, políticas de recuperación de cuenta, observabilidad, gestión operativa de sesiones y revisión de seguridad. La funcionalidad no está lista para producción. El atributo Secure de la cookie exige HTTPS en el navegador.

El limitador compartido de acceso separa a los clientes según la política de identidad de más abajo. Sigue siendo un control preliminar: exige validación con MySQL real, un WAF en el borde y la limpieza operativa antes de considerarlo suficiente en producción.

## Profesionales (en desarrollo)

`GET /api/professionals?businessId=<UUID>` devuelve únicamente el identificador y el nombre público de profesionales activos de ese negocio, sin requerir inicio de sesión. `POST /api/professionals` admite `businessId` y `displayName`; requiere Origin exacto y sesión. El identificador del actor se obtiene de la sesión y la autorización de administrador o propietario activo se comprueba por negocio en la capa de persistencia. No envía correo ni activa una cuenta de profesional. Las pruebas actuales usan un repositorio simulado y no verifican el funcionamiento de MySQL real; no está listo para producción.

### Catálogo y horarios (preliminar)

`GET /api/businesses` y `GET /api/services?businessId=...` son públicos. Solo devuelven negocios publicados y sus servicios activos. El alta de servicios (`POST /api/services`), asignación (`POST /api/services/assign`) y actualización de horarios (`PUT /api/schedules`) exigen sesión, Origin autorizado y rol activo owner/admin del negocio; leer horarios (`GET /api/schedules`) requiere owner/admin o el profesional asignado. Las escrituras que afectan a un profesional bloquean su fila antes de cambiar asignaciones u horas. La API aún no ofrece edición/desactivación de servicios ni excepciones de horarios; no se ha validado MySQL ni concurrencia real.

El catálogo y la reserva de citas requieren `businesses.is_public=TRUE` (migración 003). Los negocios existentes y nuevos quedan privados por defecto. Un owner/admin activo puede activar o desactivar publicación mediante `PUT /api/businesses/visibility` con `{ "businessId": "...", "isPublic": true }`, sesión y Origin correcto. La publicación no implica revisión de contenido ni verifica que el negocio haya configurado agenda. No publicar datos reales hasta verificar controles, privacidad y seguridad en MySQL real.

`POST /api/businesses` requiere sesión y Origin autorizado, recibe `{name, timezone}` y crea el negocio privado junto a una membresía activa `owner` del usuario autenticado en una única transacción. La zona horaria debe ser un identificador aceptado por Intl/IANA. SQL de alta y rollback están cubiertos con conexión simulada; validación en MySQL real pendiente.

### Limitación de acceso

La autenticación de registro e inicio de sesión exige migración `004_auth_rate_limits.sql` y la variable `AUTH_LIMIT_SECRET` como secreto hex aleatorio de al menos 32 bytes; mantenerla fuera del repositorio y conservarla igual entre instancias. El limitador utiliza HMAC para identificar sin guardar correo/IP en claro y contadores MySQL compartidos con bloqueo transaccional: 100 intentos por IP y 10 por identidad en ventanas fijas de 15 minutos, combinando registro y acceso. El exceso devuelve 429 y `Retry-After`; si la base falla o no hay una dirección de cliente fiable, devuelve 503 y no autentica. No evita ataques distribuidos por sí solo: exige WAF y observación de abuso. Limitar por identidad permite que un atacante cause una denegación temporal de acceso a una cuenta; evaluar calibración y recuperación. El cupo por identidad sigue aplicándose además del cupo por IP: agotar la IP no crea contadores de otras cuentas, y agotar una cuenta no consume el cupo de otra.

La dirección de cliente no sale de `req.ip` ni de `trust proxy`. Express queda con `trust proxy` desactivado: activarlo haría que `X-Forwarded-For` eligiera el cupo, y esa cabecera la puede escribir el cliente fuera de Vercel. La tabla necesita limpieza programada de ventanas expiradas y política de retención antes de producción. Los tests de SQL son simulados; la prueba de concurrencia MySQL aislada está escrita pero no ejecutada aquí.

#### Identidad del cliente

Hay dos modos. El modo lo decide solo la variable `VERCEL`, que la plataforma pone a `1` en preview y producción. No hace falta otra variable ni un secreto nuevo. No definir `VERCEL` en local, en CI ni en ningún proceso que no sea el runtime de Vercel.

- Sin `VERCEL=1` (local, CI y cualquier otro host): la clave es la dirección del socket TCP. Se ignoran `Forwarded`, `X-Forwarded-For`, `X-Real-IP` y `X-Vercel-Forwarded-For`. Así un cliente no elige su cupo.
- Con `VERCEL=1`: la clave es solo `x-vercel-forwarded-for`. No hay reserva hacia el socket ni hacia `X-Forwarded-For` o `X-Real-IP`. Si la cabecera falta, está vacía o contiene algún tramo que no es una IP, la ruta responde 503. La clave es la primera dirección de la lista; el resto no abre otro cupo. Una IPv4 embebida (`::ffff:` o sus ocho grupos) se guarda como IPv4. Las demás IPv6 se guardan en la forma corta de la RFC 5952, así que dos grafías de la misma dirección comparten cupo.

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
- Rotar el identificador de interfaz dentro de un prefijo IPv6 sigue abriendo cupos distintos. No se agrupa por /64: ese prefijo suele ser una casa o un conjunto del operador, y volvería a meter a muchos clientes en el mismo cupo.
- El límite no sustituye a un WAF ni frena un ataque distribuido. No se ha vuelto a ejecutar la integración MySQL en esta tanda; el SQL no cambió.

### Mantenimiento del límite de acceso

El límite se aplica primero a la dirección de cliente descrita arriba y, solo si no se ha superado, a la identidad. Un cliente ya bloqueado no crea nuevos contadores de identidad. Los dos tipos de bucket tienen espacios HMAC distintos; cada transacción adquiere primero el bloqueo de IP y después, como máximo, el de una identidad. Sigue siendo un límite preliminar: una persona puede bloquear temporalmente una identidad conocida. Una IP pública compartida (NAT, operador móvil o VPN) sigue compartiendo el cupo de IP. Calibrar límites y mantener el WAF.

La tabla necesita mantenimiento programado: después de `npm run build`, ejecutar `GOODLOOK_RATE_CLEANUP=YES node dist/cleanup-rate-limits.js` con `DATABASE_URL`, `APP_ORIGIN` y la configuración TLS habitual. Cada ejecución borra como máximo 500 filas con ventana anterior a 24 horas, según reloj UTC de MySQL; repetir con un planificador externo, y monitorizar acumulación. No hay cron automático ni límite duro de tamaño: una distribución de IPs, cuentas diferentes o ejecución insuficiente de la limpieza puede seguir generando muchos registros. No se leen ni registran correos o direcciones IP en claro. Estas operaciones aún requieren validación de concurrencia en MySQL real.
