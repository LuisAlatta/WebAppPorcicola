# Control de ejecución

Estado actual: T01 a T06 completadas; T07 (Configurar la granja y sus parámetros) pendiente. Leer [estado y guía para retomar](estado.md), [plan](plan.md) y [requisitos](requisitos.md). Marcar una tarea solo después de registrar evidencia. Para un caso, guardar el resultado real, no solo el esperado.

## 1. Preparación

- [x] T01 · Fijar alcance y decisiones · dependencias —.
- [x] T02 · Crear proyecto reproducible · dependencias 01.
- [x] T03 · Probar D1 y exportaciones antes de comprometer la arquitectura · dependencias 02.
- [x] Cierre 1: Instalar en una copia limpia y repetir la prueba de atomicidad en el runtime de Workers. Registrar la elección de exportadores.

## 2. Acceso

- [x] T04 · Implementar sesiones y primer administrador · dependencias 03.
- [x] T05 · Implementar módulo exclusivo de administración · dependencias 04.
- [x] T06 · Registrar eventos con reintentos y auditoría · dependencias 05.
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
| ACC-01 | T04 | Verificado con tests/auth.integration.test.ts y BocetoLogin |
| ACC-02 | T27 | Pendiente |
| ACC-03 | T04 | Verificado con tests/auth.integration.test.ts y modelo de roles D1 |
| ACC-04 | T06 | Verificado en tests/events.integration.test.ts: misma clave + mismo contenido devuelve el resultado previo (replayed, sin filas nuevas); contenido distinto con la misma clave da 409 y no escribe; 5 reenvíos concurrentes generan 1 sola fila en operation_log y 1 en audit_log |
| ACC-05 | T04 | Verificado con BocetoLogin (identidad Granja San Luis, visibilidad de clave, perfil y logout) |
| ACC-06 | T05 | Verificado con tests/admin.integration.test.ts (CA-27: exclusividad administrativa, 403 Forbidden para otros perfiles) |
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
| CA-27 | T05 | Verificado en tests/admin.integration.test.ts: solo Administrador crea cuentas y galpones; intentos de responsable, operario y veterinario retornan 403 Forbidden y la DB queda inalterada |
| CA-28 | T05 | Verificado en tests/admin.integration.test.ts: asignación de A y B a Usuario responsable; asignación de Operario y Veterinario; sustitución de Vet1 por Vet3 en Galpón A; Vet1 pierde acceso de inmediato ([]), Vet3 gana acceso ([Galpón A]), Responsable conserva [A, B]; historial registra autor y vigencia |
| CA-29 | T26 | Pendiente |
| CA-30 | T20 | Pendiente |
| CA-31 | T26 | Pendiente |
| CA-32 | T26 | Pendiente |

## Registro de avance

| Fecha | Tarea | Estado | Prueba ejecutada y resultado real | Evidencia / commit | Pendiente o decisión |
|---|---|---|---|---|---|
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
