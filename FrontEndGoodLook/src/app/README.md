# Aplicación heredada, congelada

La aplicación con NgModule que arranca en `src/main.ts` está congelada. Es código histórico: permanece en el árbol, no se borra en esta tanda y no admite cambios nuevos. Su retirada está prevista después del corte, en el [issue #34](https://github.com/JorgeReina/GoodLook/issues/34). La decisión está en el [issue #17](https://github.com/JorgeReina/GoodLook/issues/17).

`src/app/product/` (el producto PWA, publicado en `/producto/`) y `src/app/pilot/` (`/piloto`, temporal durante el corte) no forman parte de este congelado. El piloto está descrito en [pilot/README.md](pilot/README.md) y en [PILOTO.md](../../PILOTO.md).

## Qué queda congelado

- El arranque por defecto: `src/main.ts` carga `AppModule`. `ng serve` y `ng build` sin otra configuración siguen empaquetando esta aplicación (`src/index.html` y la configuración `production`). Eso no se cambia aquí.
- `app.module.ts`, `app-routing.module.ts`, `app.component.*` y `goodlook.service.ts`.
- Los componentes `header`, `nav`, `body`, `footer`, `signin`, `signup`, `profile`, `calendar2`, `datelist` y `page404`.
- Los modelos de `src/model/`.
- La ruta `piloto` declarada en `app-routing.module.ts`. Sigue cargando el componente de `src/app/pilot/` para que `http://localhost:4200/piloto` funcione dentro de esta aplicación hasta la retirada.

## Specs fuera del CI

El job de Karma de [`.github/workflows/goodlook-product.yml`](../../../.github/workflows/goodlook-product.yml) ejecuta solo estos specs:

```sh
npm test -- --watch=false --browsers=ChromeHeadless --include='src/app/product/**/*.spec.ts' --include='src/app/pilot/**/*.spec.ts'
```

Los specs de esta aplicación heredada quedan fuera a propósito. No se reparan en esta tanda. Seis fallan y están registrados en el [issue #26](https://github.com/JorgeReina/GoodLook/issues/26):

- `app.component.spec.ts`
- `calendar2/calendar2.component.spec.ts`
- `header/header.component.spec.ts`
- `nav/nav.component.spec.ts`
- `signin/signin.component.spec.ts`
- `signup/signup.component.spec.ts`

El resto de specs heredados tampoco entra en el job. Corregirlos o retirarlos corresponde a la retirada prevista en #34.
