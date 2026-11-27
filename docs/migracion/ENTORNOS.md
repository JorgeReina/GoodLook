# Entornos de datos: desarrollo, preview y producción

Fecha de la revisión: 2026-11-26. Rama de partida: `work/goodlook-migracion`. Esta revisión versiona las identidades de producción y preview. No cambia variables en Vercel ni en MonsterASP, no despliega y no lee secretos.

La historia [#11](https://github.com/JorgeReina/GoodLook/issues/11) pide una base de preview distinta de la de producción, con TLS y esquema 006, para que las pruebas que escriben no alteren el dominio público. Frontend y QA la necesitan como URL HTTPS en [#15](https://github.com/JorgeReina/GoodLook/issues/15) (PWA en dispositivos), [#14](https://github.com/JorgeReina/GoodLook/issues/14) (recorrido por roles) y [#19](https://github.com/JorgeReina/GoodLook/issues/19) (teclado, zoom y estados). La identidad de preview ya existe (`db81522`, MariaDB 10.11.19, vacía) y está en `backend-node/config/preview-database.json`. El preview de Vercel no queda aislado hasta que sus variables apunten a esa URL, con TLS, y el esquema 001–006 esté aplicado con la serie MariaDB.

## Diagnóstico

### Cómo elige la base el backend

La API arranca en `api/index.ts`, que crea la aplicación de `backend-node/src/runtime.ts`. `loadConfig` en `backend-node/src/config.ts` exige `APP_ORIGIN` y `DATABASE_URL`. Abre un pool MySQL contra el host, el puerto, el usuario, la contraseña y el nombre de base de esa URL. `MYSQL_TLS=true` exige TLS con certificado verificado. Sin TLS solo admite `localhost`, `127.0.0.1` o `::1`, y solo si `MYSQL_ALLOW_INSECURE_LOCAL=true`.

No hay otro selector de base. `vercel.json` no declara variables ni una URL de base: fija el build del frontend, la redirección `/` → `/producto/` y el rewrite de `/api/:path*` hacia la función. Los dos Compose (`backend-node/compose.integration.yaml` y `compose.mariadb.integration.yaml`) crean una base desechable `goodlook_disposable_test` en `127.0.0.1:33317` con credenciales de prueba. El flujo de GitHub Actions (`.github/workflows/goodlook-product.yml`) usa esos contenedores y no define `DATABASE_URL` de MonsterASP.

El migrador genérico (`backend-node/db/migrate.mjs`) usa la misma `DATABASE_URL` y `GOODLOOK_MIGRATION_TARGET`. Con destino `preview` solo admite la identidad de `config/preview-database.json`. El lanzador `db/monsterasp-migrate.mjs` es distinto: ignora `DATABASE_URL` y queda fijado a `db80496.public.databaseasp.net`, base `db80496`, usuario `db80496`. Exige `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES` y un esquema vacío, así que no puede usarse para sembrar la base de preview ni para reescribir la base que ya tiene tablas.

`ESTADO.md` registra que el preview de Vercel y la producción `good-look.vercel.app` llegaron a apuntar a `db80496`. El panel de Vercel no está en el repositorio (`.vercel/` está ignorado) y esta revisión no lo ha consultado. El código compara host, nombre y usuario con las identidades versionadas: preview solo arranca contra `db81522`; producción sigue siendo `db80496`.

### Cómo elige la URL de la API el frontend

El piloto (`PilotApiService`) y el producto (`ProductApiService` y el resto de clientes de `/producto/`) llaman a rutas relativas `/api/...` con cookie de sesión. No hay `environment.ts` ni una URL absoluta por entorno. En local, `ng serve` proxya `/api` a `http://127.0.0.1:3000` (`FrontEndGoodLook/proxy.pilot.json`) y la API tiene que usar `APP_ORIGIN=http://localhost:4200`. En Vercel, el navegador llama a `/api` del mismo host que sirve el HTML. El entorno Preview habla con la función de ese despliegue, y esa función lee las variables del entorno Preview. El entorno Production hace lo mismo con las suyas.

La cookie de sesión es `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` y no lleva atributo `Domain`. Cada host guarda la suya. Hace falta que `APP_ORIGIN` sea exactamente el origen que abre el navegador, sin barra final: las escrituras comparan la cabecera `Origin` con ese valor y responden 403 si difiere.

El frontend legado (`goodlook.service.ts`, acceso y registro antiguos) sigue llamando a `https://appgoodlook.runasp.net/`. Es el servicio anterior, fuera de este reparto. El piloto y `/producto/` no lo usan.

### Qué impide hoy que preview use otra base

En el código, el papel `preview` (`GOODLOOK_DATA_ENV=preview` o `VERCEL_ENV=preview`) solo abre la identidad de `config/preview-database.json`. Cualquier otro host remoto, y `db80496` en particular, impide el arranque. Lo que todavía puede juntar los dos entornos es la configuración fuera del repositorio: si Preview sigue usando la URL de producción, la función nueva no arranca. El frontend no puede elegir otra base por su cuenta, porque no tiene una URL de API propia.

Tampoco hay en el repo una URL HTTPS estable de preview. Vercel crea una URL por despliegue y un alias por rama. Las escrituras solo aceptan el origen configurado en `APP_ORIGIN`.

## Dónde está `VERCEL` y `VERCEL=1`

El backend necesita que `VERCEL=1` no se exporte fuera de Vercel. El limitador de la historia [#18](https://github.com/JorgeReina/GoodLook/issues/18), en el PR [#28](https://github.com/JorgeReina/GoodLook/pull/28), todavía no está en esta rama. Su contrato, ya escrito, es: sin `VERCEL=1` la clave del cupo es la IP del socket y se ignoran las cabeceras de reenvío; con `VERCEL=1` la clave es la primera IP de `x-vercel-forwarded-for`. Un `VERCEL=1` copiado a local, a CI o a `vercel dev` confiaría en esa cabecera sin la sobrescritura del borde de Vercel.

Revisión de esta rama:

| Sitio | Qué hay |
| --- | --- |
| Código de la rama, scripts, `vercel.json`, Compose, GitHub Actions y `PILOTO.md` | No asignan `VERCEL` ni `VERCEL_ENV`. |
| `.env.example` | Deja las dos sin definir y lo dice. |
| Docker de integración | Solo variables `MYSQL_*` de la base desechable. |
| MonsterASP | Aloja MariaDB. No ejecuta esta API Node. No hay en el repo un despliegue de `backend-node` en MonsterASP que pudiera exportar `VERCEL`. El servicio legado de `runasp.net` es otra aplicación. |
| Runtime de Vercel | La [documentación de variables de sistema](https://vercel.com/docs/environment-variables/system-environment-variables) define `VERCEL=1` y `VERCEL_ENV` (`production`, `preview` o `development`) en build y en runtime cuando el proyecto tiene activado el acceso a las variables de sistema. Production y Preview reciben `VERCEL=1`. El valor no distingue el entorno: lo distingue `VERCEL_ENV`. |
| `vercel dev` | El proceso local de la CLI sí exporta `VERCEL=1` y `VERCEL_ENV=development` para imitar la plataforma. |
| `vercel env pull` | Para el entorno development, la CLI dejó de escribir las variables de sistema. Para preview y production todavía puede volcarlas a un archivo local. Ese archivo no debe cargarse en otro proceso. |

Regla operativa: no crear `VERCEL` ni `VERCEL_ENV` en el panel (ni en Development, ni en Preview, ni en Production, ni para todos los entornos). No exportarlas en la shell, en PowerShell, en Compose ni en Actions. Activar en el proyecto el acceso a las variables de sistema para que la plataforma las inyecte sola. La salvaguarda de esta rama usa `VERCEL=1` solo para negarse a abrir `db80496` cuando `VERCEL_ENV` no es `production`.

## Propuesta de variables

Los tres papeles son `development`, `preview` y `production`. En Vercel se configuran en el entorno del mismo nombre. Una variable compartida por todos los entornos anula la separación: `DATABASE_URL`, `APP_ORIGIN`, `AUTH_LIMIT_SECRET` y `GOODLOOK_DATA_ENV` tienen que existir por entorno, no una sola vez.

| Variable | Desarrollo (local / CI) | Preview (Vercel) | Production (Vercel) |
| --- | --- | --- | --- |
| `GOODLOOK_DATA_ENV` | `development` en local con Docker. Sin esta variable ni `VERCEL_ENV`, el papel queda sin declarar | `preview` | `production` |
| `DATABASE_URL` | `mysql://goodlook_test:…@127.0.0.1:33317/goodlook_disposable_test` | URL de `db81522.public.databaseasp.net` / `db81522` / `db81522`, puerto 3306, TLS | La URL actual de `db80496.public.databaseasp.net` / `db80496` / `db80496` |
| `MYSQL_TLS` | sin definir | `true` | `true` |
| `MYSQL_ALLOW_INSECURE_LOCAL` | `true` solo en loopback | sin definir | sin definir |
| `APP_ORIGIN` | `http://localhost:4200` | `https://` + alias estable de la rama, sin barra final | `https://good-look.vercel.app` |
| `AUTH_LIMIT_SECRET` | el valor de demostración, solo en local | secreto hex nuevo, de al menos 32 bytes, distinto del de producción | el secreto que ya usa producción |
| Identidad de producción | `backend-node/config/production-database.json` (host, nombre y usuario; no es un secreto) | el mismo archivo, incluido en el despliegue | el mismo archivo |
| Identidad de preview | `backend-node/config/preview-database.json` (host, puerto, nombre y usuario; no es un secreto) | el mismo archivo | el mismo archivo |
| `GOODLOOK_ALLOW_PRODUCTION_DATABASE` | sin definir. `YES` solo en una shell local que deba abrir esa identidad a propósito | sin definir | sin definir |
| `VERCEL`, `VERCEL_ENV` | sin definir | las inyecta la plataforma | las inyecta la plataforma |
| `GOODLOOK_MIGRATION_TARGET` | `test` o `development` en el migrador local | `preview`, solo en la shell que migra, no en el despliegue | no usarla en el despliegue |
| `GOODLOOK_MIGRATION_DIALECT` | `mysql` o `mariadb` según el contenedor | `mariadb` (el destino `preview` lo usa si no se declara; `db81522` es MariaDB 10.11.19) | no usarla en el despliegue |

`GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES` queda fuera de Vercel. Solo acompaña una migración consciente de la identidad configurada. `GOODLOOK_ALLOW_PRODUCTION_DATABASE=YES` tampoco se pone en Vercel: no abre esa identidad si el papel es preview.

En Preview, `APP_ORIGIN` es el alias de rama que Vercel muestra en el despliegue (estable mientras esa rama reciba los previews). Las URLs de un commit concreto tienen otro host: quien las abra recibe 403 en las escrituras. Frontend y QA usan el alias. La cookie no se comparte con `good-look.vercel.app`.

## Salvaguarda

Al arrancar, y también al limpiar contadores con `cleanup-rate-limits`, la API calcula el papel:

- `GOODLOOK_DATA_ENV` manda si está definido (`development`, `preview` o `production`).
- Si no, `VERCEL_ENV` (`development`, `preview` o `production`) fija el papel.
- Si no hay ninguna de las dos, el papel queda `undeclared`. No se hereda `development`.
- Si `GOODLOOK_DATA_ENV` contradice un `VERCEL_ENV` de preview o production, el proceso se detiene.

Las identidades se leen de `backend-node/config/production-database.json` y `backend-node/config/preview-database.json`: host, nombre y usuario (preview también declara el puerto 3306). Son las únicas copias. No son secretos. Un campo vacío deja esa identidad sin configurar.

El proceso se niega a abrir la identidad de producción salvo que el papel sea `production` (`GOODLOOK_DATA_ENV=production` o `VERCEL_ENV=production`). `GOODLOOK_DATA_ENV=development` no basta. La excepción local `GOODLOOK_ALLOW_PRODUCTION_DATABASE=YES` abre esa identidad fuera de preview; en preview se ignora. `VERCEL=1` sin `VERCEL_ENV=production` tampoco puede abrirla.

El papel `preview` solo abre la identidad de preview: los tres campos tienen que coincidir. Un host desconocido, un usuario o un nombre distintos, o la identidad de `db80496`, impiden el arranque. La comparación de producción es por host, nombre o usuario (cualquiera basta para bloquear). La de preview exige los tres. No distingue mayúsculas y admite un punto final en el host. El mensaje no incluye la URL ni la contraseña.

Sin papel declarado, cualquier base que no sea loopback (`localhost`, `127.0.0.1` o `::1`) impide el arranque. Un preview sin variables de sistema y con la URL antigua de producción no arranca. El loopback sigue sirviendo para Docker, CI y las pruebas.

Si el archivo de producción falta o está incompleto, development y un papel sin declarar rechazan toda base remota. Si el de preview falta o está incompleto, el papel `preview` rechaza toda base remota. El papel `production` explícito sí puede arrancar si falta el archivo de producción, porque parar el dominio público por un archivo ausente sería otro incidente; en ese caso la guarda no clasifica el destino y hay que restaurar el archivo antes de fiarse de preview.

El migrador aplica el mismo corte: el destino `preview` solo acepta la identidad de `preview-database.json` y rechaza `db80496`. Los destinos `test` y `development` rechazan la identidad de producción, también con `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES`. Sin identidad de producción configurada, un destino que no sea `production` ni `preview` rechaza una base remota. El destino `production` sigue exigiendo esa excepción de migración.

## Motor de preview frente a producción

Producción (`db80496`) y preview (`db81522`) son la misma serie: MariaDB 10.11.19 (`10.11.19-MariaDB-log`). El diagnóstico de `db81522` (run [45885563808](https://github.com/JorgeReina/GoodLook/actions/runs/45885563808)) midió `character_set_server=utf8mb4`, `collation_server=utf8mb4_general_ci`, `sql_mode=IGNORE_SPACE,NO_ENGINE_SUBSTITUTION` y 0 tablas. `config/preview-database.json` declara `engine: mariadb` y `version: 10.11`. El destino `preview` de `db/migrate.mjs` aplica `migrations-mariadb/` (el mismo dialecto que producción). No usar la serie MySQL sobre esa base: los checksums son independientes.

La colación por defecto del servidor es `utf8mb4_general_ci`; las migraciones MariaDB fijan `utf8mb4_unicode_520_ci` en las tablas. No es MySQL 8 ni `utf8mb4_0900_ai_ci`. MonsterASP recomienda TLS `SslMode=Preferred`; esta API, en remoto, sigue exigiendo `MYSQL_TLS=true` con certificado verificado contra la CA del sistema. Si esa verificación falla, el migrador se detiene con un mensaje fijo y no desactiva `rejectUnauthorized`.

## Migraciones 001 a 006 en la base de preview

La serie MySQL está en `backend-node/db/migrations/`; la MariaDB, en `migrations-mariadb/`. En ambas: `001_initial`, `002_professional_invitations`, `003_business_visibility`, `004_auth_rate_limits`, `005_product_profiles` y `006_booking_integrity`. El ejecutor las aplica en ese orden, registra checksum y estado, y no reescribe una versión ya aplicada.

1. La identidad de preview ya está creada: host `db81522.public.databaseasp.net`, puerto 3306, base `db81522`, usuario `db81522`. Anotar la contraseña fuera del repositorio. No reutilizar la de `db80496`.
2. Con el acceso remoto ya permitido, comprobar TLS y la versión sin imprimir la contraseña. Guardar la URL en `backend-node/.env.preview` (el patrón `.env.*` está ignorado) y, desde `backend-node`:

```bash
node --env-file=.env.preview --input-type=module <<'EOF'
import mysql from 'mysql2/promise';
const url = new URL(process.env.DATABASE_URL);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  ssl: { rejectUnauthorized: true },
});
const [identity] = await connection.query('SELECT DATABASE() AS db, VERSION() AS version');
const [tls] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
console.log(identity[0].db, identity[0].version, tls[0] && tls[0].Value);
await connection.end();
EOF
```

El nombre impreso tiene que ser `db81522`. `Ssl_cipher` tiene que venir informado. `VERSION()` tiene que ser `10.11.19-MariaDB-log`, la misma cadena que producción. Si no hay cifrado de sesión, parar. Si la conexión falla por certificado no verificable, el error del migrador lo dice sin imprimir la URL; no poner `rejectUnauthorized=false`. Esa decisión queda fuera de este código.

3. En el mismo archivo, además de `DATABASE_URL` y `MYSQL_TLS=true`, poner `GOODLOOK_MIGRATION_TARGET=preview` y `GOODLOOK_MIGRATION_DIALECT=mariadb`. El destino `preview` ya elige `mariadb` si el dialecto no se declara. No poner `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS` ni `NODE_ENV=production`. Desde `backend-node` ejecutar `node --env-file=.env.preview db/migrate.mjs`.
4. Volver a consultar `schema_migrations`: las versiones `001` a `006` con estado `applied`. Si una queda en `applying`, no borrarla ni relanzar a ciegas: el DDL de MySQL confirma a medias. Restaurar no aplica (la base estaba vacía); revisar el esquema y, si sigue siendo desechable, recrearla y repetir.
5. Borrar `.env.preview` cuando las variables ya estén en Vercel. No pegar la URL en el issue, en el chat ni en el historial de la shell.

`db/monsterasp-migrate.mjs` no participa en estos pasos.

## Acciones manuales

Coste consultado el 2026-11-20 en la [lista de precios](https://www.monsterasp.net/Pricing/) y en la ayuda de [crear una base MySQL](https://help.monsterasp.net/databases/mysql/create-database) y de [planes Free y Premium](https://help.monsterasp.net/getting-started/first-steps/free-vs-premium). No se ha entrado en la cuenta, así que el hueco real de bases hay que confirmarlo en el panel.

### MonsterASP

1. Dejar `db80496` como está. No borrarla, no reutilizar su usuario ni su contraseña, y no cambiar su host.
2. La cuenta Free ya aloja `db81522` además de `db80496`. No crear otra base. El plan Free publicado lista una base de 1 GB: si el panel limita el tamaño o el número, no ampliar ni tocar `db80496` desde esta historia.
3. No reutilizar el usuario ni la contraseña de `db80496` en `db81522`.
4. Activar el acceso remoto de esa base y dejarlo activo. La API corre en Vercel, no dentro de MonsterASP, y las IPs de salida de Vercel no son una sola. En Premium, una lista blanca de IPs que no cubra a Vercel dejaría el preview sin base. El plan Free publicado no ofrece esa lista. Mantener TLS verificado (`SslMode=Preferred` en el panel; `MYSQL_TLS=true` en la API) y una contraseña propia.
5. Aplicar las migraciones 001 a 006 como en la sección anterior, con la serie MariaDB.
6. Si un cambio de plan moviera el host de `db80496`, parar. Producción seguiría apuntando al host viejo y la salvaguarda dejaría de reconocer la base. No forma parte de esta historia cambiar la identidad de producción.

### Vercel

El proyecto ya despliega previews y producción. Las variables por entorno y las URLs de preview entran en el plan Hobby, a 0 USD. No hace falta un dominio propio.

1. Activar el acceso a las variables de sistema del proyecto, para que existan `VERCEL=1` y `VERCEL_ENV`. No crear esas claves a mano.
2. En Settings → Environment Variables, quitar de «All Environments» `DATABASE_URL`, `MYSQL_TLS`, `APP_ORIGIN`, `AUTH_LIMIT_SECRET` y `GOODLOOK_DATA_ENV` si estuvieran definidas ahí. Volver a crearlas por entorno. Los valores sensibles se pegan en el panel, no en Git.
3. Production, sin cambiar la URL de `db80496`: `GOODLOOK_DATA_ENV=production`, `MYSQL_TLS=true`, `APP_ORIGIN=https://good-look.vercel.app`, y el `DATABASE_URL` y el `AUTH_LIMIT_SECRET` que ya usa producción. Redesplegar producción solo si se ha tocado alguna de estas variables. Con el código nuevo, producción sigue arrancando contra `db80496` cuando `VERCEL_ENV=production`.
4. Preview: `GOODLOOK_DATA_ENV=preview`, `MYSQL_TLS=true`, `DATABASE_URL` de `db81522` (host `db81522.public.databaseasp.net`, puerto 3306, base y usuario `db81522`), `AUTH_LIMIT_SECRET` distinto (32 bytes hex aleatorios) y `APP_ORIGIN` igual a `https://` más el alias de rama que muestre el último despliegue de `work/goodlook-migracion`. Guardar el alias y pasarlo a Frontend y QA. Es la URL de [#14](https://github.com/JorgeReina/GoodLook/issues/14), [#15](https://github.com/JorgeReina/GoodLook/issues/15) y [#19](https://github.com/JorgeReina/GoodLook/issues/19).
5. Development de Vercel, el que usa `vercel dev` y `vercel env pull` sin entorno: no poner la URL de producción ni la de preview. El desarrollo de cada día sigue en Docker, como `PILOTO.md`.
6. Redesplegar el preview después de guardar las variables. Un despliegue ya creado no las recibe. Si la URL de Preview siguiera siendo la de `db80496`, la función nueva no arranca y el registro muestra `Preview cannot use the production database identity`, sin la contraseña.
7. Comprobar, sin datos personales: `GET` del catálogo en el alias de preview, una reserva de prueba, y la ausencia de esa cita en `https://good-look.vercel.app`. Confirmar que el esquema de preview tiene `001`–`006` en `applied` y que la conexión usa TLS. Con eso se pueden cerrar los criterios de [#11](https://github.com/JorgeReina/GoodLook/issues/11). Esta revisión no los da por cumplidos.

Si la protección de despliegue de Vercel está activa, Frontend y QA necesitan acceso al alias (equipo o bypass). Eso también se confirma en el panel.

## Vuelta atrás

- Código: revertir el commit. No hay cambio de esquema ni de datos. Producción con `VERCEL_ENV=production` sigue pudiendo usar `db80496` mientras el commit esté integrado.
- Variables: restaurar en Preview la `DATABASE_URL` anterior deja el preview otra vez sobre `db80496`, y el código nuevo impedirá que ese preview arranque. Para volver al comportamiento compartido hay que revertir también el código. No es el estado que pide la historia.
- Base nueva: se puede borrar en MonsterASP después de quitar su URL de Vercel y de comprobar que producción sigue en `db80496`. No borrar `db80496`.
- Un preview de esta rama, si Vercel lo construye solo al hacer push, fallará el arranque de la API mientras sus variables sigan apuntando a `db80496`. Ese fallo no redespliega `good-look.vercel.app`.

## Qué queda fuera

No se han modificado variables, despliegues ni secretos. El PR no cierra [#11](https://github.com/JorgeReina/GoodLook/issues/11): falta el reparto real de variables en Vercel y aplicar 001–006 con la serie MariaDB sobre `db81522` (vacía, MariaDB 10.11.19). La verificación TLS estricta contra el certificado de MonsterASP aún no se ha ensayado desde esta rama.
