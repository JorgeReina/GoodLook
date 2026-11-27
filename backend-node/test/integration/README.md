# Integración con MySQL real

Requisitos: Node 24, dependencias `npm ci`, Docker Engine con Compose y puerto 33317 libre en loopback. Ejecutar desde `backend-node`:

```bash
./scripts/test-mysql-integration.sh
```

El lanzador crea un proyecto Compose aleatorio, MySQL 8.4 en tmpfs, base y credenciales ficticias; espera a que esté preparado y destruye únicamente su proyecto al terminar. Las pruebas solo aceptan el puerto y base fijos de pruebas, verifican el hostname del contenedor creado y que la base esté vacía antes de crear tablas. No usar datos reales. El puerto debe estar libre; no usar una base ya existente. La prueba cubre esquema, sesión real, aislamiento de empresas y dos reservas simultáneas. Las credenciales están diseñadas exclusivamente para el contenedor local efímero.

El comando falla de forma explícita si Docker no está disponible. Acepta un argumento opcional: `mysql` (defecto, imagen MySQL 8.4) o `mariadb` (imagen MariaDB 10.11).

```bash
bash ./scripts/test-mysql-integration.sh mysql
bash ./scripts/test-mysql-integration.sh mariadb
```

El flujo de CI [`.github/workflows/goodlook-product.yml`](../../../.github/workflows/goodlook-product.yml) ejecuta los dos en serie, después de `npm test` y de `node --test db/tests/*.test.mjs`. No es una prueba integral de navegador (E2E) ni cubre todas las operaciones concurrentes. El contrato cubierto está en [`docs/migracion/RESERVAS.md`](../../../docs/migracion/RESERVAS.md).

Nota histórica: este archivo decía que la suite no se había ejecutado porque el entorno donde se añadió no tenía Docker. Esa frase queda retirada. La ejecución depende de Docker en la máquina que lanza el script, y CI sí lo tiene.
