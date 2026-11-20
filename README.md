# GoodLook

El frontend Angular está en `FrontEndGoodLook` y la API Express/TypeScript en `backend-node`. El [piloto local](FrontEndGoodLook/PILOTO.md) usa esta API con una base Docker aislada.

## API

La API de producto está en [`backend-node`](backend-node/README.md): Node 24, Express 5, TypeScript, autenticación por cookie, catálogo, reservas, citas, agenda y gestión. El contrato de rutas es [`backend-node/openapi.yaml`](backend-node/openapi.yaml). El protocolo de reservas y el diario de la migración están en [`docs/migracion/RESERVAS.md`](docs/migracion/RESERVAS.md) y [`docs/migracion/`](docs/migracion/).

El mismo proceso atiende al piloto y al producto. Usa la base nueva de esta serie. El despliegue antiguo y su base quedan fuera de este arranque.

## Base de datos

El esquema vigente es la serie 001–006. MySQL 8 está en `backend-node/db/migrations` y MariaDB 10.11 en `backend-node/db/migrations-mariadb`. El ejecutor, las variables y la recuperación de una migración interrumpida están en [`backend-node/db/README.md`](backend-node/db/README.md). Se aplica sobre una base nueva y vacía. No lances esas migraciones contra la base del despliegue antiguo.

## Cómo levantar la API

Hace falta Node 24 y una base ya migrada. Desde `backend-node`:

```bash
npm ci
npm run build
export PORT=3000
export APP_ORIGIN=http://localhost:4200
export DATABASE_URL='mysql://USUARIO:CONTRASEÑA@127.0.0.1:PUERTO/BASE_DESECHABLE'
export MYSQL_ALLOW_INSECURE_LOCAL=true
export AUTH_LIMIT_SECRET="$(openssl rand -hex 32)"
npm start
```

`APP_ORIGIN=http://localhost:4200` es el origen del navegador tanto para el piloto como para el producto cuando Angular se sirve ahí y el proxy reenvía `/api`. En un sitio HTTPS, `APP_ORIGIN` es ese origen y `MYSQL_TLS=true`. Los valores no se guardan en Git. El recorrido con datos sintéticos, el proxy y el paquete de entrega están en [`FrontEndGoodLook/PILOTO.md`](FrontEndGoodLook/PILOTO.md).

`GET /health` responde `{"status":"ok"}`. Pruebas, migraciones y el flujo de CI están en el README de `backend-node`.
