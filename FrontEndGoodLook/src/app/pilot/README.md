# Piloto (`/piloto`), temporal

Este directorio es el piloto de la API nueva. Se mantiene durante el corte y no se retira en esta tanda.

Es una superficie temporal. No sustituye al producto: el producto PWA vive en `src/app/product/` y se publica en `/producto/`. La retirada de `/piloto` está prevista después del corte, en el [issue #34](https://github.com/JorgeReina/GoodLook/issues/34), junto con la revisión de la aplicación heredada. La decisión está en el [issue #17](https://github.com/JorgeReina/GoodLook/issues/17).

Cómo levantarlo en local y cómo queda en el paquete de entrega está en [PILOTO.md](../../../PILOTO.md). Hay dos entradas mientras dure el corte: el build de la configuración `pilot` y la ruta `/piloto` de la aplicación heredada.

Sus specs de Karma (`src/app/pilot/**/*.spec.ts`) entran en el job de CI mientras `/piloto` exista, junto a los de `src/app/product/`. Los specs de la aplicación heredada siguen fuera; el aviso está en [el README de `src/app`](../README.md).
