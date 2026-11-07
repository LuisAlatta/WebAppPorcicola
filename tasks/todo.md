# Control de ejecución

Estado inicial: planificación preparada; implementación, pruebas y despliegue pendientes. Consultar [plan](plan.md) y [requisitos](requisitos.md). Marcar una tarea solo después de registrar evidencia. Para un caso, guardar el resultado real, no solo el esperado.

## 1. Preparación

- [x] T01 · Fijar alcance y decisiones · dependencias —.
- [ ] T02 · Crear proyecto reproducible · dependencias 01.
- [ ] T03 · Probar D1 y exportaciones antes de comprometer la arquitectura · dependencias 02.
- [ ] Cierre 1: Instalar en una copia limpia y repetir la prueba de atomicidad en el runtime de Workers. Registrar la elección de exportadores.

## 2. Acceso

- [ ] T04 · Implementar sesiones y primer administrador · dependencias 03.
- [ ] T05 · Implementar módulo exclusivo de administración · dependencias 04.
- [ ] T06 · Registrar eventos con reintentos y auditoría · dependencias 05.
- [ ] T07 · Configurar la granja y sus parámetros · dependencias 05,06.
- [ ] Cierre 2: Desde dos sesiones distintas verificar que solo el administrador gestione usuarios y que la revocación sea inmediata. Revisar la matriz de permisos con ejemplos de acceso directo.

## 3. Animales e inventario

- [ ] T08 · Abrir inventario individual y colectivo · dependencias 07.
- [ ] T09 · Dar de alta y consultar animales · dependencias 08.
- [ ] T10 · Transferir, dar de baja, conciliar y corregir · dependencias 09.
- [ ] T11 · Registrar producción y pesajes · dependencias 09,10.
- [ ] Cierre 3: Reconstruir el saldo a dos fechas desde el historial. Comparar la suma de grupos e identificados con la ocupación. Probar dos escritores y un reintento.

## 4. Reproducción

- [ ] T12 · Abrir y seguir ciclos reproductivos · dependencias 09,10.
- [ ] T13 · Registrar parto y camada de forma atómica · dependencias 12.
- [ ] T14 · Destetar y calcular repeticiones · dependencias 13.
- [ ] Cierre 4: Recorrer servicio → parto → identificación → destete. Conciliar animales y fechas en la ficha y en la agenda.

## 5. Alimentación y sanidad

- [ ] T15 · Controlar almacenes y suministros · dependencias 10.
- [ ] T16 · Planificar raciones y calcular cobertura · dependencias 11,15.
- [ ] T17 · Historial clínico y tratamientos · dependencias 10,14.
- [ ] T18 · Programar vacunas y registrar su aplicación · dependencias 12,13,17.
- [ ] Cierre 5: Registrar alimento, tratamiento y vacuna. Repetir los dos fallos señalados por el cliente y verificar los valores reales de la ficha.

## 6. Finanzas

- [ ] T19 · Libro de ingresos y egresos · dependencias 15.
- [ ] T20 · Compras, ventas y correcciones integradas · dependencias 10,17,19.
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
| ACC-01 | T04 | Pendiente |
| ACC-02 | T27 | Pendiente |
| ACC-03 | T04 | Pendiente |
| ACC-04 | T06 | Pendiente |
| ACC-05 | T04 | Pendiente |
| ACC-06 | T05 | Pendiente |
| ACC-07 | T05 | Pendiente |
| ADM-01 | T05 | Pendiente |
| ADM-02 | T05 | Pendiente |
| ADM-03 | T05 | Pendiente |
| ADM-04 | T05 | Pendiente |
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
| ALI-01 | T15 | Pendiente |
| ALI-02 | T16 | Pendiente |
| ALI-03 | T16 | Pendiente |
| ALI-04 | T16 | Pendiente |
| ALI-05 | T15 | Pendiente |
| ALI-06 | T16 | Pendiente |
| ALI-07 | T15 | Pendiente |
| ANI-01 | T09 | Pendiente |
| ANI-02 | T09 | Pendiente |
| ANI-03 | T09 | Pendiente |
| ANI-04 | T09 | Pendiente |
| ANI-05 | T09 | Pendiente |
| ANI-06 | T09 | Pendiente |
| ANI-07 | T09 | Pendiente |
| ANI-08 | T09 | Pendiente |
| CAM-01 | T13 | Pendiente |
| CAM-02 | T13 | Pendiente |
| CAM-03 | T13 | Pendiente |
| CAM-04 | T13 | Pendiente |
| CAM-05 | T13 | Pendiente |
| CAM-06 | T14 | Pendiente |
| CAM-07 | T13 | Pendiente |
| CAM-08 | T14 | Pendiente |
| CFG-01 | T07 | Pendiente |
| CFG-02 | T07 | Pendiente |
| CFG-03 | T07 | Pendiente |
| CFG-04 | T07 | Pendiente |
| CFG-05 | T07 | Pendiente |
| CFG-06 | T05 | Pendiente |
| CFG-07 | T10 | Pendiente |
| FIN-01 | T19 | Pendiente |
| FIN-02 | T19 | Pendiente |
| FIN-03 | T21 | Pendiente |
| FIN-04 | T20 | Pendiente |
| FIN-05 | T21 | Pendiente |
| FIN-06 | T25 | Pendiente |
| GES-01 | T20 | Pendiente |
| GES-02 | T21 | Pendiente |
| GES-03 | T06 | Pendiente |
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
| INV-01 | T08 | Pendiente |
| INV-02 | T08 | Pendiente |
| INV-03 | T08 | Pendiente |
| INV-04 | T09 | Pendiente |
| INV-05 | T10 | Pendiente |
| INV-06 | T10 | Pendiente |
| INV-07 | T10 | Pendiente |
| PRO-01 | T11 | Pendiente |
| PRO-02 | T11 | Pendiente |
| PRO-03 | T11 | Pendiente |
| PRO-04 | T10 | Pendiente |
| PRO-05 | T10 | Pendiente |
| PRO-06 | T11 | Pendiente |
| REP-01 | T12 | Pendiente |
| REP-02 | T12 | Pendiente |
| REP-03 | T12 | Pendiente |
| REP-04 | T12 | Pendiente |
| REP-05 | T12 | Pendiente |
| REP-06 | T12 | Pendiente |
| REP-07 | T14 | Pendiente |
| REP-08 | T14 | Pendiente |
| REP-09 | T12 | Pendiente |
| REP-10 | T18 | Pendiente |
| RPT-01 | T24 | Pendiente |
| RPT-02 | T24 | Pendiente |
| RPT-03 | T24 | Pendiente |
| RPT-04 | T25 | Pendiente |
| RPT-05 | T26 | Pendiente |
| RPT-06 | T25 | Pendiente |
| SAN-01 | T17 | Pendiente |
| SAN-02 | T17 | Pendiente |
| SAN-03 | T17 | Pendiente |
| SAN-04 | T17 | Pendiente |
| SAN-05 | T18 | Pendiente |
| SAN-06 | T18 | Pendiente |
| SAN-07 | T18 | Pendiente |
| SAN-08 | T18 | Pendiente |
| SAN-09 | T18 | Pendiente |
| SAN-10 | T17 | Pendiente |

## Casos de aceptación

Los datos y resultados esperados están en la sección 12 de [requisitos](requisitos.md). T29 vuelve a ejecutar la serie completa en el entorno de pruebas.

| Caso | Validación inicial | Resultado y evidencia |
|---|---|---|
| CA-01 | T09 | Pendiente |
| CA-02 | T12 | Pendiente |
| CA-03 | T13 | Pendiente |
| CA-04 | T10 | Pendiente |
| CA-05 | T20 | Pendiente |
| CA-06 | T11 | Pendiente |
| CA-07 | T16 | Pendiente |
| CA-08 | T17 | Pendiente |
| CA-09 | T14 | Pendiente |
| CA-10 | T25 | Pendiente |
| CA-11 | T10 | Pendiente |
| CA-12 | T13 | Pendiente |
| CA-13 | T18 | Pendiente |
| CA-14 | T14 | Pendiente |
| CA-15 | T18 | Pendiente |
| CA-16 | T12 | Pendiente |
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
| CA-27 | T05 | Pendiente |
| CA-28 | T05 | Pendiente |
| CA-29 | T26 | Pendiente |
| CA-30 | T20 | Pendiente |
| CA-31 | T26 | Pendiente |
| CA-32 | T26 | Pendiente |

## Registro de avance

| Fecha | Tarea | Estado | Prueba ejecutada y resultado real | Evidencia / commit | Pendiente o decisión |
|---|---|---|---|---|---|
| 2026-11-07 | T03 | En curso | Miniflare D1: fallo de restricción en segunda escritura revierte el lote; dos peticiones concurrentes de salida sobre un saldo de 10 dejan saldo 3 y un movimiento. npm test: 3 pruebas aprobadas. | tests/d1.integration.test.ts | Faltan migraciones, claves foráneas, pruebas de duplicados, pérdida de respuesta y evaluación de PDF/XLSX. No se cierra T03 hasta completar T02 y todos sus criterios. |
| 2026-11-07 | T02 | En curso | npm ci, build y test en copia temporal; typecheck y lint pasan; rutas / y /animales 200, API desconocida 404. | Configuración local de Vite y Worker | Faltan CI ejecutado con prueba defectuosa, entornos D1 y secretos separados, bocetos y validación de clon limpio. Auditoría registra 10 alertas moderadas en dependencias de desarrollo. |
| 2026-11-07 | T01 | Completada | Revisión de requisitos, sección 13 y trazabilidad; 13 temas con responsable de validación y tarea límite. | tasks/decisiones.md | Datos de producción y Android reales pendientes de responsables. |

## Decisiones de la granja

| Tema | Responsable | Fecha límite / tarea afectada | Decisión y fecha | Validación pendiente |
|---|---|---|---|---|
