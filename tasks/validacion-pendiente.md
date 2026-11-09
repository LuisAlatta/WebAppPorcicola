# Validación antes del cierre operativo

Actualizado el 9 de noviembre de 2026. Este documento distingue comprobaciones técnicas de las pruebas físicas y operativas que todavía deben registrarse. El estado formal de cada tarea permanece en [todo.md](todo.md) y [estado.md](estado.md).

## Verificación posterior del código y staging

Commit verificado: `64f2f60400e80009c2850655766f2643bc7c33b1` (`main`). GitHub Actions, ejecución `42627286330`, terminó correctamente: `npm ci`, typecheck, lint, 145/145 pruebas unitarias en 32 archivos, 118/118 pruebas de integración en 22 archivos, build y 41/41 E2E. El build incluye cobertura de recuerdo seguro de credenciales y traslado individual de corral/lote dentro del mismo galpón.

El Worker de staging se construyó desde el commit `64f2f60400e80009c2850655766f2643bc7c33b1` con `CLOUDFLARE_ENV=staging` y se desplegó en la cuenta confirmada `newluisalattago@gmail.com` / `0acfa25b5f619f94d581b8cf882e2eec`. Versión: `6e7449b2-d5e6-4def-b45d-bf9d30890bf4`; binding `env.DB` verificado contra `webporcicola-staging`; cron de staging `5 5 * * *`. Wrangler no encuentra migraciones pendientes en staging. Las rutas `/`, `/login`, `/animales`, `/inventario`, `/alimentacion`, `/sanidad` y `/reportes` responden 200. Las rutas protegidas `/api/auth/me`, `/api/animals`, `/api/inventory`, `/api/reports/weights` y `/api/reports/births` devuelven 401 sin sesión, como se espera.

El formulario conserva solo el usuario en almacenamiento de la app. En navegadores compatibles pide al administrador de contraseñas que guarde la contraseña y usa `autocomplete` como alternativa; la clave antigua en texto legible se elimina al arrancar la app, también si ya existe una sesión activa. Los E2E verifican guardado/recuperación vía gestor, limpieza heredada y decisión de olvidar.

La consulta remota de producción encuentra pendientes `0024_litter_discard.sql`, `0025_same_day_locations.sql` y `0026_litter_identified_adoptions.sql`. El D1 de producción recibió las migraciones `0006`–`0023` el 8 de noviembre, según [piloto.md](piloto.md); en esta revisión no se modificó D1 ni se desplegó el Worker de producción. Un intento de dry-run sin el build/archivo generado de staging mostró el binding de producción; no se usó para desplegar. El build y dry-run correctos de staging confirmaron su D1 antes de publicar.

No hay `adb` instalado ni un Samsung Galaxy A54 conectado en este equipo. Por eso no se afirma prueba física, aceptación del piloto ni seguimiento de producción.

## Evidencia local registrada el 8 de noviembre

- `npm test -- --maxWorkers=1`: **112/112** en 30 archivos.
- `npm run test:integration`: **86/86** en 20 archivos.
- `npm run test:e2e`: **20/20** en Chrome móvil emulado de 412×915; incluye control de foco y restauración al cerrar el diálogo PWA, reintentos de alertas/animales/informes y corrección de fecha.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` y el dry-run de Wrangler para producción: correctos. El dry-run mostró el binding `env.DB` a `webporcicola-produccion` y no subió el Worker.
- Vitest usa un timeout predeterminado de 15 s; T17, T22 y T25 tienen límites explícitos de 15 s, 60 s y 120 s. Las aserciones no se redujeron.
- `npx vitest run tests/operations.test.ts tests/restore.integration.test.ts --maxWorkers=1`: **5/5**, dos archivos; duración total 9,33 s, tiempo de pruebas 7,06 s en esta máquina. Son mediciones locales, no objetivos garantizados de recuperación remota.
- ESLint de los cuatro componentes modificados, `src/utils/operations.ts` y los dos tests: correcto.
- Ayuda local de Wrangler 4.156.1 para `d1 export`, `d1 execute` y `d1 time-travel`: consultada. No se ejecutó ninguna exportación, importación ni restauración remota durante esta revisión.

### T28: operación online

No se habilita captura sin red ni sincronización de borradores. `fetchOperation` conserva en memoria una clave por método, ruta y hash del contenido hasta recibir y leer una respuesta JSON de éxito. El mapa no guarda el contenido del formulario y se limpia al aceptar una nueva sesión o cerrar sesión correctamente.

Los formularios de Finanzas, Alimentación, Sanidad, Vacunas, Alertas, Animales e Informes usan esa protección. Las pruebas de backend verifican replay de alertas atendidas/manuales, cambios de arete y disponibilidad, y creación/actualización/duplicación de informes; reutilizar una clave con contenido distinto da 409. Los E2E simulan persistencia seguida de pérdida de respuesta y verifican que el formulario conserva datos y clave. También se comprueba el intento sin conexión sin petición.

Una recarga o cierre de pestaña pierde formularios e intentos en memoria. No hay reenvío automático después de recargar. Si el resultado anterior quedó incierto, el operario debe volver a consultar el listado antes de introducir una nueva operación. No presentar este alcance como captura offline ni como recuperación persistente de borradores.

### T29: recuperación lógica local comprobada

`tests/restore.integration.test.ts` crea dos D1 distintas en Miniflare. Aplica todas las migraciones del directorio, carga cuentas/asignaciones y operaciones ficticias y exporta esquema, filas y secuencias a una representación serializada en memoria. Importa esa copia en la segunda base, restaura índices y triggers y ejecuta el Worker autenticado contra ella.

Resultados comprobados:

- Usuarios y asignaciones coinciden con el corte exportado; la sesión copiada permite consultar el Worker de la base recuperada.
- Inventario recuperado: 12 cabezas iniciales − 2 vendidas = **10**. Una compra de 5 posterior al corte permanece solo en la base origen.
- Operación financiera de **PEN 180**, abono de **PEN 40**, saldo pendiente **PEN 140**; caja inicial **PEN 1.500** y cierre **PEN 1.540** recuperados con igualdad de las respuestas de consulta.
- `PRAGMA foreign_key_check` en la copia devuelve cero errores. Se preservan las secuencias de identidades, además del esquema y datos.

Esta prueba valida una copia lógica pequeña en el runtime local. **No acredita** Time Travel remoto, retención del plan Cloudflare, restauración de una base de producción, volumen real, ni un RPO/RTO operativo. El backup de la prueba es efímero: no contiene ni recupera información real de la granja.

`tests/migrations-upgrade.integration.test.ts` aplica las migraciones 0001–0023 por etapas a una D1 sintética con datos ficticios; verifica backfills seleccionados, relaciones y `PRAGMA foreign_key_check`. No modifica ni valida la base de producción.

## Pendientes que impiden afirmar aceptación completa

| Área | Evidencia disponible | Pendiente de cierre |
|---|---|---|
| Navegador | CI Playwright 41/41 en emulación móvil; el Worker staging actual sirve las pantallas de módulos y exige sesión para las API protegidas. | Falta el recorrido de campo en Android físico; la emulación y los smoke de rutas no sustituyen el piloto ni prueban todos los 32 casos de aceptación como jornada. |
| Android físico | Dispositivo objetivo confirmado: Samsung Galaxy A54. | Registrar Android y versión de Chrome reales; instalar desde HTTPS, icono, enlace directo, actualización con formulario abierto, teclado decimal, foco, scroll y descargas. |
| Desconexión física | Prueba automatizada de intento estable y no envío offline. | Modo avión real, pérdida de respuesta, recarga, reinicio y cambio de cuenta; confirmar ausencia de falsas confirmaciones y duplicados. |
| CA-20 | Implementado en `worker/litters.ts` y cubierto por `tests/litter-date.integration.test.ts`; E2E de formulario y reintento en `e2e/litter-date.browser.ts`. | Caso funcional cubierto automáticamente. Mantenerlo abierto solo si el informe final de T29 detecta una discrepancia; no describir la corrección como pendiente de implementación. |
| Alertas por cambio de día | Integraciones prueban ayer/hoy/+1/+7/+8 y handler programado local. | Registrar cambio de fecha Lima y ejecución programada real de staging; verificar contadores antes/después y ausencia de repetición. |
| Recuperación remota | [Ensayo remoto ejecutado](recuperacion-remota.md):52tablas/96filas, FK0, Worker autenticado con copia y Time Travel verificados; destino efímero eliminado después. El tamaño actual de producción y staging se registra abajo. | Falta restaurar bajo la carga/volumen operativo previsto, custodiar copias y acordar RPO/RTO; confirmar plan efectivo (retención Free7días/Paid30). No equivale a recuperar producción bajo carga. |
| Tamaño D1 | `wrangler d1 info` remoto, 9/11: producción 52 tablas / 724.992 bytes; staging 53 tablas / 761.856 bytes. Actividad observada últimas 24 h: producción 0 lecturas/escrituras; staging 3.218 filas leídas y 145 escritas. | Es el tamaño actual de dos bases pequeñas, no prueba de capacidad bajo carga. Medir volumen/concurrencia del piloto y acordar RPO/RTO con el responsable. |
| Piloto | Procedimiento y plantillas en [piloto.md](piloto.md). | Carga aprobada, conteo físico, jornada de cuatro perfiles y aceptación del responsable operativo. |
| Producción | La consulta remota actual de Wrangler encuentra pendientes `0024_litter_discard.sql`, `0025_same_day_locations.sql` y `0026_litter_identified_adoptions.sql`. La revisión previa registró 0001–0023 y `PRAGMA foreign_key_check` sin errores; no se modificó producción durante esta revisión ni se desplegó el Worker compatible. | T31 sigue abierto. Después de T30, verificar bindings/secretos/dominio/HTTPS, aplicar el esquema pendiente, desplegar Worker compatible, configurar cron y completar pruebas controladas; el cron de staging no acredita el de producción. |
| Entrega | Código y evidencia técnica local. | Primer cierre diario real, ejecución programada real, responsables de incidencias y recuperación y conciliación aceptada. |

### CA-20 implementado

La corrección de fecha real conserva fecha previa, autor y motivo; valida secuencia e inventario; reprograma solo dosis pendientes del parto y preserva las aplicadas/canceladas. La cobertura automatizada está en `tests/litter-date.integration.test.ts` e incluye concurrencia con generación, permisos, idempotencia, conflicto y rollback. La última CI aprobó 145 pruebas unitarias, 118 de integración y 41 E2E; la evidencia de `todo.md` registra el caso CA-13 con 002, nacimiento 06/06/2026 y vacuna pendiente el 05/08/2026.

## Matriz para el ensayo de los 32 casos

Las suites citadas en «Base» pasaron en CI para el commit `64f2f60400e80009c2850655766f2643bc7c33b1` (145 unitarias, 118 de integración y 41 E2E). Esto acredita los asertos automatizados incluidos en cada suite; no equivale a ejecutar los 32 casos como una jornada integral ni completa los chequeos de campo indicados. T29 permanece abierto hasta registrar esperado/observado/artefacto por caso y medir volumen/concurrencia acordados y RPO/RTO validados.

| CA | Base de prueba | Comprobación adicional del ensayo |
|---|---|---|
| 01 | `animals.integration.test.ts`, alta 002 | Reenvío de formulario real tras perder respuesta. |
| 02 | `animals.integration.test.ts`, ciclos con parámetros | Fecha 23/01/2021 +116 y retiro del pendiente al cerrar. |
| 03 | `animals.integration.test.ts`, parto e identificación | Conciliar 8 vivos, 1 muerto y dos fichas sin doble entrada. |
| 04 | Inventario/animales integración, traslados | Consultar origen, destino e histórico desde pantalla. |
| 05 | Animales integración, venta/devolución | Reenvío real y ausencia de segunda baja/ingreso. |
| 06 | Animales integración, pesos fuera de orden | Revisar último peso válido, cronología y corrección en ficha. |
| 07 | `feed.integration.test.ts` | Confrontar demanda, saldo y proyección sin movimientos nuevos. |
| 08 | Animales integración, tratamiento grupal/retiro/muerte | Historial después del traslado y venta denegada. |
| 09 | Animales integración, destete parcial | Conciliar pendiente, etapa destino y total granja. |
| 10 | Animales integración T24 | 7,5 % media frente a 6,666… % global, sin confundir denominadores. |
| 11 | Inventario/D1 integración, concurrencia | Dos sesiones HTTP sobre saldo único. |
| 12 | Animales integración, corrección de camada | Rechazo con identificados incompatibles sin alterar libro. |
| 13 | `tests/cierre5.integration.test.ts`, `tests/animals.integration.test.ts` | 002, nacimiento 06/06/2026 y +60 =05/08/2026; generar/guardar de nuevo no duplica y conservar el pendiente tras aplicación. |
| 14 | Animales integración, plan postdestete | Reabrir la edición y comparar 5/10/20 con tarjeta/agenda. |
| 15 | Animales integración, regeneración/aplicación | Guardar reproducción dos veces con vacuna ya existente. |
| 16 | Animales integración, fecha probable manual | Mostrar procedencia y motivo después de reabrir. |
| 17 | Administración/inventario/reportes integración | Matriz completa de URL/API/panel/archivos para galpón ajeno. |
| 18 | Reportes y exportación T26 | Sembrar exactamente venta180/consumo24 y cotejar PDF/XLSX abiertos. |
| 19 | Animales integración T22 | Aplicación resuelve una sola alerta con vínculo sanitario. |
| 20 | `tests/litter-date.integration.test.ts` y `e2e/litter-date.browser.ts` | Corregir fecha real con aplicada/pendiente; verificar conservación, permisos, reintento y rechazo atómico. |
| 21 | `alerts.test.ts` e integración T22 | Cambio de medianoche Lima real y límites inclusivos. |
| 22 | Integración T22 | Reprogramación, aplicación y parto eliminan pendientes originales. |
| 23 | Integración T22 | Destete parcial y siguiente tratamiento conservan ocurrencias correctas. |
| 24 | Alimento integración T22 | Cerrar turno20/12 y completar8; confirmar contador. |
| 25 | Integración T23 | Pesos39/40/100, retiro y stock sin alteración por sugerencia. |
| 26 | Integración T23 y handler local | Observar ejecución remota y destinatarios reales de prueba. |
| 27 | `admin.integration.test.ts` | Repetir con los cuatro menús y URL directa. |
| 28 | Administración y cierre2 integración | Sustitución en segunda sesión y pérdida inmediata. |
| 29 | Reporte combinado T26 | Ventas100+200 y tres consumos10; guardar y comparar formatos. |
| 30 | Alimento integración CA30 | Compra500 frente a consumo120 sin segundo egreso. |
| 31 | Animales integración CA31 y exportación T26 | Venta1000, cobros400/600 en meses distintos y archivos abiertos. |
| 32 | Reporte guardado/alcance T26 | Retirar B, reejecutar y comprobar filas, totales, filtros y ambos archivos. |

## Ensayo remoto de respaldo y restauración

1. Fijar commit, Worker origen, versión de esquema, fecha UTC del corte y cifras de control. Elegir almacenamiento privado del backup fuera del repositorio.
2. Comprobar `npx wrangler whoami`: cuenta `newluisalattago@gmail.com`, ID `0acfa25b5f619f94d581b8cf882e2eec`. El origen de ensayo debe ser staging; la copia de destino tendrá nombre e ID nuevos y Worker separado.
3. Exportar staging con la sintaxis confirmada por la ayuda instalada: `npx wrangler d1 export webporcicola-staging --remote --env staging --config wrangler.jsonc --output <ruta-privada.sql>`. Registrar SHA-256, tamaño, inicio/fin y versión de Wrangler. No publicar ese SQL: contiene cuentas y datos de la granja del entorno exportado.
4. Crear una D1 aislada y una configuración temporal cuyo binding DB apunte exclusivamente a ella. Revisar nombre/ID resueltos antes de importar. No reutilizar la configuración ni el ID de producción.
5. Importar el archivo con `npx wrangler d1 execute <base-aislada> --remote --config <config-aislada> --file <ruta-privada.sql>`. Confirmar versión de herramienta y consultar su ayuda si cambió. Desplegar un Worker de ensayo sobre la copia, con acceso restringido y cron sin activar durante la conciliación.
6. Comprobar FK, conteos por tabla y secuencias. Desde el Worker de copia consultar usuarios, asignaciones, parámetros, animales, camadas, inventario al corte, alimento, cuentas pendientes y caja por moneda; comparar cifras y muestrear identificadores/historiales. Cerrar bootstrap y comprobar acceso denegado sin sesión y fuera de galpón.
7. Medir por separado exportación, importación, disponibilidad del Worker y conciliación. Comparar punto recuperado con último registro incluido; ese intervalo es la pérdida potencial observada. Conservar el inventario de operaciones posteriores al corte y procedimiento para reconciliarlas.
8. Verificar en la cuenta el plan y retención real de recuperación. Un ensayo SQL no prueba Time Travel. Si se ensaya Time Travel, hacerlo en otra copia aislada y registrar bookmark/instante y resultado; nunca ejecutar una restauración real sobre producción como prueba.

T29 se cierra cuando existe informe del ensayo remoto y de los 32 casos; T30–T32 requieren además la evidencia operativa de [piloto.md](piloto.md).
