/** Fecha operativa local de la granja (America/Lima, UTC-05 sin horario de verano). */
export function farmToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Crea una clave nueva; el llamador debe conservarla durante un intento. */
export function newOperationKey(prefix: string): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

const pendingAttempts = new Map<string, string>();
export function clearOperationAttempts(): void {
  pendingAttempts.clear();
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Reenvía el mismo intento sin duplicarlo cuando se perdió la respuesta. No guarda borradores. */
export async function fetchOperation(path: string, init: RequestInit): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sin conexión. Este intento no se envió. Conserva el formulario y reintenta al recuperar la red.');
  }
  if (typeof init.body !== 'string') throw new Error('La operación requiere un cuerpo JSON');
  const payload = JSON.parse(init.body) as Record<string, unknown>;
  const suppliedKey = payload.operationKey;
  delete payload.operationKey;
  const method = init.method ?? 'POST';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(payload)));
  const fingerprint = `${method}:${path}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const operationKey = pendingAttempts.get(fingerprint) ?? (typeof suppliedKey === 'string' ? suppliedKey : newOperationKey('operacion'));
  pendingAttempts.set(fingerprint, operationKey);
  try {
    const response = await fetch(path, { ...init, body: JSON.stringify({ ...payload, operationKey }) });
    // Una cabecera HTTP recibida no basta: una respuesta interrumpida sigue siendo incierta.
    await response.clone().json();
    if (response.ok) pendingAttempts.delete(fingerprint);
    return response;
  } catch (cause) {
    throw new Error('No se pudo confirmar el resultado. Conserva los datos y reintenta sin cambiarlos; el mismo intento no se registrará dos veces.', { cause });
  }
}
