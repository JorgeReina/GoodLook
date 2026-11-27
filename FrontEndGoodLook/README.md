# FrontEndGoodLook

Un solo proyecto Angular 22, con Angular Material y CDK. El mismo árbol tiene tres superficies:

1. **Aplicación heredada.** `src/main.ts` arranca `AppModule` (NgModule). Es lo que sirven `ng serve` y `ng build` cuando no se elige otra configuración. Está congelada: permanece en el árbol como código histórico y no se borra en esta tanda.
2. **Piloto.** La configuración `pilot` (`src/main.pilot.ts`) arranca el piloto como aplicación propia. En el paquete de entrega, Vercel sirve ese `index.html` en `/piloto`. Esa entrada se mantiene durante el corte como temporal y se retira después. El uso con la API está en [PILOTO.md](PILOTO.md).
3. **Producto PWA.** La configuración `product` (`src/main.product.ts`) es la aplicación instalable. En el paquete se publica bajo `/producto/`.

La decisión está en el [issue #17](https://github.com/JorgeReina/GoodLook/issues/17). El borrado de la aplicación heredada y la retirada de `/piloto` quedan para después del corte, en el [issue #34](https://github.com/JorgeReina/GoodLook/issues/34).

El diario de la migración está en [docs/migracion/](../docs/migracion/).

## Versiones

Comprobadas con `npx ng version` a partir de `package-lock.json`, en Node 24.22.3:

| Paquete | Versión |
| --- | --- |
| Angular (`@angular/core` y el resto del framework) | 22.2.6 |
| Angular CLI y `@angular-devkit/build-angular` | 22.2.7 |
| Angular Material y CDK | 22.3.0 |
| TypeScript | 6.0.3 |
| RxJS | 7.8.2 |
| zone.js | 0.15.1 |

## Requisitos

Node.js 24, en el intervalo `>=24 <25` del campo `engines` del `package.json` de la raíz. El flujo de GitHub Actions instala Node 24. Esta guía se ejecutó con Node 24.22.3.

Hace falta el `package-lock.json` de este directorio. Una instalación anterior, de cuando el proyecto era Angular 16, no sirve: el CLI actual ya no acepta `browserTarget` y el servidor de desarrollo no arranca.

## Instalación

Desde `FrontEndGoodLook`:

```sh
npm ci
```

## Desarrollo local

La API de desarrollo escucha en `127.0.0.1:3000`. El proxy `proxy.pilot.json` reenvía `/api` a esa dirección. La API tiene que aceptar el origen `http://localhost:4200` (`APP_ORIGIN`). Cómo levantarla, con una base Docker aislada, está en [PILOTO.md](PILOTO.md).

### Piloto, dentro de la aplicación heredada

```sh
npx ng serve --host localhost --proxy-config proxy.pilot.json
```

Abrir `http://localhost:4200/piloto`. Este servidor arranca `AppModule`. El enrutador carga el componente del piloto en `/piloto`.

### Producto

```sh
npx ng serve --configuration=product --host localhost
```

Abrir `http://localhost:4200/`. Esta configuración de `serve` une el build `product` con `product-dev`: la base es `/`, el service worker no se registra y el proxy ya es `proxy.pilot.json`. En el paquete de entrega la base pasa a ser `/producto/`.

Las rutas están en `src/app/product/product.routes.ts`. La carcasa es `shell.component`. El resto se reparte en `access`, `customer`, `agenda`, `management`, `install`, `api` y `shared`. En la tabla, la ruta vacía es el catálogo. Con `ng serve --configuration=product` van sobre `/`; en el paquete, sobre `/producto/`.

| Ruta | Pantalla |
| --- | --- |
| (vacía) | Catálogo |
| `piloto` | Redirige al catálogo |
| `negocios/:id` | Ficha del negocio |
| `reservar/:id` | Reserva |
| `acceso` | Acceso o registro |
| `mis-citas` | Citas propias; exige sesión |
| `mi-agenda` | Agenda semanal; exige pertenencia de agenda |
| `gestion` | Gestión; exige pertenencia, o `?alta=1` para dar de alta un negocio |
| `invitacion` | Invitación de un solo uso |
| `sesion-no-disponible` | La sesión no se pudo comprobar |
| `sin-acceso` | La cuenta no tiene acceso a ese espacio |
| cualquier otra | Página no encontrada |

### Piloto, build standalone

No hay una configuración `serve` llamada `pilot`. El artefacto standalone se genera así:

```sh
npm run build -- --configuration=pilot
```

El `index.html` de `dist/front-end-good-look` arranca solo el piloto (`<app-pilot>`, título «GoodLook piloto»). En Vercel, la ruta `/piloto` reescribe a ese archivo. El `npm run build` de la raíz incluye este paso.

## Build

Desde la raíz del repositorio:

```sh
npm run build
```

Ese script instala este paquete, compila el piloto (`--configuration=pilot`) y después el producto (`--configuration=product --base-href=/producto/ --output-path=dist/front-end-good-look/producto`), y ejecuta `scripts/verify-product-package.mjs`. El resultado queda en `FrontEndGoodLook/dist/front-end-good-look`.

Ese directorio es el que publica Vercel. `vercel.json` redirige `/` a `/producto/` y conserva `/piloto` como entrada del piloto.

El script `build` de este paquete, sin argumentos, es `ng build`. Su configuración por defecto se llama `production` y toma `src/main.ts`: empaqueta la aplicación heredada, no el piloto ni el producto.

## Pruebas

Los specs de Karma del producto y del piloto, los mismos que ejecuta el CI:

```sh
npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/product/**/*.spec.ts' --include='src/app/pilot/**/*.spec.ts'
```

Hace falta Chrome o Chromium local, que Karma abre como `ChromeHeadless`. En el runner de GitHub Actions el flujo apunta `CHROME_BIN` al Chromium de Playwright con `--no-sandbox`, porque ese entorno bloquea los namespaces del navegador.

La aceptación de navegador del producto es el script `test:e2e` (Playwright). El orden, con la API y una base Docker, está en [PILOTO.md](PILOTO.md).

## Lint

Este paquete no define lint. `package.json` no tiene un script `lint` y `angular.json` no declara ese target. `npx ng lint` termina con «Cannot find "lint" target for the specified project».

## CI

El flujo [`.github/workflows/goodlook-product.yml`](../.github/workflows/goodlook-product.yml) corre en `push` y `pull_request` hacia `main` y `work/goodlook-migracion`, y también con `workflow_dispatch`. Usa Node 24.

En la parte de frontend ejecuta el `npm run build` de la raíz y, dentro de `FrontEndGoodLook`, los specs de Karma de `src/app/product/**` y de `src/app/pilot/**`. Los specs de la aplicación heredada quedan fuera a propósito. Seis fallan y están registrados en el [issue #26](https://github.com/JorgeReina/GoodLook/issues/26); no se reparan en este flujo. Su retirada va con el borrado previsto en el [issue #34](https://github.com/JorgeReina/GoodLook/issues/34).

El mismo flujo también compila y prueba la API, corre la integración MySQL y MariaDB, e instala Chromium para `npm run test:e2e`. Esos pasos no cambian el filtro de Karma.
