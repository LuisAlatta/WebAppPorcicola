# Validación antes del cierre operativo

Actualizado el 8 de noviembre de 2026. Este documento distingue comprobaciones técnicas de las pruebas físicas y operativas que todavía deben registrarse. El estado formal de cada tarea permanece en [todo.md](todo.md) y [estado.md](estado.md).

## Evidencia ejecutada en esta revisión

- `npm run typecheck`: correcto después de incorporar T28 y la prueba de recuperación.
- `npx vitest run tests/operations.test.ts tests/restore.integration.test.ts --maxWorkers=1`: **5/5**, dos archivos; duración total 9,33 s, tiempo de pruebas 7,06 s en esta máquina. Son mediciones locales, no objetivos garantizados de recuperación remota.
- ESLint de los cuatro componentes modificados, `src/utils/operations.ts` y los dos tests: correcto.
- Ayuda local de Wrangler 4.156.1 para `d1 export`, `d1 execute` y `d1 time-travel`: consultada. No se ejecutó ninguna exportación, importación ni restauración remota durante esta revisión.

### T28: operación online

No se habilita captura sin red ni sincronización de borradores. `fetchOperation` conserva en memoria una clave por método, ruta y hash del contenido hasta recibir y leer una respuesta JSON de éxito. El mapa no guarda el contenido del formulario y se limpia al aceptar una nueva sesión o cerrar sesión correctamente.

Los formularios de Finanzas, Alimentación, Sanidad y Vacunas usan esa protección. La prueba simula un servidor que confirma el registro y después pierde la respuesta: el reenvío usa la misma clave y conserva un solo evento. También comprueba cambio de cantidad, dispositivo sin conexión sin petición y cuerpo JSON interrumpido después de recibir cabeceras de éxito.

Una recarga o cierre de pestaña pierde formularios e intentos en memoria. No hay reenvío automático después de recargar. Si el resultado anterior quedó incierto, el operario debe volver a consultar el listado antes de introducir una nueva operación. No presentar este alcance como captura offline ni como recuperación persistente de borradores.

### T29: recuperación lógica local comprobada

`tests/restore.integration.test.ts` crea dos D1 distintas en Miniflare. Aplica todas las migraciones del directorio, carga cuentas/asignaciones y operaciones ficticias y exporta esquema, filas y secuencias a una representación serializada en memoria. Importa esa copia en la segunda base, restaura índices y triggers y ejecuta el Worker autenticado contra ella.

Resultados comprobados:

- Usuarios y asignaciones coinciden con el corte exportado; la sesión copiada permite consultar el Worker de la base recuperada.
- Inventario recuperado: 12 cabezas iniciales − 2 vendidas = **10**. Una compra de 5 posterior al corte permanece solo en la base origen.
- Operación financiera de **PEN 180**, abono de **PEN 40**, saldo pendiente **PEN 140**; caja inicial **PEN 1.500** y cierre **PEN 1.540** recuperados con igualdad de las respuestas de consulta.
- `PRAGMA foreign_key_check` en la copia devuelve cero errores. Se preservan las secuencias de identidades, además del esquema y datos.

Esta prueba valida una copia lógica pequeña en el runtime local. **No acredita** Time Travel remoto, retención del plan Cloudflare, restauración de una base de producción, volumen real, ni un RPO/RTO operativo. El backup de la prueba es efímero: no contiene ni recupera información real de la granja.

## Pendientes que impiden afirmar aceptación completa

| Área | Evidencia disponible | Pendiente de cierre |
|---|---|---|
| Navegador real | Playwright Chrome móvil emulado9/9; `tests/routes.smoke.test.ts` conserva solo smoke de rutas. | Login/roles/SW/actualización comprobados en navegador automatizado; falta recorrido completo de formularios y evidencia del Android físico. |
| Android físico | Dispositivo objetivo confirmado: Samsung Galaxy A54. | Registrar Android y versión de Chrome reales; instalar desde HTTPS, icono, enlace directo, actualización con formulario abierto, teclado decimal, foco, scroll y descargas. |
| Desconexión física | Prueba automatizada de intento estable y no envío offline. | Modo avión real, pérdida de respuesta, recarga, reinicio y cambio de cuenta; confirmar ausencia de falsas confirmaciones y duplicados. |
| CA-20 | `estado.md` ya identifica ausencia de corrección de la fecha real de parto. | Implementar y probar corrección auditada y recálculo selectivo de vacunas pendientes; no cerrar el caso por corregir solo la fecha probable. |
| Alertas por cambio de día | Integraciones prueban ayer/hoy/+1/+7/+8 y handler programado local. | Registrar cambio de fecha Lima y ejecución programada real de staging; verificar contadores antes/después y ausencia de repetición. |
| Recuperación remota | [Ensayo remoto ejecutado](recuperacion-remota.md):52tablas/96filas, FK0, Worker autenticado con copia y Time Travel verificados; destino efímero eliminado después. | Falta volumen real, custodia de copias y RPO/RTO acordados; confirmar plan efectivo (retención Free7días/Paid30). No equivale a recuperar producción bajo carga. |
| Piloto | Procedimiento y plantillas en [piloto.md](piloto.md). | Carga aprobada, conteo físico, jornada de cuatro perfiles y aceptación del responsable operativo. |
| Producción | Entorno separado ya existe en configuración. | Promover solo después de T30, revisar migraciones/bindings/secretos y configurar cron de producción: el cron de staging por sí solo no acredita el de producción. |
| Entrega | Código y evidencia técnica local. | Primer cierre diario real, ejecución programada real, responsables de incidencias y recuperación y conciliación aceptada. |

### Diseño pendiente de CA-20

La corrección debe conservar fecha original, motivo y autor. Antes de confirmar debe validar secuencia del ciclo, presencia histórica de la madre, lactancia, fichas identificadas y eventos posteriores de la camada. Si cambia la fecha de entrada de cabezas, conservar el libro original y registrar compensaciones/reemplazos enlazados; comprobar saldo cronológico y atomicidad. Recalcular únicamente vacunas pendientes vinculadas al origen `farrowing` de esa camada. Las aplicaciones ya realizadas conservan su fecha, responsable y ocurrencia original. Se requieren casos con una vacuna aplicada y otra pendiente, y rechazo sin efectos ante secuencia incompatible.

## Matriz para el ensayo de los 32 casos

La columna «Base» señala dónde existe una prueba candidata; no sustituye su resultado en la ejecución final ni una prueba de interfaz. Registrar commit, comando, esperado, observado y artefacto de cada caso en el informe T29.

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
| 13 | Animales integración, vacuna por nacimiento | 002, nacimiento 06/06 y +60 =05/08; tabla de cobertura está desactualizada si aún dice pendiente. |
| 14 | Animales integración, plan postdestete | Reabrir la edición y comparar 5/10/20 con tarjeta/agenda. |
| 15 | Animales integración, regeneración/aplicación | Guardar reproducción dos veces con vacuna ya existente. |
| 16 | Animales integración, fecha probable manual | Mostrar procedencia y motivo después de reabrir. |
| 17 | Administración/inventario/reportes integración | Matriz completa de URL/API/panel/archivos para galpón ajeno. |
| 18 | Reportes y exportación T26 | Sembrar exactamente venta180/consumo24 y cotejar PDF/XLSX abiertos. |
| 19 | Animales integración T22 | Aplicación resuelve una sola alerta con vínculo sanitario. |
| 20 | Brecha funcional documentada | Corregir fecha real con aplicada/pendiente y verificar conservación. |
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
