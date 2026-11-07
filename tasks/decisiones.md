# Registro de decisiones y datos por confirmar

Actualizado durante T01. Los responsables indicados son los roles que deben validar cada dato. Ningún valor de prueba autoriza su uso operativo.

| Tema pendiente | Responsable | Se necesita antes de | Datos de prueba o tratamiento provisional |
|---|---|---|---|
| Titular, suplentes, permisos y traslados entre galpones | Responsable de granja | T05 y T10 | Cuatro perfiles y galpones ficticios A y B. Aplicar mínimo permiso. |
| Identificación individual, sexado, fecha de corte y capacidad | Responsable de producción | T08–T10 | Separar animales identificados de grupos y permitir sexo pendiente. |
| Cambios de etapa, límites de edad y peso | Responsable de producción | T07 y T10 | Catálogos configurables; ningún cambio automático sin regla aprobada. |
| Duración de gestación, lactancia y numeración de servicios | Médico veterinario y responsable de producción | T12–T14 | Probar 114 y 116 días, y 21 días para lactancia. Son ejemplos. |
| Protocolo de vacunación, retiro y recurrencias | Médico veterinario | T17–T18 | Probar reglas ficticias; no activar tratamientos reales por defecto. |
| Indicadores de mortalidad, pesos y denominadores | Responsable de producción | T10 y T24 | Mantener separado el promedio por camada de la tasa conjunta. |
| Valoración, prorrateo, moneda y conversión alimenticia | Responsable de finanzas | T16 y T19–T21 | S/ y cifras ficticias para pruebas. |
| Turnos, umbrales de peso, criticidad y destinatarios | Responsable de granja | T22–T23 | Próximos siete días para vacunas y partos; otros umbrales configurables. |
| Conexión en corrales y necesidad de captura sin red | Responsable de granja | T28 | Comprobar reconexión y definir si se habilitan borradores locales. |
| Android disponible, navegador, volumen y concurrencia | Responsable operativo | T26–T30 | Pruebas locales con datos sintéticos; pendiente inventario real. |
| Respaldo, tiempo de recuperación y pérdida tolerable | Responsable de granja | T29–T31 | Probar restauración en entorno aislado y medir tiempos. |
| Ubicaciones, usuarios, lotes y saldos de apertura | Responsable operativo | T30 | Plantillas y datos ficticios hasta recibir información aprobada. |
| Cuenta Cloudflare, dominio y entorno de producción | Administrador del proyecto | T31 | Cuenta confirmada: newluisalattago@gmail.com, ID 0acfa25b5f619f94d581b8cf882e2eec. Bases separadas: webporcicola-staging y webporcicola-produccion. Dominio y despliegue pendientes. |
| Bibliotecas y arquitectura de exportación PDF y XLSX | Administrador del proyecto y responsable técnico | T03 | Aprobado: Generación en cliente con datos autorizados por API. PDF vía `pdf-lib` y XLSX vía `fflate` con OpenXML nativo. Sin vulnerabilidades en producción y sin sobrecargar la memoria del Worker. |

Ventas, finanzas, suministros y reportes PDF y Excel forman parte de la entrega completa.
