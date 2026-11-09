# Verificación de las cinco mejoras solicitadas

Revisión del 9 de noviembre de 2026 sobre `main`, partiendo de `5b41faa`.
Las cinco mejoras ya estaban implementadas antes de esta revisión. El diagnóstico
original de `comparacion-excel-aplicacion.md` es histórico; su tabla inicial
documenta las correcciones posteriores.

| Tarea | Dónde utilizarla | Verificación de pantalla |
|---|---|---|
| 1. Ficha individual | Animales → Ver ficha → Datos técnicos: servicios, partos, primer y último parto, crías por sexo, peso promedio y causa de salida. El promedio se pondera por crías vivas de camadas con peso registrado. | Resumen reproductivo y salida por muerte o descarte. |
| 2. Movimientos | Animales → Ver ficha → Gestión y Traslados: elegir galpón, ubicación, lote y etapa destino. Inventario también admite movimientos grupales de cabezas sin ficha. Un pesaje en otra etapa actualiza ficha e inventario. | Traslado dentro del mismo galpón y selección de etapa en pesaje. |
| 3. Reportes | Reportes → Informes Productivos: pesos o nacimientos, filtros, indicadores, tabla, gráfico y exportación. | Consultas con filtros y descarga Excel de los mismos resultados. |
| 4. Alimentación | Alimentación → Raciones y Cobertura: comparación independiente por día, etapa y mes; debajo, demanda conjunta por alimento. | Suficiencia diaria y por etapa junto al faltante mensual; demanda compartida. |
| 5. Filtros y correcciones | Animales: madre, padre, raza, aptitud, procedencia y etapa de ingreso. Reproducción: formulario de corrección de cantidades de nacimiento. | Envío de filtros combinados y corrección de camada que conserva datos ante conflicto. |

## Comprobaciones locales

- Las 20 pruebas de `animals-retry.browser.ts`, `productive-reports.browser.ts`,
  `feed-projection.browser.ts` y `litter-date.browser.ts` pasaron.
- Las 5 pruebas seleccionadas de acceso, almacenamiento de usuario y recuperación
  de credenciales en `access.browser.ts` pasaron.
- TypeScript, ESLint y compilación pasaron. La compilación conserva una advertencia
  por tamaño de un paquete del cliente.
- Las 67 pruebas de integración de `animals.integration.test.ts`,
  `inventory.integration.test.ts`, `feed.integration.test.ts` y
  `litter-date.integration.test.ts` pasaron con D1 emulada. Incluyen resumen
  reproductivo, causa de salida, movimientos internos y cambios de etapa,
  consultas productivas, filtros, correcciones de camada y acumulados de
  alimento con lotes agotados.

Durante la comprobación se retiró del login un estado que ya no tenía lectores
y causaba un error de ESLint. Se conserva el almacenamiento del usuario y la
integración con el gestor de contraseñas del navegador.

Las pruebas de pantalla usan respuestas API controladas. Las pruebas de integración
ejercitan el Worker con D1 emulada. Esta revisión no modifica datos reales ni
certifica una sesión autenticada del despliegue público.

## Despliegue y comprobación en producción

El mismo 9 de noviembre se publicó `fa3c9f0` en
[producción](https://web-porcicola-produccion.luisalatta.workers.dev), Worker
`web-porcicola-produccion`, versión `2b825085-944c-476c-a6ad-deefbbd491aa`.
Se verificaron la cuenta `0acfa25b5f619f94d581b8cf882e2eec`, el binding
`webporcicola-produccion` y cero migraciones pendientes. Cloudflare confirmó
el cron `5 5 * * *` (00:05 de Lima); falta observar su primera ejecución.

Durante la comprobación hubo otra publicación, correspondiente al cambio visual
`94eb977`. La versión activa al cierre fue
`6f78663e-fa0c-4e26-b529-686987d3f5bd`. Se recargó el navegador y se comprobó
que servía `/assets/index-ItBF-Um3.js`, coincidente con la compilación actual.
El informe de nacimientos se volvió a consultar en esa versión.

La base estaba vacía. El usuario autorizó expresamente registrar datos sintéticos
en producción y conservar su historial auditado. Se crearon cuatro fichas con
prefijo `PRUEBA-20261109-`, una camada, dos pesajes y movimientos de inventario
y alimento. Las compras de alimento de prueba también generan sus asientos
contables de prueba; no representan pagos ni operaciones reales.

| Punto | Resultado observado con sesión de administrador y API real |
|---|---|
| Ficha | Un servicio, un parto, primer y último parto el 16/09/2026. Tras corregir la camada: 10 nacidos, 7 machos y 3 hembras; promedio 1,40 kg ponderado por 9 vivos. La salida sintética de la madre muestra «Descarte · Edad», fecha 09/11/2026. |
| Movimientos | El formulario trasladó `PRUEBA-20261109-CERDO` dentro del Galpón A a Corral Maternidad y Lote Engorde A, pasando de levante a engorde. El stock total siguió en 12 cabezas y la demanda individual pasó de 1,6 a 2,5 kg/día. |
| Reportes | Pesajes: dos observaciones de 40 y 45 kg, promedio 42,5 kg; al filtrar por corral, lote, etapa y animal, una observación de 45 kg en tabla y gráfico. Nacimientos: filtros de madre, galpón, ubicación y lote recuperan 10 nacidos, 9 vivos, 1 muerto y 10 % de mortalidad, con gráfico y tabla concordantes. |
| Alimentación | Preinicio: 9 cabezas, 5,85 kg/día, 122,85 kg/etapa y 175,5 kg/mes frente a 130 kg disponibles. La pantalla indica día y etapa suficientes, y faltante mensual de 45,5 kg. Cerda vacía y reproductor comparten alimento: 4,5 kg/día, 135 kg/mes frente a 80 kg, faltante conjunto de 55 kg. Un lote comprado y consumido por completo conserva sus 10 kg de entrada y salida; las tarjetas muestran 220 kg recibidos, 10 kg entregados y 210 kg disponibles. |
| Filtros y camada | Los seis filtros combinados del padrón devolvieron únicamente el cerdo esperado. El formulario de corrección cambió machos vivos de 5 a 6; pantalla, ficha, inventario y reporte reflejaron 9 vivos. El inventario pasó de 12 a 13 cabezas y volvió a 12 tras el descarte sintético de la madre. |

Las capturas locales están en `screenshots/produccion-20261109/` y el registro
de consultas sin credenciales en `.wrangler/verification/produccion-20261109.json`,
ambos excluidos de Git. Las consultas autenticadas registradas respondieron sin
errores HTTP. Los formularios de traslado, corrección y descarte se guardaron
desde la web publicada, no mediante respuestas simuladas.

Una pestaña abierta antes del despliegue intentó cargar un módulo antiguo y quedó
en blanco; recargarla recuperó el módulo publicado. Esto no se cuenta como una
prueba satisfactoria de actualización de sesiones antiguas sin recarga. La descarga
Excel se inició, pero no se obtuvo un archivo verificable durante esta comprobación;
su validación local previa no sustituye una confirmación de descarga en producción.
