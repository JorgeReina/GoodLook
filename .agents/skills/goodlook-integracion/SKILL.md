---
name: goodlook-integracion
description: Use when integrating a GoodLook implementation branch into the migration branch or resolving Git conflicts in that integration.
---

# Integración de ramas de GoodLook

Conserva la intención de ambos cambios y exige evidencia de que funcionan juntos antes de consolidar la integración.

## Antes del merge

1. Lee `AGENTS.md` y el plan aplicable. Recibe del coordinador el worktree, la rama de origen, la rama de destino, el commit base y las pruebas requeridas. Trabaja con una sola rama de origen por ejecución.
2. En el worktree asignado, ejecuta `git status --untracked-files=all` para identificar operaciones en curso y cambios locales. Detente si hay cambios preparados, sin preparar, archivos sin seguimiento o una operación Git en curso. Comprueba que la rama activa coincide con el destino autorizado. Conserva cualquier trabajo previo en su lugar.
3. Fija los commits de origen, destino y base con `git rev-parse --verify`. Si `git merge-base --is-ancestor <origen> <destino>` devuelve 0, informa de que el origen ya está integrado. En el resto de casos, confirma con `git merge-base --all <destino> <origen>` que hay una única base común y que coincide con la acordada. Si discrepan, informa de los hashes y detente.
4. Revisa `git diff <base> <origen>` y `git diff <base> <destino>`, junto con las pruebas y consumidores de cada contrato. Si detectas intenciones incompatibles que la evidencia no permite conciliar, detente antes del merge. Los cambios a migraciones aplicadas requieren una nueva migración que conserve el historial original.

## Merge y verificación

1. Ejecuta `git merge --no-ff --no-commit <commit-origen>` usando el hash verificado. El destino se mantiene en su commit inicial mientras revisas el resultado.
2. Enumera los conflictos con `git ls-files -u`. Para cada ruta, revisa `git show :1:<ruta>` (base), `git show :2:<ruta>` (destino) y `git show :3:<ruta>` (origen). En renombrados o altas y bajas puede faltar alguna etapa. Usa el índice y los diffs de cada rama para reconstruir la intención y registra la ausencia. Edita y prepara cada ruta con una resolución justificada por el contrato y sus pruebas.
3. Revisa también los cambios fusionados automáticamente. Examina el índice frente a ambos commits con `git diff --cached <destino>` y `git diff --cached <origen>`. Confirma que `git ls-files -u` esté vacío y ejecuta `git diff --cached --check` y las pruebas acordadas del bloque y del conjunto. Antes de crear el commit, comprueba que el destino sigue en el hash inicial y que el índice y el árbol de trabajo conservan el resultado revisado. Tras el commit, verifica sus padres y el estado final del worktree.
4. Si hay ambigüedad funcional, riesgo de datos, una prueba fallida o una comprobación requerida que no se puede ejecutar, detén la integración y comunica el bloqueo. Si iniciaste el merge desde un árbol limpio, usa `git merge --abort` únicamente tras comprobar que no se perderán cambios ajenos. Verifica que el destino vuelve al commit inicial. Si aparecieron cambios ajenos, conserva el estado y avisa al coordinador.

Quedan prohibidos `git reset --hard`, las restauraciones masivas, las selecciones masivas de `ours` o `theirs` y la reescritura del historial de migraciones aplicadas. La integración en una rama principal requiere una pull request para revisión del usuario.

## Informe al coordinador

- Indica los commits de base, origen y destino inicial. Añade el resultado y los commits integrados, si los hay.
- Para cada conflicto revisado, indica la ruta, qué cambió en cada rama respecto a la base, la decisión y la evidencia que la justifica.
- Registra los comandos de verificación, sus resultados reales, las pruebas pendientes y cualquier bloqueo con el estado final del worktree.
