# Piloto de la nueva API

La ruta `/piloto` utiliza rutas relativas `/api` con cookies HttpOnly, sin localStorage ni token de la versión anterior. Requiere la nueva API y una base aislada con negocios, servicios, asociaciones y horarios de prueba; no funciona con la API .NET. El backend debe permitir el mismo origen del navegador mediante `APP_ORIGIN`.

Para desarrollo local, usar Node 24 e instalar primero las dependencias del lockfile desde `FrontEndGoodLook` con `npm ci`. Una instalación anterior de Angular 16 no es compatible con la configuración actual y puede causar el error de `browserTarget`. Con la API escuchando en 127.0.0.1:3000 y `APP_ORIGIN=http://localhost:4200`, ejecutar `npx ng serve --host localhost --proxy-config proxy.pilot.json` y abrir `http://localhost:4200/piloto`. Usar localhost de forma coherente: el backend valida el Origin y las cookies son Secure. En producción se necesita un proxy HTTPS mismo origen; no exponer el backend de desarrollo.

El catálogo debe contener datos. El piloto consulta horarios orientativos de los próximos siete días para la combinación seleccionada, mostrados en la zona horaria del negocio con su desplazamiento UTC. La API comprueba de nuevo la disponibilidad al reservar; si hay conflicto hay que actualizar los horarios. Las combinaciones sin asociación pueden rechazarse. El piloto requiere pruebas funcionales de navegador y MySQL antes de utilizarse con clientes.

## Empaquetado aislado para Vercel

La configuración de la raíz construye exclusivamente el componente `/piloto` como aplicación independiente; no compila ni navega las pantallas antiguas ni su URL de backend. La función `api/index.ts` recibe las peticiones `/api/...` en el mismo origen y exporta la aplicación Express sin abrir un puerto. `/` redirige a `/piloto`.

Configurar en Vercel las variables sensibles mediante el panel o el gestor de secretos, nunca mediante commits o subiendo archivos `.env`. La API requiere `DATABASE_URL` (URL MySQL con credenciales codificadas), `MYSQL_TLS=true`, `APP_ORIGIN` igual al origen HTTPS del piloto y `AUTH_LIMIT_SECRET` aleatorio de al menos 32 bytes en hex. El acceso de la base desde Vercel requiere que MonsterASP permita conexiones externas; verificar certificado TLS y limitar exposición según las capacidades del proveedor. La compilación usa Node 24.

Esto prepara una demostración, no declara la aplicación lista para clientes: faltan pruebas completas en navegador y MonsterASP, evaluación del limitador tras proxy y prevención de abuso, cambios de configuración concurrentes, copias y revisión de seguridad. No conectar el piloto de pruebas a datos reales. El catálogo remoto requiere datos sintéticos previamente creados. Los despliegues y variables deben dirigirse a proyectos y entornos explícitamente identificados; no apuntar a la base antigua.
