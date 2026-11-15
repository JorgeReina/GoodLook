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
