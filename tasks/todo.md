# Control de ejecución

Estado actual: Fases 2 y 3 completas; T12–T19 completadas; T20 en curso. La vinculación compra/venta–inventario y las anulaciones manuales ya están implementadas y desplegadas en staging. T20 sigue abierta porque las anulaciones de operaciones con origen de inventario deben ejecutarse desde su flujo de origen para mantener el stock, y esos flujos correctivos aún no están implementados. No iniciar T21 hasta completar T20. Leer [estado y guía para retomar](estado.md), [plan](plan.md) y [requisitos](requisitos.md). Marcar una tarea solo después de registrar evidencia. Para un caso, guardar el resultado real, no solo el esperado.

## 1. Preparación

- [x] T01 · Fijar alcance y decisiones · dependencias —.
- [x] T02 · Crear proyecto reproducible · dependencias 01.
- [x] T03 · Probar D1 y exportaciones antes de comprometer la arquitectura · dependencias 02.
- [x] Cierre 1: Instalar en una copia limpia y repetir la prueba de atomicidad en el runtime de Workers. Registrar la elección de exportadores.

## 2. Acceso

- [x] T04 · Implementar sesiones y primer administrador · dependencias 03.
- [x] T05 · Implementar módulo exclusivo de administración · dependencias 04.
- [x] T06 · Registrar eventos con reintentos y auditoría · dependencias 05.
- [x] T07 · Configurar la granja y sus parámetros · dependencias 05,06.
- [x] Cierre 2: Desde dos sesiones distintas verificar que solo el administrador gestione usuarios y que la revocación sea inmediata. Revisar la matriz de permisos con ejemplos de acceso directo.

## 3. Animales e inventario

- [x] T08 · Abrir inventario individual y colectivo · dependencias 07.
- [x] T09 · Dar de alta y consultar animales · dependencias 08.
- [x] T10 · Transferir, dar de baja, conciliar y corregir · dependencias 09.
- [x] T11 · Registrar producción y pesajes · dependencias 09,10.
- [ ] Cierre 3: Reconstruir el saldo a dos fechas desde el historial. Comparar la suma de grupos e identificados con la ocupación. Probar dos escritores y un reintento.

## 4. Reproducción

- [x] T12 · Abrir y seguir ciclos reproductivos · dependencias 09,10.
- [x] T13 · Registrar parto y camada de forma atómica · dependencias 12.
- [x] T14 · Destetar y calcular repeticiones · dependencias 13.
- [ ] Cierre 4: Recorrer servicio → parto → identificación → destete. Conciliar animales y fechas en la ficha y en la agenda.

## 5. Alimentación y sanidad

- [x] T15 · Controlar almacenes y suministros · dependencias 10.
- [x] T16 · Planificar raciones y calcular cobertura · dependencias 11,15.
- [x] T17 · Historial clínico y tratamientos · dependencias 10,14.
- [x] T18 · Programar vacunas y registrar su aplicación · dependencias 12,13,17.
- [ ] Cierre 5: Registrar alimento, tratamiento y vacuna. Repetir los dos fallos señalados por el cliente y verificar los valores reales de la ficha.

## 6. Finanzas

- [x] T19 · Libro de ingresos y egresos · dependencias 15.
- [ ] T20 · Compras, ventas y correcciones integradas · dependencias 10,17,19 (en curso; integración y reversión manual listas, faltan correcciones de compras/ventas enlazadas que mantengan inventario).
- [ ] T21 · Caja, abonos y costos por galpón · dependencias 20.
- [ ] Cierre 6: Conciliar ventas, existencias, pagos y caja a dos cierres de mes, incluyendo una devolución y una corrección.

## 7. Alertas

- [ ] T22 · Generar agenda y pendientes por fecha · dependencias 14,16,18.
- [ ] T23 · Sugerencias, críticas y notificaciones · dependencias 11,17,20,22.
- [ ] Cierre 7: Comparar bandeja y contadores por galpón antes y después de medianoche local y de una ejecución repetida del cron.

## 8. Reportes

- [ ] T24 · Definir fuentes y consultas autorizadas · dependencias 11,14,18,21,23.
- [ ] T25 · Personalización, informes y panel · dependencias 24.
- [ ] T26 · Exportar PDF y Excel reales · dependencias 25.
- [ ] Cierre 8: Abrir archivos exportados en un lector PDF y en Excel u otro lector XLSX. Comparar filas, totales y permisos con la vista previa completa.

## 9. Android

- [ ] T27 · Interfaz completa e instalación PWA · dependencias 26.
- [ ] T28 · Resolver desconexiones y conflictos · dependencias 06,27.
- [ ] Cierre 9: Probar en Android físico el flujo de un operario con pérdida de red, recarga y cambio de usuario. Registrar la evidencia.

## 10. Lanzamiento

- [ ] T29 · Pruebas integrales y ensayo de restauración · dependencias 26,27,28.
- [ ] T30 · Piloto con datos iniciales y los cuatro perfiles · dependencias 29.
- [ ] T31 · Publicar y comprobar producción · dependencias 30.
- [ ] T32 · Seguimiento y entrega operativa · dependencias 31.
- [ ] Cierre 10: Cerrar piloto, recuperación, despliegue y seguimiento con conciliación; cualquier defecto que afecte saldos o permisos impide la aceptación.

## Cobertura por requisito

| Requisito | Tarea responsable | Prueba o evidencia al completar |
|---|---|---|
| ACC-01 | T04 | Verificado con tests/auth.integration.test.ts y BocetoLogin |
| ACC-02 | T27 | Pendiente |
| ACC-03 | T04 | Verificado con tests/auth.integration.test.ts y modelo de roles D1 |
| ACC-04 | T06 | Verificado en tests/events.integration.test.ts: misma clave + mismo contenido devuelve el resultado previo (replayed, sin filas nuevas); contenido distinto con la misma clave da 409 y no escribe; 5 reenvíos concurrentes generan 1 sola fila en operation_log y 1 en audit_log |
| ACC-05 | T04 | Verificado con BocetoLogin (identidad Granja San Luis, visibilidad de clave, perfil y logout) |
| ACC-06 | T05 y Cierre 2 | Verificado con tests/admin.integration.test.ts y tests/cierre2.integration.test.ts (CA-27: exclusividad administrativa, 403 Forbidden para otros perfiles en 6 rutas directas) |
| ACC-07 | T05 | Verificado con tests/admin.integration.test.ts (CA-28: alcance granja para admin, aislamiento de galpones y pérdida inmediata al reasignar) |
| ADM-01 | T05 | Verificado con ModuloAdministracion.tsx y API /api/admin/* protegida |
| ADM-02 | T05 | Verificado con tests/admin.integration.test.ts (validación de responsable, operario y veterinario; bloqueo de activación si equipo incompleto) |
| ADM-03 | T05 | Verificado con tests/admin.integration.test.ts (sustitución con vigencia y autor, pérdida de acceso inmediata y reasignación/desactivación atómica) |
| ADM-04 | T05 | Verificado con matriz de permisos y modelo de 4 perfiles operativos en backend y frontend |
| ALE-01 | T22 | Pendiente |
| ALE-02 | T22 | Pendiente |
| ALE-03 | T22 | Pendiente |
| ALE-04 | T22 | Pendiente |
| ALE-05 | T22 | Pendiente |
| ALE-06 | T22 | Pendiente |
| ALE-07 | T23 | Pendiente |
| ALE-08 | T23 | Pendiente |
| ALE-09 | T23 | Pendiente |
| ALE-10 | T23 | Pendiente |
| ALI-01 | T15 | Verificado en `tests/feed.integration.test.ts`: compra de 602 kg menos entrega de 123 kg = 479 kg disponibles; reintento no duplica |
| ALI-02 | T16 | Verificado en `tests/feed.integration.test.ts`: 35 cabezas × 0,65 kg = 22,75 kg/día; demanda suma por etapa/alimento |
| ALI-03 | T16 | Verificado en `tests/feed.integration.test.ts`: disponible 479 kg cubre 21 días; necesidad de etapa 477,75 kg; faltante mensual 203,50 kg |
| ALI-04 | T16 | Verificado en `tests/feed.integration.test.ts`: proyección conserva inventario en 479 kg; etapa con cero cabezas muestra demandas cero; parámetros faltantes se indican |
| ALI-05 | T15 | Verificado en `tests/feed.integration.test.ts`: almacén, proveedor, lote, costo/kg, galpón destino y rechazo de saldo retroactivo negativo (409) |
| ALI-06 | T16 | Verificado en `tests/feed.integration.test.ts`: consumo medido 1,8 kg / ganancia 10 kg = 0,18 kg/kg con dos pesajes del mismo animal, galpón y etapa; si no hay dato comparable, índice queda vacío |
| ALI-07 | T15 | Verificado en `tests/feed.integration.test.ts`: costo imputado una vez (123 kg × S/ 2,50 = S/ 307,50); inventario físico separado del costo asignado |
| ANI-01 | T09 | Verificado en tests/animals.integration.test.ts: ficha con código, arete, alias, tipo, raza, sexo, nacimiento, pesos, estado, origen, galpón, etapa, ubicación, lote, genealogía y observaciones |
| ANI-02 | T09 | Verificado en tests/animals.integration.test.ts: código permanente con ceros, historial de aretes, progenitores internos/externos, sexo compatible, fechas válidas y rechazo de ciclos |
| ANI-03 | T09, T12 | Parcial: ficha y búsqueda muestran edad, pesos, estado, origen y ubicación; el módulo de reproducción lista servicios y ciclos; partos y métricas de camada se incorporan con T13–T14 |
| ANI-04 | T09 | Parcial: edad a la fecha, edad hasta salida y último peso derivado; la ubicación por movimientos se completa en T10 |
| ANI-05 | T09, T12 | Parcial: filtros y cronología de alta, pesos, aretes, tipos e inventario verificados; reproducción tiene listado propio por rango; integrar todos los eventos a cronología y agregar clínica en T13–T18 |
| ANI-06 | T09 | Verificado en tests/animals.integration.test.ts: tipos cerda/verraco/lechón/reemplazo, sexo propio, código textual, alias y pesos de nacimiento/destete opcionales |
| ANI-07 | T09 | Verificado en tests/animals.integration.test.ts: filtros combinables, reemplazo disponible y cambio de tipo con vigencia sin alterar ID ni cabezas; se rechaza tipo incompatible con sexo |
| ANI-08 | T09 | Verificado en tests/animals.integration.test.ts: desactivar/reactivar ficha exige motivo y no crea salida ni altera el inventario |
| CAM-01 | T13 | Verificado: madre/ciclo, padre tomado del servicio, paridad, fecha, galpón, ubicación, lote, sexos, pesos y observaciones en camada vinculada |
| CAM-02 | T13 | Verificado: 3 hembras + 5 machos vivos + 1 muerto = 9; mortalidad 11,11 % |
| CAM-03 | T13 | Verificado: enteros no negativos, sexo pendiente y validación del desglose; identificaciones no superan el conteo disponible |
| CAM-04 | T13 | Verificado: 21 días de lactancia desde 16/09/2026 = 07/10/2026; previsión no crea movimientos |
| CAM-05 | T13 | Verificado: el parto agrega solo vivos; dos fichas convierten cabezas de grupo sin cambiar el saldo |
| CAM-06 | T14 | Verificado: baja por causa, destete parcial por sexo con peso, adopción enlaza salida/entrada de camada y destino por galpón/etapa; saldo reconcilia nacidos, adopciones, bajas y destetes |
| CAM-07 | T13 | Verificado: nacidos muertos separados; antecedente previo al ingreso se marca histórico y no afecta inventario |
| CAM-08 | T14 | Verificado: parto/camada enlazados al ciclo; los eventos de baja/destete actualizan saldo por sexo y distinguen fecha real de prevista |
| CFG-01 | T07 | Verificado en tests/config.integration.test.ts: catálogos de sexo, estado (activo, vendido, descartado, muerto), etapa, aptitud (pie de cría, engorde), ubicación, lote, causas de descarte y muerte, tipo de servicio, estado fisiológico y alimento, con vigencia y retiro |
| CFG-02 | T07 | Verificado en tests/config.integration.test.ts: ocho etapas con peso y edad inicial/final, duración y límites abiertos en null (distintos de cero): preinicio, inicio, levante, engorde, gestación, lactancia, vacía y reproductor |
| CFG-03 | T07 | Verificado en tests/config.integration.test.ts: ración y consumo diario por cabeza; preinicio 0,65 kg/día, 19,5 kg a 30 días y 13,65 kg en 21 días; total por etapa calculado desde la duración |
| CFG-04 | T07 | Verificado en tests/config.integration.test.ts: ubicaciones físicas (galpón, corral con padre) separadas de lotes de manejo y de la etapa productiva; nombres propios versionados |
| CFG-05 | T07 | Verificado en tests/config.integration.test.ts: dos versiones de la misma etapa en fechas distintas; la consulta al 31-05 conserva 0,65 kg y al 01-06 devuelve 0,8 kg; «vacía» retirada deja de ofrecerse al 01-07 pero sigue en el histórico |
| CFG-06 | T05 | Verificado con tests/admin.integration.test.ts (alta, edición, capacidad, zona, estado y eliminación de galpón sin registros asociados) |
| CFG-07 | T10 | Pendiente |
| FIN-01 | T19 | Pendiente |
| FIN-02 | T19 | Pendiente |
| FIN-03 | T21 | Pendiente |
| FIN-04 | T20 | Pendiente |
| FIN-05 | T21 | Pendiente |
| FIN-06 | T25 | Pendiente |
| GES-01 | T20 | Pendiente |
| GES-02 | T21 | Pendiente |
| GES-03 | T06 | Verificado en tests/events.integration.test.ts: la corrección de una asignación vigente conserva la fila original como histórica (is_current = 0, valid_until y superseded_by_id), crea la nueva fila como vigente y registra en audit_log autor, motivo, fecha efectiva y datos previos/nuevos |
| GES-04 | T27 | Pendiente |
| GES-05 | T29 | Pendiente |
| GES-06 | T28 | Pendiente |
| INF-01 | T24 | Pendiente |
| INF-02 | T24 | Pendiente |
| INF-03 | T24 | Pendiente |
| INF-04 | T25 | Pendiente |
| INF-05 | T22 | Pendiente |
| INF-06 | T26 | Pendiente |
| INF-07 | T25 | Pendiente |
| INF-08 | T22 | Pendiente |
| INF-09 | T26 | Pendiente |
| INV-01 | T08 | Verificado en tests/inventory.integration.test.ts: entradas y salidas por fecha, etapa y sexo; salidas con causa obligatoria en muerte; resumen por etapa con entradas, salidas, disponibles y mortalidad (muertes/entradas) y total de la granja |
| INV-02 | T08 | Verificado en tests/inventory.integration.test.ts: cada movimiento declara origen (saldo inicial, compra, nacimiento, venta, muerte, traslado o ajuste); saldo inicial por fecha, galpón, ubicación, lote, etapa y sexo; corte al 2026-01-31 reconstruye 12 cabezas antes de las compras de febrero |
| INV-03 | T08 | Verificado en tests/inventory.integration.test.ts: saldo = inicial + entradas externas + nacimientos + traslados recibidos − salidas externas − muertes + ajustes; categorías excluyentes; traslado interno A→B conserva el total de la granja; correcciones retroactivas que dejarían saldo negativo responden 409 |
| INV-04 | T09 | Verificado en tests/animals.integration.test.ts e inventory.integration.test.ts: nacimientos/compras/iniciales generan una entrada individual idempotente; vincular un animal ya contado consume una cabeza sin sumar inventario; snapshot separa identificadas y sin identificar |
| INV-05 | T10 | Verificado en tests/inventory.integration.test.ts y tests/animals.integration.test.ts: traslados colectivos e individuales vinculan ambos extremos, las fichas y las coordenadas históricas; permisos en los dos galpones |
| INV-06 | T10 | Verificado en tests/inventory.integration.test.ts: conciliación registra esperado, conteo, delta, causa/motivo, autor y ajuste enlazado con reintento idempotente |
| INV-07 | T10 | Verificado en tests/inventory.integration.test.ts: corrección conserva original, enlaza reversión y valor corregido, permite vista previa de movimientos incompatibles y rechaza saldo negativo o segunda corrección |
| PRO-01 | T11 | Pendiente |
| PRO-02 | T11 | Pendiente |
| PRO-03 | T11 | Pendiente |
| PRO-04 | T10 | Verificado en tests/inventory.integration.test.ts: movimientos de salida controlan causa; ventas/muertes de animales se sincronizan con ficha y saldo en un solo batch |
| PRO-05 | T10 | Verificado en tests/admin.integration.test.ts: el estado inactivo se bloquea mientras el libro de inventario indique animales presentes |
| PRO-06 | T11 | Pendiente |
| REP-01 | T12 | Verificado en `tests/animals.integration.test.ts`: hembra, raza, verraco/raza o material externo, tipo, número y fecha de servicio, ubicación/lote histórico y aptitud |
| REP-02 | T12 | Verificado en integración: palpación con fecha y estado fisiológico; fecha probable, restantes y antecedente de último parto visibles |
| REP-03 | T12 | Verificado en integración: servicios y palpaciones enlazados a ciclo; repetición conserva servicios; aborto cierra ciclo; reintento conserva un evento |
| REP-04 | T12 | Verificado en integración: fecha calculada desde parámetro versionado de Gestación, etiquetas por fecha local y exclusión de cierres de pendientes |
| REP-05 | T12 | Verificado en integración: hembra y verraco deben estar presentes en fecha del evento; ciclo requiere referencia explícita o antecedente sin servicio ficticio |
| REP-06 | T12 | Verificado en integración: 116 días 23/01/2021→19/05/2021; 114 días 25/05/2026→16/09/2026; fecha manual conserva origen y motivo |
| REP-07 | T14 | Verificado: fecha 20/05 + intervalos 5/10/20 calcula 25/05, 04/06 y 24/06; conserva fechas observadas por separado y permite recalcular |
| REP-08 | T14 | Verificado: plan persiste por ciclo; al consultar vuelve a mostrar +5/+10/+20 y las mismas fechas, sin valores fijos en la tarjeta |
| REP-09 | T12 | Verificado en integración: rango inclusivo por fecha de último servicio; antecedente usa fecha probable; lista conserva pareja, estados, servicios y fechas |
| REP-10 | T18 | Pendiente |
| RPT-01 | T24 | Pendiente |
| RPT-02 | T24 | Pendiente |
| RPT-03 | T24 | Pendiente |
| RPT-04 | T25 | Pendiente |
| RPT-05 | T26 | Pendiente |
| RPT-06 | T25 | Pendiente |
| SAN-01 | T17 | Verificado en `tests/animals.integration.test.ts`: historial filtrable por animal, producto, lote y fecha; guarda responsable, dosis y ubicación |
| SAN-02 | T17 | Verificado en `tests/animals.integration.test.ts`: producto, unidad, lote sanitario, galpón, ubicación, etapa y lote animal permanecen como captura histórica al trasladar después |
| SAN-03 | T17 | Verificado en `tests/animals.integration.test.ts`: aplicación grupal conserva códigos/composición por animal, fecha próxima y retiro; dosificación, producto y responsable |
| SAN-04 | T17 | Verificado en `tests/animals.integration.test.ts`: muerte genera un único evento sanitario enlazado a una baja de inventario atómica; venta durante retiro recibe 409 |
| SAN-05 | T18 | Pendiente |
| SAN-06 | T18 | Pendiente |
| SAN-07 | T18 | Pendiente |
| SAN-08 | T18 | Pendiente |
| SAN-09 | T18 | Pendiente |
| SAN-10 | T17 | Verificado: módulo de Sanidad ofrece historial individual/grupal, próximas actuaciones y alertas de retiro; escritura reservada a veterinario y administrador |

## Casos de aceptación

Los datos y resultados esperados están en la sección 12 de [requisitos](requisitos.md). T29 vuelve a ejecutar la serie completa en el entorno de pruebas.

| Caso | Validación inicial | Resultado y evidencia |
|---|---|---|
| CA-01 | T09 | Verificado en tests/animals.integration.test.ts: alta repetida de 002 devuelve la misma ficha, conserva ceros, registra una entrada y encuentra el arete vigente; payload distinto 409 |
| CA-02 | T12 | Verificado en `tests/animals.integration.test.ts`: duración versionada 116 días; servicio 23/01/2021 calcula 19/05/2021; al cerrarse el ciclo deja de salir entre pendientes |
| CA-03 | T13 | Verificado en `tests/animals.integration.test.ts`: 8 vivos y 1 muerto produce 9 nacidos, 11,11 %; la camada se suma una vez y dos fichas conservan 8 cabezas en el total |
| CA-04 | T10 | Verificado en tests/inventory.integration.test.ts y tests/animals.integration.test.ts: traslado colectivo 12→7/8→13, traslado individual, dos movimientos vinculados, historial y permisos por origen/destino |
| CA-05 | T20 | Pendiente |
| CA-06 | T11 | Pendiente |
| CA-07 | T16 | Verificado en `tests/feed.integration.test.ts`: 602 kg − 123 kg = 479 kg; proyección 21 días y faltante mensual 203,50 kg; la consulta no cambia saldo |
| CA-08 | T17 | Verificado en `tests/animals.integration.test.ts`: tratamiento grupal, traslado posterior, historial conserva Galpón A y lote; venta bloqueada hasta vencimiento; una muerte = un movimiento y un evento |
| CA-09 | T14 | Verificado en `tests/animals.integration.test.ts`: 8 vivos, 1 muerte y 6 destetados dejan 1 pendiente, 6 en etapa destino y total de granja 7; reintento no duplica |
| CA-10 | T25 | Pendiente |
| CA-11 | T10 | Verificado en tests/inventory.integration.test.ts: dos salidas concurrentes de 7 sobre 10 producen una respuesta 201 y otra 409; saldo nunca negativo; fallo forzado al insertar el destino revierte toda la transferencia |
| CA-12 | T13 | Verificado en `tests/animals.integration.test.ts`: reducción a 7 vivos con las 8 cabezas distribuidas en fichas devuelve 409; corrección aún sin distribuir registra ajuste de inventario y auditoría |
| CA-13 | T18 | Pendiente |
| CA-14 | T14 | Verificado en `tests/animals.integration.test.ts`: plan 20/05 con 5/10/20 guarda y reabre con fechas 25/05, 04/06 y 24/06 |
| CA-15 | T18 | Pendiente |
| CA-16 | T12 | Verificado en `tests/animals.integration.test.ts`: 114 días desde 25/05/2026 da 16/09/2026; edición manual 18/09 se identifica como manual y conserva el motivo |
| CA-17 | T26 | Pendiente |
| CA-18 | T26 | Pendiente |
| CA-19 | T22 | Pendiente |
| CA-20 | T18 | Pendiente |
| CA-21 | T22 | Pendiente |
| CA-22 | T22 | Pendiente |
| CA-23 | T22 | Pendiente |
| CA-24 | T22 | Pendiente |
| CA-25 | T23 | Pendiente |
| CA-26 | T23 | Pendiente |
| CA-27 | T05 | Verificado en tests/admin.integration.test.ts: solo Administrador crea cuentas y galpones; intentos de responsable, operario y veterinario retornan 403 Forbidden y la DB queda inalterada |
| CA-28 | T05 | Verificado en tests/admin.integration.test.ts: asignación de A y B a Usuario responsable; asignación de Operario y Veterinario; sustitución de Vet1 por Vet3 en Galpón A; Vet1 pierde acceso de inmediato ([]), Vet3 gana acceso ([Galpón A]), Responsable conserva [A, B]; historial registra autor y vigencia |
| CA-29 | T26 | Pendiente |
| CA-30 | T20 | Pendiente |
| CA-31 | T26 | Pendiente |
| CA-32 | T26 | Pendiente |

## Registro de avance

| Fecha | Tarea | Estado | Prueba ejecutada y resultado real | Evidencia / commit | Pendiente o decisión |
|---|---|---|---|---|---|
| 2026-11-08 | T20 | En curso | Implementados vínculos atómicos e idempotentes para compra/venta de animal y compra de alimento; consumo no duplica el egreso. Anulación de asientos manuales genera compensación auditable, marca el original y reintenta sin duplicar; anulación financiera directa de origen inventariable devuelve 409. Suite completa 81/81 en 14 archivos; integración alimentación/animales 20/20; typecheck, lint y build correctos. En staging, migración 0018 aplicada, columnas verificadas; Worker `82c528c5-a9f7-4a9a-94c0-3e983807566a`; `/finanzas` 200, API sin sesión 401. | migration 0018, `worker/animals.ts`, `worker/feed.ts`, `worker/finance.ts`, `worker/index.ts`, módulos de animales/alimentación/finanzas y pruebas de integración; commit `801b256` pusheado a `main`. | Incompleta: faltan rutas de devolución/corrección en los módulos de origen para ventas/compras enlazadas, con compensación de inventario y enlace del asiento inverso. T21 bloqueada por dependencia. Producción intacta. |
| 2026-11-07 | T10 | Completada | Traslado grupal atómico con galpones, ubicaciones y lotes independientes en origen/destino, permisos en ambos extremos y reintento; caso 12→7/8→13. Traslado individual mueve ficha, historial de ubicación y libro en la misma operación; salida individual de venta/muerte guarda causa y movimiento enlazado y cierra ficha; conciliación física conserva saldo esperado, cantidad contada, delta, autor, motivo y ajuste; corrección conserva movimiento original, añade reversión y reemplazo enlazados, y previsualiza filas posteriores incompatibles. Inactivación de galpón con cabezas bloqueada; capacidad excesiva produce advertencia provisional; mortalidad excluye transferencias internas. Dos retiros concurrentes de 7 sobre 10 dejan uno exitoso y el otro en 409; falla forzada al insertar la recepción y se revierte el batch completo. Pruebas afectadas 31/31; suite 72/72; E2E 2/2; typecheck, lint y build correctos. Migraciones 0007–0008 y Worker staging versión `58d55da3-b1dd-497a-83a1-bdedf74956b3`; smoke `/animales`, `/inventario`, `/animal/T10-MOVE-01` 200 y API sin sesión 401. No se usó producción. | migrations/0007_transfer_and_stock_guard.sql, migrations/0008_animal_location_history.sql, worker/inventory.ts, worker/animals.ts, worker/admin.ts, worker/index.ts, src/components/ModuloInventario.tsx, src/components/ModuloAnimales.tsx, tests/inventory.integration.test.ts, tests/animals.integration.test.ts, tests/admin.integration.test.ts | Continúa T11 (pesajes y producción porcina). Decisión de capacidad sigue abierta; mientras tanto solo se muestra aviso y no se impide el traslado. |
| 2026-11-07 | T11 | Completada | Suite completa 73/73; integración de animales 12/12; typecheck, lint y build correctos. Pesajes con hora y lote/ubicación históricos, orden cronológico, ganancia diaria sin tasa de intervalos de cero días y corrección inmutable auditada/idempotente. Se comprobó 44 kg del 20/06 cargado antes de 38 kg del 05/06; fecha/hora del mismo día; corrección conserva original. D1 staging migración 0009 y Worker `b97cc1e6-94c1-4fea-b2ea-0bd22fad9325`; smoke `/animales` y `/animal/T11-PESO` 200, API sin sesión 401. Commit `64c63af` pusheado a main. | migrations/0009_weight_measurement_order.sql, worker/animals.ts, src/components/ModuloAnimales.tsx, tests/animals.integration.test.ts | Sigue T12. No se cambió producción. |
| 2026-11-07 | T12 | Completada | Suite completa 74/74; typecheck, lint y build correctos. Prueba de integración incluye 116 días 23/01/2021→19/05/2021 y 114 días 25/05/2026→16/09/2026; servicios sucesivos conservados, fecha manual con motivo, palpación, aborto idempotente, cierre retirado de pendientes, autorización por perfil y antecedente gestante sin servicio ficticio. Migración 0010 aplicada a staging; `/reproduccion` 200 HTML, API sin sesión 401; tablas de ciclos, servicios y eventos verificadas; versión Worker `65138982-20a1-4e0f-a4df-ce82c9333ed1`. | migrations/0010_reproduction_cycles.sql, worker/reproduction.ts, worker/index.ts, src/components/ModuloReproduccion.tsx, src/main.tsx, src/components/Navbar.tsx, tests/animals.integration.test.ts | Siguiente: T13 parto y camada atómicos. Producción sigue sin cambios. |
| 2026-11-08 | T13 | Completada | T13 guarda en una escritura lógica camada, cierre de ciclo, inventario de vivos por sexo y auditoría; nacidos muertos quedan fuera del stock. Con 8 vivos y 1 muerto calcula 9 nacidos y 11,11 %; lactancia configurada a 21 días da destete previsto 07/10/2026 para parto del 16/09. Reintento conserva la misma camada y no duplica stock. Dos fichas (una hembra y un macho) mantienen 8 cabezas totales; admite individualizar solo el número disponible por sexo. El ajuste a 7 vivos devuelve 409 con ocho fichas ya vinculadas; ajuste antes de individualizar agrega movimiento negativo auditado. Antecedente de parto anterior al ingreso se marca histórico y no añade existencias. Suite completa 75/75; typecheck, lint y build correctos. Migración 0011 aplicada en D1 staging; tablas `litters`, `litter_corrections`, `litter_identification_guard` verificadas. `/reproduccion` 200 y API de ciclos sin sesión 401. Worker staging versión `584009d9-2501-4576-b67a-ee50018f334f`. | migrations/0011_litters_and_farrowing.sql, worker/litters.ts, worker/animals.ts, worker/index.ts, src/components/ModuloReproduccion.tsx, tests/animals.integration.test.ts | Sigue T14 (destete y repeticiones). Producción no fue modificada. |
| 2026-11-08 | T14 | Completada | Registro idempotente de muerte en lactancia con causa y salida de inventario; destete parcial por sexo con peso y destino de etapa/galpón mueve 6 de preinicio a inicio sin aumentar el total; adopción enlaza eventos de salida/entrada en un lote y conserva el stock. Saldos por sexo descuentan bajas, adopciones y destetes y suman adopciones recibidas; guardas atómicas evitan exceder el saldo. Plan postdestete guarda fecha real, tres intervalos, fechas previstas y observaciones reales; 20/05 + 5/10/20 produce 25/05, 04/06 y 24/06 también al reabrir. Suite completa 76/76; typecheck, lint y build correctos. Migración 0012 aplicada a staging; tablas de eventos, plan y guard verificadas. `/reproduccion` 200, API sin sesión 401. Worker staging `eb7769ac-8efb-40e4-84dc-54b4297b9e57`. Sin datos de prueba remotos ni cambios a producción. | migrations/0012_weaning_events_and_cycles.sql, worker/litters.ts, worker/reproduction.ts, worker/index.ts, src/components/ModuloReproduccion.tsx, tests/animals.integration.test.ts | Sigue T15 (almacenes y suministros). |
| 2026-11-08 | T15 | Completada | Libro de alimento por almacén/lote con saldos iniciales, compras, entradas, entregas, mermas y devoluciones; cantidades en kg y costos en centavos; fecha efectiva y auditoría idempotente. Entrega a galpón o animal valida galpón histórico y permisos. Vista de existencias reconstruye cantidad y costo asignado desde el mismo libro; saldo retroactivo negativo se revierte atómicamente con 409. Prueba: entrada 602 kg − entrega 123 kg = 479 kg; costo único imputado S/ 307,50; replay no duplica; retiro el día anterior a la compra rechazado 409; dos retiros concurrentes de 300 kg sobre 479 kg dan 201 y 409, dejando 179 kg; las entregas de un galpón ajeno no aparecen en el historial del usuario limitado a otro galpón. Suite 77/77; typecheck, lint y build correctos. Migración 0013 y Worker staging `13772b37-aa4c-4bba-bb19-e60746d981eb`; `/alimentacion` 200, API sin sesión 401. Producción sin cambios. | migrations/0013_feed_warehouses_and_ledger.sql, worker/feed.ts, worker/index.ts, src/components/ModuloAlimentacion.tsx, src/components/Navbar.tsx, src/main.tsx, src/types/index.ts, tests/feed.integration.test.ts | Sigue T16 (planificar raciones y calcular cobertura). |
| 2026-11-08 | T16 | Completada | Proyección por etapa y alimento combina existencias de cabezas a fecha, ración diaria/duración vigentes y stock real sin descontarlo. Turnos guardan mañana/tarde/noche, galpón/etapa, kg previstos, servidos y consumo real medido; el servido se enlaza al único movimiento de salida, costo y auditoría en un batch, con replay sin duplicar. Conversión a 30 días usa consumo medido y ganancia entre pesajes del mismo animal, galpón y etapa; si falta evidencia o la ganancia es no positiva, explica por qué no muestra índice. CA-07: 35 × 0,65 = 22,75 kg/día; 479 kg cubren 21 días frente a 477,75 kg de etapa y faltan 203,50 kg para 30 días; inventario sigue en 479 tras consultar. Etapa vacía muestra cero y no requiere parámetros. Turno de 2 kg descuenta stock una vez y consume 1,8 kg; ganancia comparable 10 kg da conversión 0,18 kg/kg. Suite 77/77; typecheck, lint y build correctos. Migración 0014 y Worker staging `b3123ea8-75d8-4cb3-af65-62e6a69d592e`; `/alimentacion` 200 y API sin sesión 401. Producción no modificada. | migrations/0014_feed_projections_and_turns.sql, worker/feed.ts, worker/index.ts, src/components/ModuloAlimentacion.tsx, tests/feed.integration.test.ts | Sigue T17 (historial clínico y tratamientos). |
| 2026-11-08 | T17 | Completada | Historial individual y grupal de tratamiento/desparasitación con producto, lote sanitario, dosis/unidad, actor responsable, observaciones, próxima fecha y retiro. Cada animal queda unido al evento con código, galpón, ubicación, etapa y lote capturados a fecha efectiva; consulta filtrable por animal/producto/lote/fecha. Venta valida retiro y responde 409 mientras esté vigente. Bajas por muerte crean exactamente un evento `death` con causa/responsable y vínculo `health_event_id` en el mismo lote que cierra ficha y descuenta inventario; replay no duplica. Escritura sanitaria restringida a veterinario/administrador; lectura respeta alcance de galpones. Próximas actuaciones y retiros vigentes visibles en agenda separada. Suite 78/78; typecheck, lint y build correctos. Migración 0015 aplicada a staging; Worker `3cb5c01e-3176-4208-bc81-934ba3bd7f33`; `/sanidad` 200 y API sin sesión 401. Producción sin cambios. | migrations/0015_health_events_and_withdrawals.sql, worker/health.ts, worker/animals.ts, worker/index.ts, src/components/ModuloSanidad.tsx, src/components/Navbar.tsx, src/main.tsx, src/types/index.ts, tests/animals.integration.test.ts | Sigue T18 (programar vacunas y registrar su aplicación). |
| 2026-11-07 | T09 | Completada | Fichas individuales con código permanente textual, arete inicial e historial de cambios, sexo/tipo/raza/alias, fechas y pesos, procedencia, aptitud, genealogía interna o externa, galpón/ubicación/lote y observaciones. Alta de nacimiento, compra o saldo inicial genera ficha, pesajes de origen y una sola cabeza en el libro dentro de la misma operación idempotente; vincular una cabeza de grupo solo reduce el saldo sin sumar otra. Ficha deriva edad y último peso, conserva historial de aretes/tipo/pesajes/movimientos y ofrece filtros combinables por código/alias/arete, tipo, sexo, estado, etapa, disponibilidad, galpón, ubicación y lote. Cambio de tipo mantiene ID y cabeza; tipos cerda/verraco validan sexo. Desactivar ficha requiere motivo y no registra venta/muerte. Alcance por galpón probado; sin asignaciones devuelve 404. 9/9 pruebas específicas; suite 64/64, integración 52/52, E2E 2/2, typecheck, lint, build y dry-run staging correctos. Migración 0006 aplicada y Worker desplegado en staging; smoke `/animales` y `/animal/002` 200 HTML, `/api/animals` 401; tablas verificadas en D1. | migrations/0006_animals_schema.sql, worker/animals.ts, worker/inventory.ts, worker/index.ts, src/components/ModuloAnimales.tsx, tests/animals.integration.test.ts; commit `f902675`; Worker staging versión `35816410-622a-40d9-b586-7eeea51fed93` | Reproducción y sanidad se integran a la cronología al completar T12–T18. La ficha informa ubicación de ingreso; traslados de ficha identificada y derivación histórica de ubicación corresponden a T10. Continuar con T10. |
| 2026-11-07 | T08 | Completada | Libro inmutable de movimientos de cabezas (`inventory_movements`) con tipo excluyente (saldo inicial, compra, nacimiento, venta, muerte, traslado recibido/enviado y ajuste), fecha efectiva, galpón, ubicación, lote, etapa y sexo. Existencias a fecha de corte y resumen por etapa calculados desde la misma fuente; el detalle reconstruye el total del tablero. Validación cronológica impide saldos negativos, incluidas correcciones retroactivas (409). Idempotencia con clave de reintento (200 en replay, 409 con contenido distinto) y auditoría con autor, motivo y fecha efectiva. Traslados internos verificados cancelando el total de la granja; su API queda para T10. Permisos: veterinario solo lectura (403 al escribir), operario limitado a sus galpones (403 fuera de alcance). Interfaz `ModuloInventario` con fecha de corte, KPIs, resumen por etapa, saldos por grupo, desglose por sexo, formulario de movimiento y listado filtrable; rutas `/inventario` y `/configuracion` enlazadas, configuración visible solo para administrador. 8/8 pruebas nuevas y 55/55 en total, typecheck, lint y build correctos. Migración 0005 aplicada en staging y producción; ambos Workers desplegados. Verificación en vivo: producción `/api/inventory` 401 sin sesión y 200 autenticado con 2 galpones y 8 etapas; staging registró un saldo inicial de 2 cabezas y el snapshot pasó de 0 a 2 disponibles. | worker/inventory.ts, worker/index.ts, migrations/0005_inventory_schema.sql, tests/inventory.integration.test.ts, src/components/ModuloInventario.tsx, src/main.tsx, src/components/Navbar.tsx, src/types/index.ts | Siguiente: T09 (alta y consulta de animales) para separar identificados de no identificados. El desglose individual queda en 0 identificadas / todas sin identificar. |
| 2026-11-07 | Despliegue | Completada | Migraciones 0001–0004 aplicadas en remoto a `webporcicola-staging` (0e990468-3530-4e3a-a1df-530721ce38d7) y `webporcicola-produccion` (1a6f4451-bde8-46cf-beae-ed4dd76d34c0); 12 tablas de aplicación verificadas en ambas. Administrador inicial insertado directo en D1 y bootstrap cerrado. Worker de producción desplegado con `npx wrangler deploy --config dist/web_porcicola/wrangler.json` (versión c7794b50-9355-4939-8917-7b3f5d304470). Verificación en vivo contra https://web-porcicola-produccion.luisalatta.workers.dev: `/` 200 text/html, `/dashboard` 200 (SPA), `/api/auth/me` 401 sin sesión, `/api/no-existe` 404, login 200 con cookie de sesión y `/api/config` 200 autenticado con las semillas de T07. | wrangler.jsonc, migrations/0001-0004, dist/web_porcicola/wrangler.json | Cambiar la contraseña inicial débil desde el módulo de administración. |
| 2026-11-07 | Despliegue staging | Completada | Base staging verificada vacía y con migraciones 0001–0004. Administrador inicial insertado directo en D1 (bootstrap cerrado) con galpones A/B asignados. Worker de staging compilado con `CLOUDFLARE_ENV=staging` y desplegado con `npx wrangler deploy --config dist/web_porcicola/wrangler.json` (versión e9ef04a6-3ed2-43ae-9258-1a257a231025). Verificación en vivo contra https://web-porcicola-staging.luisalatta.workers.dev: `/` 200 text/html, `/dashboard` 200 (SPA), `/api/auth/me` 401 sin sesión, `/api/no-existe` 404, login 200 con cookie y `/api/config` 200 con 4 parámetros, 11 catálogos, 8 etapas, 3 ubicaciones y 2 lotes. | wrangler.jsonc, migrations/0001-0004, dist/web_porcicola/wrangler.json | Cambiar la contraseña inicial débil desde el módulo de administración. |
| 2026-11-07 | Cierre 2 | Completada | Verificación con dos sesiones de administrador: los cambios de la sesión uno se ven de inmediato en la sesión dos. Matriz de acceso directo probada en 3 perfiles (responsable, operario y veterinario) contra 6 rutas: listar cuentas, crear cuenta, listar galpones, eliminar galpón, consultar auditoría y escribir configuración; las 18 combinaciones devuelven 403 y no dejan efectos (la cuenta intrusa no se crea y el galpón permanece). Revocación inmediata: al desactivar una cuenta se revocan sus sesiones, `/api/auth/me` y `/api/data/resumen` pasan a 401, y reactivar la cuenta no revive el token anterior; el cambio de rol se refleja en la sesión existente y el logout revoca el token en el acto. 47/47 pruebas, typecheck, lint y build correctos. | tests/cierre2.integration.test.ts, worker/admin.ts (revocación de sesiones al desactivar), migrations/0001-0004 | Fase 2 cerrada. Siguiente: T08 (inventario individual y colectivo). |
| 2026-11-07 | T07 | Completada | Configuración versionada de la granja implementada: catálogos de sexo, estado, etapa, aptitud, ubicación, lote, causas, tipo de servicio, estado fisiológico y alimento; ocho etapas con pesos y edades inicial/final, duración, ración y consumo diario/mensual/total; parámetros generales (nombre, zona horaria, moneda y unidad de peso); ubicaciones físicas con jerarquía y lotes de manejo separados de la etapa productiva. Cada cambio se versiona por fecha efectiva, se audita con la convención de T06 (clave de reintento, autor, motivo, datos previos/nuevos) y conserva los valores anteriores. Los límites abiertos se guardan en null y se distinguen de cero. Retirar un valor lo excluye de las opciones nuevas sin borrar su histórico. Interfaz con pestañas de Parámetros, Catálogos, Etapas y Raciones, y Ubicaciones y Lotes, con consulta por fecha, historial de versiones y motivos obligatorios en retiros. 42/42 pruebas, typecheck, lint y build correctos. | worker/config.ts, worker/index.ts, migrations/0004_farm_config_schema.sql, tests/config.integration.test.ts, src/components/ModuloConfiguracion.tsx, src/components/ModuloAdministracion.tsx, src/utils/operations.ts | Siguiente: Cierre 2 (dos sesiones, permisos y revocación inmediata). Despliegue remoto y migración 0004 aún no ejecutados; se harán al configurar el entorno de producción. |
| 2026-11-07 | T06 | Completada | Infraestructura de operaciones idempotentes y auditoría implementada: `worker/events.ts` normaliza el payload con JSON canónico + SHA-256, registra clave única por autor en `operation_log` (versión, autor, galpón, fecha efectiva y de registro) y devuelve el resultado previo en un replay. Contenido distinto con la misma clave responde 409 sin escribir. Primer flujo real: asignación de equipo de galpón idempotente y corrección con historial (`barn_team_history` versionado: `valid_until`, `reason`, `is_current`, `corrects_history_id`, `superseded_by_id`), que conserva la fila original y audita autor/motivo/fechas/datos previos y nuevos. Auditoría expuesta solo al administrador en `GET /api/admin/audit`. UI: formulario de equipo con fecha efectiva, motivo y clave de reintento; historial con vigencia, motivo, estado y botón Corregir; modal de corrección; pestaña de auditoría con detalle JSON. Los errores conservan los campos y la misma clave para reintentar (ACC-04, GES-03). 35/35 pruebas, typecheck, lint y build correctos. | worker/events.ts, worker/admin.ts, worker/index.ts, migrations/0003_events_audit_schema.sql, tests/events.integration.test.ts, src/components/ModuloAdministracion.tsx | Siguiente tarea: T07 (Configurar la granja y sus parámetros). El corte real de red se representa con el replay posterior al guardado; el formulario inválido conserva campos y clave en la UI. |
| 2026-11-07 | T05 | Completada | Módulo exclusivo de administración implementado y verificado: API server-side en /api/admin/* con restricción estricta 403 Forbidden para perfiles no administradores (CA-27); gestión de cuentas en los 4 perfiles; alta, edición, estado y eliminación de galpones sin registros (CFG-06); asignación atómica de equipo (Usuario responsable, Operario, Veterinario) con bloqueo de activación si el equipo está incompleto; sustitución con registro de vigencia, autor y asignación anterior en barn_team_history, donde el profesional sustituido pierde acceso de inmediato (CA-28); invariante de administrador activo (impide desactivar o quitar rol al único admin); y protección de Usuario responsable (impide dejarlo sin galpones sin reasignación o desactivación atómica). Interfaz ModuloAdministracion integrada en SPA con pestañas y modales limpios. 30/30 pruebas pasadas. | worker/admin.ts, worker/index.ts, migrations/0002_administration_schema.sql, src/components/ModuloAdministracion.tsx, tests/admin.integration.test.ts | Siguiente tarea: T06 (Registrar eventos con reintentos y auditoría). |
| 2026-11-07 | T04 | Completada | Autenticación completa implementada: inicialización bootstrap de un solo uso con bloqueo a segundos intentos (403), PBKDF2 WebCrypto con SHA-256 (100k iteraciones), sesiones revocables en D1 con tokens hasheados, cookies HttpOnly/Secure/SameSite=Lax y Bearer auth, logout con revocación inmediata y Max-Age=0, protección ante cuentas desactivadas, rate limiting de intentos fallidos (429), defensas CSRF por origen y protección de datos operativos (401 sin sesión). Interfaz de login actualizada con identidad institucional y control de visibilidad de contraseña (ACC-01, ACC-03, ACC-05). 23/23 pruebas pasadas. | worker/auth.ts, worker/index.ts, migrations/0001_initial_schema.sql, tests/auth.integration.test.ts, src/components/BocetoLogin.tsx | Siguiente tarea: T05 (Módulo exclusivo de administración y activación de equipo completo). |
| 2026-11-07 | T03 y Cierre 1 | Completada | En Miniflare D1: atomicidad en lote, claves foráneas, restricciones UNIQUE/CHECK, concurrencia de saldo con precondición (solo 1 de 2 solicitudes de 7 sobre 10 tiene éxito, saldo final 3), idempotencia ante pérdida de red y rechazo 409 por payload alterado, y migraciones ordenadas con tabla _d1_migrations. En exportaciones: generación real y validación de PDF paginado con pdf-lib y XLSX OpenXML con fflate (acentos, moneda S/, pesos kg, <500ms y <150KB para 300 filas). Decisión: exportación en cliente con datos autorizados por API. 16/16 pruebas pasadas. | tests/d1.integration.test.ts, tests/export.test.ts, src/utils/exportPdf.ts, src/utils/exportXlsx.ts, tasks/decisiones.md | Fase 1 concluida con éxito. Siguiente paso: Fase 2 Acceso (T04: sesiones y primer administrador). |
| 2026-11-07 | T02 | Completada | Bocetos navegables interactivos implementados en React con 4 perfiles y 5 vistas; estados de carga, vacío, error/rechazo, offline, pendiente local y confirmado; moneda S/, peso kg y fechas locales. Scripts test:integration y test:e2e configurados. 11/11 pruebas pasadas, typecheck, lint y build production/staging correctos. | src/components/, src/types/, tests/bocetos.test.ts, tests/routes.e2e.test.ts, README.md | Continuar con T03: migraciones D1, reintentos y evaluación de exportadores PDF/XLSX. |
| 2026-11-07 | T02 y T03 | En curso | D1 de staging y producción separadas; test de configuración detectó intencionalmente un ID compartido. En Miniflare pasaron restricciones, referencia foránea, duplicado e índice. npm test: 6/6; typecheck, lint y build production correctos. | tests/configuration.test.ts, tests/d1.integration.test.ts, wrangler.jsonc | Faltan bocetos, comprobación de fallo en CI remoto, secretos por ambiente, migraciones y pruebas de exportación. Ninguna de las dos tareas se marca completa. |
| 2026-11-07 | T02 | En curso | GitHub Actions aprobó instalación, tipos, lint, 3 pruebas y compilación para 626c325. Compilación con CLOUDFLARE_ENV=staging incluye la base de pruebas correcta. | Ejecución 42421385045; wrangler.jsonc | Falta demostrar fallo controlado en CI, establecer producción separada y completar bocetos navegables. |
| 2026-11-07 | T02 | En curso | Wrangler whoami verificó cuenta designada; D1 staging creada y consultada; tipos regenerados para staging. npm test 3/3, typecheck y build correctos. | wrangler.jsonc y tasks/decisiones.md | Falta comprobar CI remoto con cambio defectuoso, configuración de producción separada y bocetos. |
| 2026-11-07 | T03 | En curso | Miniflare D1: fallo de restricción en segunda escritura revierte el lote; dos peticiones concurrentes de salida sobre un saldo de 10 dejan saldo 3 y un movimiento. npm test: 3 pruebas aprobadas. | tests/d1.integration.test.ts | Faltan migraciones, claves foráneas, pruebas de duplicados, pérdida de respuesta y evaluación de PDF/XLSX. No se cierra T03 hasta completar T02 y todos sus criterios. |
| 2026-11-07 | T02 | En curso | npm ci, build y test en copia temporal; typecheck y lint pasan; rutas / y /animales 200, API desconocida 404. | Configuración local de Vite y Worker | Faltan CI ejecutado con prueba defectuosa, entornos D1 y secretos separados, bocetos y validación de clon limpio. Auditoría registra 10 alertas moderadas en dependencias de desarrollo. |
| 2026-11-07 | T01 | Completada | Revisión de requisitos, sección 13 y trazabilidad; 13 temas con responsable de validación y tarea límite. | tasks/decisiones.md | Datos de producción y Android reales pendientes de responsables. |

## Decisiones de la granja

| Tema | Responsable | Fecha límite / tarea afectada | Decisión y fecha | Validación pendiente |
|---|---|---|---|---|
