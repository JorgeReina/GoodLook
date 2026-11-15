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

El servicio aún no limita intentos de acceso ni protege frente a abuso. Una limitación en memoria por proceso no sería fiable en despliegues con varias instancias; es necesario un control compartido antes de publicarlo.

## Profesionales (en desarrollo)

`GET /api/professionals?businessId=<UUID>` devuelve únicamente el identificador y el nombre público de profesionales activos de ese negocio, sin requerir inicio de sesión. `POST /api/professionals` admite `businessId` y `displayName`; requiere Origin exacto y sesión. El identificador del actor se obtiene de la sesión y la autorización de administrador o propietario activo se comprueba por negocio en la capa de persistencia. No envía correo ni activa una cuenta de profesional. Las pruebas actuales usan un repositorio simulado y no verifican el funcionamiento de MySQL real; no está listo para producción.

### Catálogo y horarios (preliminar)

`GET /api/businesses` y `GET /api/services?businessId=...` son públicos. Solo devuelven negocios publicados y sus servicios activos. El alta de servicios (`POST /api/services`), asignación (`POST /api/services/assign`) y actualización de horarios (`PUT /api/schedules`) exigen sesión, Origin autorizado y rol activo owner/admin del negocio; leer horarios (`GET /api/schedules`) requiere owner/admin o el profesional asignado. Las escrituras que afectan a un profesional bloquean su fila antes de cambiar asignaciones u horas. La API aún no ofrece edición/desactivación de servicios ni excepciones de horarios; no se ha validado MySQL ni concurrencia real.

El catálogo y la reserva de citas requieren `businesses.is_public=TRUE` (migración 003). Los negocios existentes y nuevos quedan privados por defecto. Un owner/admin activo puede activar o desactivar publicación mediante `PUT /api/businesses/visibility` con `{ "businessId": "...", "isPublic": true }`, sesión y Origin correcto. La publicación no implica revisión de contenido ni verifica que el negocio haya configurado agenda. No publicar datos reales hasta verificar controles, privacidad y seguridad en MySQL real.

`POST /api/businesses` requiere sesión y Origin autorizado, recibe `{name, timezone}` y crea el negocio privado junto a una membresía activa `owner` del usuario autenticado en una única transacción. La zona horaria debe ser un identificador aceptado por Intl/IANA. SQL de alta y rollback están cubiertos con conexión simulada; validación en MySQL real pendiente.
