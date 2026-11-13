import { IconArrowLeft, IconLock, IconRefreshCw, IconShield } from './icons';

export function SessionState({ state, onAction }: {
  state: 'loading' | 'error' | 'denied';
  onAction?: () => void;
}) {
  const loading = state === 'loading';
  return (
    <section className="session-check card" role={loading ? 'status' : 'alert'} aria-live={loading ? 'polite' : 'assertive'}>
      <span className="session-state-icon" aria-hidden="true">
        {loading ? <IconShield size={28} /> : state === 'denied' ? <IconLock size={28} /> : <IconRefreshCw size={28} />}
      </span>
      <h1>{loading ? 'Comprobando sesión…' : state === 'denied' ? 'Acceso restringido' : 'No se pudo comprobar la sesión'}</h1>
      <p className="text-muted">{loading ? 'Verificando el acceso a los datos de la granja.' : state === 'denied' ? 'Este módulo solo está disponible para el administrador.' : 'Comprueba la conexión y vuelve a intentar para acceder a los datos de la granja.'}</p>
      {loading ? <IconRefreshCw size={20} className="spinner-icon text-primary" /> : (
        <button type="button" className={`btn ${state === 'denied' ? 'btn-outline' : 'btn-primary'} inline-flex items-center justify-center gap-2`} data-action={state === 'denied' ? 'back' : undefined} onClick={onAction}>
          {state === 'denied' ? <IconArrowLeft size={16} /> : <IconRefreshCw size={16} />}
          <span>{state === 'denied' ? 'Volver al Inicio' : 'Volver a intentar'}</span>
        </button>
      )}
    </section>
  );
}
