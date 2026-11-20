# API GoodLook: base inicial

Servicio independiente en desarrollo con Node 24, Express 5 y TypeScript. Incluye `GET /health`, respuestas de error JSON y una primera implementación de autenticación persistente. Todavía no tiene lógica de reservas ni preparación para producción; no sustituye a la API .NET.

```bash
npm ci
npm test
npm run typecheck
npm run build
npm start
```

`PORT` es opcional; el valor por defecto es 3000. No configurar credenciales en este repositorio. El ejemplo local está en `.env.example`. La separación de preview y producción, y la regla de no exportar `VERCEL`, están en [docs/migracion/ENTORNOS.md](../docs/migracion/ENTORNOS.md).

## Identidad (en desarrollo)

Para iniciar la API con identidad es obligatorio establecer `APP_ORIGIN` (origen HTTPS exacto de la aplicación, sin barra final; HTTP solo en localhost) y `DATABASE_URL` (`mysql://usuario:contraseña@servidor:3306/base`). El servicio requiere el esquema de `users` y `auth_sessions` de la migración MySQL. `MYSQL_TLS=true` exige TLS con validación del certificado para la conexión MySQL. Se rechaza cualquier conexión sin TLS, salvo `localhost`, `127.0.0.1` o `::1` cuando `MYSQL_ALLOW_INSECURE_LOCAL=true` se establece explícitamente para desarrollo. Sin `GOODLOOK_DATA_ENV` ni `VERCEL_ENV` el papel queda sin declarar y una base que no sea loopback impide el arranque. La identidad de producción se lee de `config/production-database.json`; solo el papel `production` puede abrirla. `VERCEL=1` sin `VERCEL_ENV=production` tampoco puede. No definas `VERCEL` ni `VERCEL_ENV` en local, Docker ni CI: las inyecta Vercel. No incluyas valores reales en Git ni en registros. Esta configuración inicial está orientada a servir frontend y API bajo el mismo origen; no añade CORS para orígenes cruzados.

`POST /api/auth/register` admite `email`, `password` (10–128 caracteres) y `displayName`. `POST /api/auth/login` crea una cookie Secure, HttpOnly y SameSite=Strict con sesión de 24 horas; el servidor guarda solo el hash del token. `GET /api/auth/me` identifica al usuario de la sesión y `POST /api/auth/logout` la revoca. Las solicitudes POST requieren cabecera Origin que coincida exactamente con APP_ORIGIN. Las contraseñas se guardan como hash scrypt con sal aleatoria.

Las pruebas HTTP usan un repositorio en memoria como fixture, no comprueban el driver ni la migración MySQL. Antes de despliegue faltan pruebas de integración con MySQL real, limitación de intentos y protección frente a abuso, políticas de recuperación de cuenta, observabilidad, gestión operativa de sesiones y revisión de seguridad. La funcionalidad no está lista para producción. El atributo Secure de la cookie exige HTTPS en el navegador.

El limitador compartido de acceso es preliminar y aún requiere validación con MySQL real, protección en el borde y controles operativos antes de su publicación.

## Profesionales (en desarrollo)

`GET /api/professionals?businessId=<UUID>` devuelve únicamente el identificador y el nombre público de profesionales activos de ese negocio, sin requerir inicio de sesión. `POST /api/professionals` admite `businessId` y `displayName`; requiere Origin exacto y sesión. El identificador del actor se obtiene de la sesión y la autorización de administrador o propietario activo se comprueba por negocio en la capa de persistencia. No envía correo ni activa una cuenta de profesional. Las pruebas actuales usan un repositorio simulado y no verifican el funcionamiento de MySQL real; no está listo para producción.

### Catálogo y horarios (preliminar)

`GET /api/businesses` y `GET /api/services?businessId=...` son públicos. Solo devuelven negocios publicados y sus servicios activos. El alta de servicios (`POST /api/services`), asignación (`POST /api/services/assign`) y actualización de horarios (`PUT /api/schedules`) exigen sesión, Origin autorizado y rol activo owner/admin del negocio; leer horarios (`GET /api/schedules`) requiere owner/admin o el profesional asignado. Las escrituras que afectan a un profesional bloquean su fila antes de cambiar asignaciones u horas. La API aún no ofrece edición/desactivación de servicios ni excepciones de horarios; no se ha validado MySQL ni concurrencia real.

El catálogo y la reserva de citas requieren `businesses.is_public=TRUE` (migración 003). Los negocios existentes y nuevos quedan privados por defecto. Un owner/admin activo puede activar o desactivar publicación mediante `PUT /api/businesses/visibility` con `{ "businessId": "...", "isPublic": true }`, sesión y Origin correcto. La publicación no implica revisión de contenido ni verifica que el negocio haya configurado agenda. No publicar datos reales hasta verificar controles, privacidad y seguridad en MySQL real.

`POST /api/businesses` requiere sesión y Origin autorizado, recibe `{name, timezone}` y crea el negocio privado junto a una membresía activa `owner` del usuario autenticado en una única transacción. La zona horaria debe ser un identificador aceptado por Intl/IANA. SQL de alta y rollback están cubiertos con conexión simulada; validación en MySQL real pendiente.

### Limitación de acceso

La autenticación de registro e inicio de sesión exige migración `004_auth_rate_limits.sql` y la variable `AUTH_LIMIT_SECRET` como secreto hex aleatorio de al menos 32 bytes; mantenerla fuera del repositorio y conservarla igual entre instancias. El limitador utiliza HMAC para identificar sin guardar correo/IP en claro y contadores MySQL compartidos con bloqueo transaccional: 100 intentos por IP y 10 por identidad en ventanas fijas de 15 minutos, combinando registro y acceso. El exceso devuelve 429 y Retry-After; si la base falla, devuelve 503 y no autentica. No evita ataques distribuidos por sí solo: exige WAF y observación de abuso. Limitar por identidad permite que un atacante cause una denegación temporal de acceso a una cuenta; evaluar calibración y recuperación.

Solo se usa la dirección directa del socket: se ignoran `Forwarded` y `X-Forwarded-For`. Detrás de un proxy todas las solicitudes compartirán la dirección del proxy, por lo que debe existir un limitador por IP fiable en el borde; nunca habilitar trust proxy genérico ni aceptar cabeceras de clientes arbitrarios. La tabla necesita limpieza programada de ventanas expiradas y política de retención antes de producción. Los tests de SQL son simulados; la prueba de concurrencia MySQL aislada está escrita pero no ejecutada aquí.

### Mantenimiento del límite de acceso

El límite se aplica primero a la dirección del socket y, solo si no se ha superado, a la identidad. Un cliente ya bloqueado no crea nuevos contadores de identidad. Los dos tipos de bucket tienen espacios HMAC distintos; cada transacción adquiere primero el bloqueo de IP y después, como máximo, el de una identidad. Sigue siendo un límite preliminar: una persona puede bloquear temporalmente una identidad conocida; tras un proxy la IP de socket puede ser común a muchos usuarios y bloquearlos en conjunto. Configurar protección en el borde con origen/IP verificados antes de una publicación y calibrar límites.

La tabla necesita mantenimiento programado: después de `npm run build`, ejecutar `GOODLOOK_RATE_CLEANUP=YES node dist/cleanup-rate-limits.js` con `DATABASE_URL`, `APP_ORIGIN` y la configuración TLS habitual. Cada ejecución borra como máximo 500 filas con ventana anterior a 24 horas, según reloj UTC de MySQL; repetir con un planificador externo, y monitorizar acumulación. No hay cron automático ni límite duro de tamaño: una distribución de IPs, cuentas diferentes o ejecución insuficiente de la limpieza puede seguir generando muchos registros. No se leen ni registran correos o direcciones IP en claro. Estas operaciones aún requieren validación de concurrencia en MySQL real.
