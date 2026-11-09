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
