# Piloto de la nueva API

La ruta `/piloto` utiliza rutas relativas `/api` con cookies HttpOnly, sin localStorage ni token de la versión anterior. Requiere la nueva API y una base aislada con negocios, servicios, asociaciones y horarios de prueba; no funciona con la API .NET. El backend debe permitir el mismo origen del navegador mediante `APP_ORIGIN`.

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

## Empaquetado aislado para Vercel

La configuración de la raíz construye exclusivamente el componente `/piloto` como aplicación independiente; no compila ni navega las pantallas antiguas ni su URL de backend. La función `api/index.ts` recibe las peticiones `/api/...` en el mismo origen y exporta la aplicación Express sin abrir un puerto. `/` redirige a `/piloto`.

Configurar en Vercel las variables sensibles mediante el panel o el gestor de secretos, nunca mediante commits o subiendo archivos `.env`. La API requiere `DATABASE_URL` (URL MySQL con credenciales codificadas), `MYSQL_TLS=true`, `APP_ORIGIN` igual al origen HTTPS del piloto y `AUTH_LIMIT_SECRET` aleatorio de al menos 32 bytes en hex. El acceso de la base desde Vercel requiere que MonsterASP permita conexiones externas; verificar certificado TLS y limitar exposición según las capacidades del proveedor. La compilación usa Node 24.

Esto prepara una demostración, no declara la aplicación lista para clientes: faltan pruebas completas en navegador y MonsterASP, evaluación del limitador tras proxy y prevención de abuso, cambios de configuración concurrentes, copias y revisión de seguridad. No conectar el piloto de pruebas a datos reales. El catálogo remoto requiere datos sintéticos previamente creados. Los despliegues y variables deben dirigirse a proyectos y entornos explícitamente identificados; no apuntar a la base antigua.
