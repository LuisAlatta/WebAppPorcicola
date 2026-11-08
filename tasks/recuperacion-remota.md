# Ensayo de recuperación remota · 8 de noviembre de 2026

## Resultado observado

Cuenta Wrangler verificada: `newluisalattago@gmail.com`, account `0acfa25b5f619f94d581b8cf882e2eec`. Origen de solo lectura: D1 staging `0e990468-3530-4e3a-a1df-530721ce38d7`. No se exportó ni modificó producción.

Se creó exclusivamente para el ensayo `webporcicola-recovery-20261108`, ID `fa58ed3a-23a5-4fa1-91c6-379001f9769a`. Se importó copia SQL de staging y se comparó con el snapshot local: **52 tablas, 96 filas, todos los conteos iguales y cero errores de claves foráneas**. La importación ejecutó235 sentencias; SQL remoto12,99ms y comando completo6,3s en esta máquina. Son observaciones de una copia pequeña, no un RTO garantizado.

Un Worker de vista previa remota, enlazado únicamente a la copia y accesible por proxy local8788, autenticó una sesión temporal creada solo para el ensayo. Sus APIs recuperaron el número de usuarios esperado, saldo de inventario2 y reporte financiero0filas, coincidentes con el snapshot. Esta copia de staging no tenía operaciones financieras: la recuperación de dinero se prueba por separado en `tests/restore.integration.test.ts` con datos sintéticos.

Se restauró Time Travel al bookmark posterior a la importación y anterior a esa sesión temporal: `00000001-00000016-0000511d-6806a1e8d0994359137bd61b525f96df`. Tras restaurar coincidieron nuevamente52tablas/96filas/FK0 y la misma sesión temporal recibió401: la escritura posterior al corte desapareció.

Al terminar se detuvo la vista previa y **se eliminó la base de ensayo recién creada**. Ese ID ya no es un recurso disponible. Los SQL, conteos y sesión temporal locales permanecen en `.wrangler/recovery/`, excluidos de Git; no copiar sus contenidos a documentación ni repositorio.

## Fallo de importación detectado y solución

El volcado directo produjo `no such table: main.health_events`: algunas inserciones aparecían antes de crear tablas referenciadas. D1 revirtió el intento fallido. La importación final ordenó sentencias así:

1. `PRAGMA defer_foreign_keys=ON`.
2. Todas las sentencias `CREATE TABLE`, sin ejecutar datos todavía.
3. Inserciones y restauración de `sqlite_sequence`.
4. Índices, triggers y vistas, preservando sus definiciones completas.

Para separar sentencias se usó `sqlite3.complete_statement` de Python, que conserva strings y cuerpos de triggers; no dividir ingenuamente por `;`. Verificar que todas las sentencias quedan clasificadas y rechazar cualquier tipo desconocido. SHA256 del archivo reordenado usado: `7958a66c55afded5df5fc5678a261c7c38a1e3f12ca87fefd40fdcde4f03fcff`.

Los conteos se verificaron mediante subconsultas escalares por tabla y `PRAGMA foreign_key_check`. Las consultas `UNION ALL` extensas fueron rechazadas por el servicio y no se usaron como evidencia. El proxy de vista previa rechazó el User-Agent predeterminado de Python; las consultas de verificación funcionaron con un User-Agent de navegador y cookie de sesión, sin exponerla en argumentos ni salida.

## Procedimiento para repetir

- Verificar `wrangler whoami`, correo y account antes de comandos remotos. Crear un destino nuevo y registrar ID; comparar explícitamente que no sea staging ni producción.
- Exportar staging con `npx wrangler d1 export webporcicola-staging --remote --env staging --output <archivo-excluido-de-git.sql>`. La exportación puede suspender consultas durante su ejecución; programarla para mantenimiento si hay usuarios.
- Preparar el SQL ordenado como arriba y un manifiesto local de conteos/conciliaciones del mismo snapshot, no del origen que podría seguir cambiando.
- Usar configuración separada con el único binding D1 del destino. Importar con `wrangler d1 execute <destino> --remote --config <config-aislada> --file <sql-ordenado> --yes`.
- Comparar tablas, secuencias, índices/triggers, claves foráneas y saldos. Ejecutar Worker conectado al destino y verificar consultas autenticadas; sesiones temporales y credenciales deben quedar fuera de Git y revocarse al finalizar.
- Ensayar Time Travel solo en el destino aislado, a bookmark explícito del mismo destino. Repetir conciliación y verificar desaparición de una escritura controlada posterior al corte.
- Detener vista previa y eliminar únicamente el recurso efímero creado para el ensayo, después de cotejar nombre e ID. Nunca usar un ID calculado o un entorno compartido para esta limpieza.

## Límites y condiciones pendientes

La [documentación de límites D1](https://developers.cloudflare.com/d1/platform/limits/) indica retención Time Travel de7días en Free y30en Workers Paid. No se verificó el plan de facturación efectivo; no prometer30días sin comprobarlo. [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) y [exportación/importación](https://developers.cloudflare.com/d1/best-practices/import-export-data/) describen los mecanismos usados.

Este ensayo acredita recuperación remota técnica sobre una copia pequeña. Quedan volumen real, RPO/RTO acordados, custodia externa de respaldos, matriz32casos y validación operativa del piloto. No cerrar T29/T30 solamente por este documento.
