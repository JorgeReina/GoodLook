# Piloto de la nueva API

La ruta `/piloto` utiliza rutas relativas `/api` con cookies HttpOnly, sin localStorage ni token de la versión anterior. Requiere la nueva API y una base aislada con negocios, servicios, asociaciones y horarios de prueba; no funciona con la API .NET. El backend debe permitir el mismo origen del navegador mediante `APP_ORIGIN`.

## Dos formas de abrir el piloto

El mismo piloto se abre de dos maneras. `/piloto` se mantiene durante el corte como entrada temporal y se retira después, en el [issue #34](https://github.com/JorgeReina/GoodLook/issues/34). La aplicación heredada que también abre esta ruta está congelada. La decisión está en el [issue #17](https://github.com/JorgeReina/GoodLook/issues/17).

- **Build standalone.** `src/main.pilot.ts` arranca `PilotComponent` como aplicación propia. Desde `FrontEndGoodLook`, `npm run build -- --configuration=pilot` deja ese `index.html` en `dist/front-end-good-look`. El `npm run build` de la raíz hace ese paso y, en el paquete, Vercel reescribe `/piloto` a ese archivo.
- **Ruta de la aplicación heredada.** `npx ng serve --host localhost --proxy-config proxy.pilot.json` arranca `AppModule` (`src/main.ts`). El enrutador carga el mismo componente en `http://localhost:4200/piloto`.

Para desarrollo local, usar Node 24 e instalar primero las dependencias del lockfile desde `FrontEndGoodLook` con `npm ci`. Una instalación anterior de Angular 16 no es compatible con la configuración actual y puede causar el error de `browserTarget`. Con la API escuchando en 127.0.0.1:3000 y `APP_ORIGIN=http://localhost:4200`, ejecutar `npx ng serve --host localhost --proxy-config proxy.pilot.json` y abrir `http://localhost:4200/piloto`. Usar localhost de forma coherente: el backend valida el Origin y las cookies son Secure. En producción se necesita un proxy HTTPS mismo origen; no exponer el backend de desarrollo.

El catálogo debe contener datos. El piloto consulta horarios orientativos de los próximos siete días para la combinación seleccionada, mostrados en la zona horaria del negocio con su desplazamiento UTC. La API comprueba de nuevo la disponibilidad al reservar; si hay conflicto hay que actualizar los horarios. Las combinaciones sin asociación pueden rechazarse. El piloto requiere pruebas funcionales de navegador y MySQL antes de utilizarse con clientes.

## Demo local con datos sintéticos

Usar únicamente Docker Desktop local con contenedores Linux y Node 24. Comprobar que los puertos 33317, 3000 y 4200 estén libres y no reutilizar una base existente. Instalar las dependencias con `npm ci` en `backend-node` y `FrontEndGoodLook`. En una consola PowerShell, desde `backend-node`, ejecutar:

```powershell
./scripts/demo-local.ps1 -Dialect mysql -Mode interactive
```

Esperar a que indique que la base está lista. El lanzador crea un contenedor propio con MySQL 8.4, almacenamiento temporal, puerto 33317 ligado a `127.0.0.1`, migraciones y catálogo ficticio. En otra consola, desde `backend-node`, iniciar la API ligada a loopback:

```powershell
$env:DATABASE_URL = 'mysql://goodlook_test:local_test_only_password@127.0.0.1:33317/goodlook_disposable_test'
$env:MYSQL_ALLOW_INSECURE_LOCAL = 'true'
$env:APP_ORIGIN = 'http://localhost:4200'
$env:AUTH_LIMIT_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
node --import tsx --input-type=module -e "import {createRuntimeApp} from './src/runtime.ts'; createRuntimeApp().listen(3000, '127.0.0.1')"
```

Estas credenciales y el secreto son exclusivamente para la demo desechable. En una tercera consola, desde `FrontEndGoodLook`, ejecutar `npx ng serve --host localhost --proxy-config proxy.pilot.json` y abrir `http://localhost:4200/piloto`. Crear una cuenta con datos ficticios, iniciar sesión, seleccionar **DEMO LOCAL**, un servicio y un profesional, elegir un hueco y solicitar la cita. En **Mis próximas citas**, cargar los próximos 30 días; recargar y repetir la consulta para comprobar que la cita sigue presente durante la demo.

Para terminar, detener Angular y la API, y pulsar Enter en la consola interactiva de la demo. El 19-11-2026 se verificaron Enter y Ctrl+C en una consola PTY de Windows: ambos retiraron el contenedor y la red de la demo. Una interrupción forzada o un proceso sin consola puede impedir la limpieza: comprobar que no queden recursos propios y no eliminar contenedores ajenos. Los datos temporales desaparecen al retirar el contenedor.

En esa fecha se completó el recorrido descrito con Chrome Headless, Playwright Core temporal y MySQL 8.4 local: registro, acceso, selección de catálogo, disponibilidad, reserva y consulta persistente tras recarga. La automatización utilizada fue temporal y no forma parte de la suite del repositorio; la comprobación es reproducible manualmente con los pasos anteriores. No cubre otros roles, errores, concurrencia ni despliegues remotos.

## Producto instalable y paquete de entrega

Desde la raíz, `npm run build` compila el piloto y el producto en `FrontEndGoodLook/dist/front-end-good-look`. El verificador comprueba las dos entradas HTML, el manifiesto, los iconos y el alcance del service worker. La configuración de entrega dirige `/` a `/producto/`; `/piloto` sigue sirviendo el piloto. La función `api/index.ts` recibe `/api/...` en el mismo origen. Las rutas profundas de producto se resuelven en su HTML, y el manifiesto y los archivos del worker se sirven como recursos independientes.

El service worker se instala en el ámbito `/producto/` sobre HTTPS o loopback. Guarda la interfaz y los iconos para abrir la aplicación sin red. Acceso, catálogo, agenda, citas y reservas requieren conexión. En caso de error de transporte durante una reserva, conservar el intento para confirmar de nuevo la misma solicitud cuando vuelva la red. La aplicación avisa cuando hay una actualización y solo recarga tras la acción del usuario.

### Verificación local

Desde la raíz, con Node 24.22.3 o compatible y Docker Desktop en contexto Linux, instalar dependencias y compilar. El arnés de Playwright sirve el build y la API en el mismo origen local y utiliza una base efímera propia en el puerto 33317.

```sh
npm ci --prefix backend-node
npm run build --prefix backend-node
npm run build
cd FrontEndGoodLook
npx playwright install chromium
npm run test:e2e
```

En Android con Chrome, abrir la URL de pruebas vía HTTPS y usar la instalación del navegador. En iOS con Safari, usar Compartir, Añadir a pantalla de inicio y abrir GoodLook desde el icono. En cada dispositivo, probar entrada inicial, acceso, cierre de sesión, recarga sin conexión, intento de reserva sin red y actualización del build. Registrar modelo, versión de navegador y resultado. Las pruebas automatizadas de Chromium en escritorio se registran por separado.

### Corte propuesto

1. Integrar mediante PR hacia `main` y verificar el SHA candidato, sus builds y las comprobaciones de CI. Las pruebas que escriben requieren un destino aislado de producción. Reservar MonsterASP para la entrega real.
2. Verificar el proyecto y entorno Vercel, el origen HTTPS exacto de `APP_ORIGIN`, TLS con certificado verificado en `DATABASE_URL`, `MYSQL_TLS=true` y gestión de `AUTH_LIMIT_SECRET` mediante variables protegidas. Confirmar el esquema MariaDB 006, el historial y una copia con restauración ensayada. Esta tanda usa el esquema existente.
3. Preparar y comprobar el artefacto. Revisar el proxy, las cookies Secure y HttpOnly y las barreras de autorización. Comprobar `/`, `/piloto`, `/producto/`, una ruta profunda, el manifiesto, `ngsw.json`, el JavaScript del worker y respuestas JSON de catálogo y sesión. Mantener separada la promoción a producción.
4. Tras promover, confirmar el SHA que sirve el dominio y repetir las comprobaciones HTTP y de navegador. Si hay regresión, volver a la revisión de aplicación compatible con el esquema vigente y comprobar de nuevo la sesión y las reservas. Restaurar base solo si corresponde al fallo y tras decidir cómo conservar las escrituras posteriores a la copia.

## Vigencia

`/piloto` se mantiene durante el corte. Es temporal: no sustituye al producto de `/producto/` y su retirada está prevista después del corte. Esa retirada se revisa en el [issue #34](https://github.com/JorgeReina/GoodLook/issues/34), junto con la eliminación de la aplicación heredada. La decisión está en el [issue #17](https://github.com/JorgeReina/GoodLook/issues/17). El aviso junto al código está en [src/app/pilot/README.md](src/app/pilot/README.md). La aplicación heredada que hoy también abre esta ruta está congelada; el aviso está en [src/app/README.md](src/app/README.md).
