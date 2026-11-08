# Plantillas de apertura del piloto

Los CSV contienen solo encabezados. No son un importador automático ni registros ya cargados. Completar datos reales únicamente después del ensayo sintético y revisar en seco antes de registrarlos mediante los módulos autorizados.

- Conservar códigos/aretes como texto y no perder ceros iniciales.
- Fechas ISO `AAAA-MM-DD`, decimales con punto, moneda ISO (por ejemplo PEN), unidades explícitas.
- Galpón, ubicación, lote y etapa son dimensiones diferentes y deben existir en catálogos.
- Los animales individuales y los grupos sin identificar no pueden contar dos veces las mismas cabezas. Conciliar a una fecha de corte única.
- Saldo inicial no es compra ni venta; caja inicial se registra aparte del libro de ingresos/egresos. Las cuentas pendientes conservan fecha de operación, abonos e importe pendiente.
- La columna `referencia_origen` permite revisar duplicados y conservar trazabilidad. No asignar nuevas claves para reintentar el mismo registro incierto: primero consultar lo confirmado.
- Usuarios: solo el administrador crea cuentas. No guardar contraseñas en CSV, documentación ni Git.
- Reproducción/sanidad: el veterinario valida antecedentes y reglas; no deducir fechas reales, dosis ni tratamientos de estos encabezados.

Revisión requerida: referencias válidas, duplicados, fechas de nacimiento/ingreso/salida, padres, pesos/unidades, sexo/cabezas, inventario por grupo, moneda y suma de distribuciones financieras. Detener carga ante errores; registrar resultado y autor. La aceptación física y operativa sigue el procedimiento de `../piloto.md`.
