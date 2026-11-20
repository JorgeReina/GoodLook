# Entornos de datos: desarrollo, preview y producción

Fecha de la revisión: 2026-11-20. Rama de partida: `work/goodlook-migracion` en `ee32d89`. Esta revisión lee el repositorio. No ha creado bases, no ha cambiado variables en Vercel ni en MonsterASP, no ha desplegado y no ha leído secretos.

La historia [#11](https://github.com/JorgeReina/GoodLook/issues/11) pide una base MariaDB de preview distinta de la de producción, con TLS y esquema 006, para que las pruebas que escriben no alteren el dominio público. Frontend y QA la necesitan como URL HTTPS en [#15](https://github.com/JorgeReina/GoodLook/issues/15) (PWA en dispositivos), [#14](https://github.com/JorgeReina/GoodLook/issues/14) (recorrido por roles) y [#19](https://github.com/JorgeReina/GoodLook/issues/19) (teclado, zoom y estados). Este documento deja el código preparado y la lista de acciones manuales. La separación todavía no está hecha hasta que se ejecuten.

## Diagnóstico

### Cómo elige la base el backend

La API arranca en `api/index.ts`, que crea la aplicación de `backend-node/src/runtime.ts`. `loadConfig` en `backend-node/src/config.ts` exige `APP_ORIGIN` y `DATABASE_URL`. Abre un pool MySQL contra el host, el puerto, el usuario, la contraseña y el nombre de base de esa URL. `MYSQL_TLS=true` exige TLS con certificado verificado. Sin TLS solo admite `localhost`, `127.0.0.1` o `::1`, y solo si `MYSQL_ALLOW_INSECURE_LOCAL=true`.

No hay otro selector de base. `vercel.json` no declara variables ni una URL de base: fija el build del frontend, la redirección `/` → `/producto/` y el rewrite de `/api/:path*` hacia la función. Los dos Compose (`backend-node/compose.integration.yaml` y `compose.mariadb.integration.yaml`) crean una base desechable `goodlook_disposable_test` en `127.0.0.1:33317` con credenciales de prueba. El flujo de GitHub Actions (`.github/workflows/goodlook-product.yml`) usa esos contenedores y no define `DATABASE_URL` de MonsterASP.

El migrador genérico (`backend-node/db/migrate.mjs`) usa la misma `DATABASE_URL` y `GOODLOOK_MIGRATION_TARGET`. El lanzador `db/monsterasp-migrate.mjs` es distinto: ignora `DATABASE_URL` y queda fijado a `db80496.public.databaseasp.net`, base `db80496`, usuario `db80496`. A partir de esta revisión exige `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES` y sigue exigiendo un esquema vacío, así que no puede usarse para sembrar la base de preview ni para reescribir la base que ya tiene tablas.

`ESTADO.md` registra que el preview de Vercel y la producción `good-look.vercel.app` apuntan a `db80496`. El panel de Vercel no está en el repositorio (`.vercel/` está ignorado) y esta revisión no lo ha consultado. El código, por sí solo, conecta con cualquier URL válida. Hasta esta revisión nada comparaba el host, el nombre o el usuario con `db80496`.

### Cómo elige la URL de la API el frontend

El piloto (`PilotApiService`) y el producto (`ProductApiService` y el resto de clientes de `/producto/`) llaman a rutas relativas `/api/...` con cookie de sesión. No hay `environment.ts` ni una URL absoluta por entorno. En local, `ng serve` proxya `/api` a `http://127.0.0.1:3000` (`FrontEndGoodLook/proxy.pilot.json`) y la API tiene que usar `APP_ORIGIN=http://localhost:4200`. En Vercel, el navegador llama a `/api` del mismo host que sirve el HTML. El entorno Preview habla con la función de ese despliegue, y esa función lee las variables del entorno Preview. El entorno Production hace lo mismo con las suyas.

La cookie de sesión es `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` y no lleva atributo `Domain`. Cada host guarda la suya. Hace falta que `APP_ORIGIN` sea exactamente el origen que abre el navegador, sin barra final: las escrituras comparan la cabecera `Origin` con ese valor y responden 403 si difiere.

El frontend legado (`goodlook.service.ts`, acceso y registro antiguos) sigue llamando a `https://appgoodlook.runasp.net/`. Es el servicio anterior, fuera de este reparto. El piloto y `/producto/` no lo usan.

### Qué impide hoy que preview use otra base

En el código, nada lo impide: una `DATABASE_URL` distinta en el entorno Preview de Vercel basta para que ese despliegue abra otra base. Lo que hoy los junta es la configuración fuera del repositorio. Si `DATABASE_URL` está definida para todos los entornos, o repetida en Preview y Production, los dos escriben en `db80496`. El frontend no puede elegir otra base por su cuenta, porque no tiene una URL de API propia.

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
| `GOODLOOK_DATA_ENV` | `development` | `preview` | `production` |
| `DATABASE_URL` | `mysql://goodlook_test:…@127.0.0.1:33317/goodlook_disposable_test` | URL nueva. Host, nombre y usuario distintos de `db80496` | La URL actual de `db80496.public.databaseasp.net` / `db80496` / `db80496` |
| `MYSQL_TLS` | sin definir | `true` | `true` |
| `MYSQL_ALLOW_INSECURE_LOCAL` | `true` solo en loopback | sin definir | sin definir |
| `APP_ORIGIN` | `http://localhost:4200` | `https://` + alias estable de la rama, sin barra final | `https://good-look.vercel.app` |
| `AUTH_LIMIT_SECRET` | el valor de demostración, solo en local | secreto hex nuevo, de al menos 32 bytes, distinto del de producción | el secreto que ya usa producción |
| `VERCEL`, `VERCEL_ENV` | sin definir | las inyecta la plataforma | las inyecta la plataforma |
| `GOODLOOK_MIGRATION_TARGET` | `test` o `development` en el migrador local | `preview`, solo en la shell que migra, no en el despliegue | no usarla en el despliegue |
| `GOODLOOK_MIGRATION_DIALECT` | `mysql` o `mariadb` según el contenedor | `mariadb` en la shell que migra | no usarla en el despliegue |

`GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS=YES` queda fuera de Vercel. Solo acompaña una migración consciente de `db80496`.

En Preview, `APP_ORIGIN` es el alias de rama que Vercel muestra en el despliegue (estable mientras esa rama reciba los previews). Las URLs de un commit concreto tienen otro host: quien las abra recibe 403 en las escrituras. Frontend y QA usan el alias. La cookie no se comparte con `good-look.vercel.app`.

## Salvaguarda

Al arrancar, y también al limpiar contadores con `cleanup-rate-limits`, la API calcula el papel:

- `GOODLOOK_DATA_ENV` manda si está definido (`development`, `preview` o `production`).
- Si no, `VERCEL_ENV=preview` o `VERCEL_ENV=production` fijan el papel.
- En cualquier otro caso el papel es `development`.
- Si `GOODLOOK_DATA_ENV` contradice un `VERCEL_ENV` de preview o production, el proceso se detiene.

Si el papel es `preview` y el host, el nombre de base o el usuario coinciden con `db80496` (sin distinguir mayúsculas, y con un punto final en el host), el proceso se detiene. El mismo corte se aplica cuando `VERCEL=1` y `VERCEL_ENV` no es `production`, aunque alguien marque el papel como `production` para intentar saltárselo. Un valor de `VERCEL` distinto de `1` también detiene el arranque. El mensaje no incluye la URL ni la contraseña.

El migrador rechaza esa identidad en los destinos `test`, `development` y `preview`, también con la excepción de producción activada. El destino `production` sigue exigiendo la excepción.

Queda un hueco consciente: un proceso local sin `VERCEL` todavía puede abrir `db80496`. Sirve para una intervención de release y no convierte un preview de Vercel en esa base. La salvaguarda tampoco reconoce la base si algún día cambia de host, de nombre y de usuario a la vez. Si la identidad de producción cambia, hay que actualizar a la vez `backend-node/db/production-identity.mjs` y `backend-node/src/data-guard.ts` antes de fiarse del corte. El test de paridad falla si las dos copias se separan.

Otra condición para que el corte vea el preview de Vercel: el proyecto debe exponer las variables de sistema, y Preview debe llevar `GOODLOOK_DATA_ENV=preview`. Con las dos, un olvido de una de ellas sigue bastando. Sin ninguna, un despliegue preview con la URL antigua arrancaría como desarrollo y abriría `db80496`.

## Migraciones 001 a 006 en la base de preview

La serie MariaDB está en `backend-node/db/migrations-mariadb/`: `001_initial`, `002_professional_invitations`, `003_business_visibility`, `004_auth_rate_limits`, `005_product_profiles` y `006_booking_integrity`. El ejecutor las aplica en ese orden, registra checksum y estado, y no reescribe una versión ya aplicada.

1. Crear la base vacía y anotar, fuera del repositorio, su host, nombre, usuario y contraseña. Tienen que ser distintos de `db80496` en los tres primeros.
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

El nombre impreso tiene que ser el de la base nueva. `Ssl_cipher` tiene que venir informado. `VERSION()` tiene que ser MariaDB 10.11: `db80496` se midió en 10.11.19 y la serie se ensayó ahí. La ayuda pública de MonsterASP describe las bases MySQL nuevas como MariaDB 10.10. Si la versión no es 10.11, parar y revisar antes de migrar. El ejecutor acepta cualquier cadena MariaDB; esta parada es del operador.

3. En el mismo archivo, además de `DATABASE_URL` y `MYSQL_TLS=true`, poner `GOODLOOK_MIGRATION_TARGET=preview` y `GOODLOOK_MIGRATION_DIALECT=mariadb`. No poner `GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS` ni `NODE_ENV=production`. Ejecutar `node --env-file=.env.preview db/migrate.mjs`.
4. Volver a consultar `schema_migrations`: las versiones `001` a `006` con estado `applied`. Si una queda en `applying`, no borrarla ni relanzar a ciegas: el DDL de MySQL confirma a medias. Restaurar no aplica (la base estaba vacía); revisar el esquema y, si sigue siendo desechable, recrearla y repetir.
5. Borrar `.env.preview` cuando las variables ya estén en Vercel. No pegar la URL en el issue, en el chat ni en el historial de la shell.

`db/monsterasp-migrate.mjs` no participa en estos pasos.

## Acciones manuales

Coste consultado el 2026-11-20 en la [lista de precios](https://www.monsterasp.net/Pricing/) y en la ayuda de [crear una base MySQL](https://help.monsterasp.net/databases/mysql/create-database) y de [planes Free y Premium](https://help.monsterasp.net/getting-started/first-steps/free-vs-premium). No se ha entrado en la cuenta, así que el hueco real de bases hay que confirmarlo en el panel.

### MonsterASP

1. Dejar `db80496` como está. No borrarla, no reutilizar su usuario ni su contraseña, y no cambiar su host.
2. Confirmar cuántas bases permite la cuenta. El plan Free publicado incluye una base de 1 GB. Si `db80496` ocupa ese hueco, hace falta capacidad nueva:
   - Hueco ya pagado y libre: 0 USD.
   - Premium Single, el plan publicado más pequeño con dos bases: 1,95 USD al mes el primer año, facturado por año (23,40 USD), y 2,50 USD al mes al renovar. Incluye dos bases de 2 GB y copias diarias 14 días. Garantía de devolución de 14 días.
   - Complemento de base adicional, solo sobre Premium: la lista marca 1 USD al mes el primer año y 1,25 USD al mes al renovar. La ayuda del complemento dice que ese extra añade dos bases. El asistente de la cuenta muestra el importe que aplica.
3. Crear la base con Add database, tipo MySQL 8.0 (MariaDB), datacenter EU, en un hueco distinto del de `db80496`. MonsterASP crea el usuario principal con la base. Anotar el host `db….public.databaseasp.net`, el nombre y el usuario: los tres tienen que diferir de `db80496`.
4. Activar el acceso remoto de esa base y dejarlo activo. La API corre en Vercel, no dentro de MonsterASP, y las IPs de salida de Vercel no son una sola. En Premium, una lista blanca de IPs que no cubra a Vercel dejaría el preview sin base. El plan Free publicado no ofrece esa lista. Mantener TLS verificado y una contraseña propia.
5. Aplicar las migraciones 001 a 006 como en la sección anterior.
6. Si un cambio de plan moviera el host de `db80496`, parar. Producción seguiría apuntando al host viejo y la salvaguarda dejaría de reconocer la base. No forma parte de esta historia cambiar la identidad de producción.

### Vercel

El proyecto ya despliega previews y producción. Las variables por entorno y las URLs de preview entran en el plan Hobby, a 0 USD. No hace falta un dominio propio.

1. Activar el acceso a las variables de sistema del proyecto, para que existan `VERCEL=1` y `VERCEL_ENV`. No crear esas claves a mano.
2. En Settings → Environment Variables, quitar de «All Environments» `DATABASE_URL`, `MYSQL_TLS`, `APP_ORIGIN`, `AUTH_LIMIT_SECRET` y `GOODLOOK_DATA_ENV` si estuvieran definidas ahí. Volver a crearlas por entorno. Los valores sensibles se pegan en el panel, no en Git.
3. Production, sin cambiar la URL de `db80496`: `GOODLOOK_DATA_ENV=production`, `MYSQL_TLS=true`, `APP_ORIGIN=https://good-look.vercel.app`, y el `DATABASE_URL` y el `AUTH_LIMIT_SECRET` que ya usa producción. Redesplegar producción solo si se ha tocado alguna de estas variables. Con el código nuevo, producción sigue arrancando contra `db80496` cuando `VERCEL_ENV=production`.
4. Preview: `GOODLOOK_DATA_ENV=preview`, `MYSQL_TLS=true`, `DATABASE_URL` de la base nueva, `AUTH_LIMIT_SECRET` distinto (32 bytes hex aleatorios) y `APP_ORIGIN` igual a `https://` más el alias de rama que muestre el último despliegue de `work/goodlook-migracion`. Guardar el alias y pasarlo a Frontend y QA. Es la URL de [#14](https://github.com/JorgeReina/GoodLook/issues/14), [#15](https://github.com/JorgeReina/GoodLook/issues/15) y [#19](https://github.com/JorgeReina/GoodLook/issues/19).
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

No se han creado ni modificado bases, variables, despliegues ni secretos. El PR no cierra [#11](https://github.com/JorgeReina/GoodLook/issues/11): faltan la base verificada y el reparto real de variables.
