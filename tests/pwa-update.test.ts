import {afterEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {activateWaitingWorker, observeWaitingWorker} from '../src/utils/pwaUpdate';

function setup() {
  const worker = Object.assign(new EventTarget(), {state: 'installed', postMessage: vi.fn()});
  const registration = Object.assign(new EventTarget(), {waiting: worker, installing: null});
  const container = Object.assign(new EventTarget(), {controller: null as typeof worker | null});
  return {worker, registration, container};
}
function observe(context: ReturnType<typeof setup>, onChange: (worker: ServiceWorker | null) => void) {
  return observeWaitingWorker(context.registration as unknown as ServiceWorkerRegistration, context.container as unknown as ServiceWorkerContainer, onChange);
}
function activate(context: ReturnType<typeof setup>) {
  return activateWaitingWorker(context.worker as unknown as ServiceWorker, context.container as unknown as ServiceWorkerContainer);
}

afterEach(() => vi.useRealTimers());

describe('aviso de actualización', () => {
  it('retira el aviso cuando la actualización se activa, también desde otra pestaña', () => {
    const context = setup();
    const changed = vi.fn();
    const stop = observe(context, changed);
    expect(changed).toHaveBeenLastCalledWith(context.worker);
    context.worker.state = 'activating';
    context.worker.dispatchEvent(new Event('statechange'));
    expect(changed).toHaveBeenLastCalledWith(null);
    context.worker.state = 'activated';
    context.container.controller = context.worker;
    context.container.dispatchEvent(new Event('controllerchange'));
    expect(changed).toHaveBeenLastCalledWith(null);
    stop();
    changed.mockClear();
    context.worker.dispatchEvent(new Event('statechange'));
    context.registration.dispatchEvent(new Event('updatefound'));
    context.container.dispatchEvent(new Event('controllerchange'));
    expect(changed).not.toHaveBeenCalled();
  });

  it('detecta una instalación que ya estaba en curso al abrir la aplicación', () => {
    const context = setup();
    context.worker.state = 'installing';
    const changed = vi.fn();
    const stop = observe(context, changed);
    expect(changed).toHaveBeenLastCalledWith(null);
    context.worker.state = 'installed';
    context.worker.dispatchEvent(new Event('statechange'));
    expect(changed).toHaveBeenLastCalledWith(context.worker);
    stop();
  });

  it('no recarga al activarse hasta que la versión nueva controla la página', async () => {
    const context = setup();
    const reloaded = vi.fn();
    const completed = activate(context).then(reloaded);
    expect(context.worker.postMessage).toHaveBeenCalledExactlyOnceWith({type:'ACTIVATE_UPDATE'});
    context.worker.state = 'activated';
    context.worker.dispatchEvent(new Event('statechange'));
    await Promise.resolve();
    expect(reloaded).not.toHaveBeenCalled();
    context.container.dispatchEvent(new Event('controllerchange'));
    await Promise.resolve();
    expect(reloaded).not.toHaveBeenCalled();
    context.container.controller = context.worker;
    context.container.dispatchEvent(new Event('controllerchange'));
    await completed;
    expect(reloaded).toHaveBeenCalledOnce();
    context.container.dispatchEvent(new Event('controllerchange'));
    expect(reloaded).toHaveBeenCalledOnce();
  });

  it('resuelve si otra pestaña ya activó la versión seleccionada', async () => {
    const context = setup();
    context.container.controller = context.worker;
    await expect(activate(context)).resolves.toBeUndefined();
    expect(context.worker.postMessage).not.toHaveBeenCalled();
  });

  it('permite reintentar sin dejar escuchas ni recargas pendientes si falla', async () => {
    vi.useFakeTimers();
    const context = setup();
    const remove = vi.spyOn(context.container, 'removeEventListener');
    const failed = expect(activate(context)).rejects.toThrow('No se pudo completar');
    await vi.advanceTimersByTimeAsync(20000);
    await failed;
    expect(remove).toHaveBeenCalledWith('controllerchange', expect.any(Function));
    context.container.controller = context.worker;
    await expect(activate(context)).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('la activación del service worker toma el control y conserva los archivos de pestañas abiertas', async () => {
    type Listener = (event: {waitUntil: (promise: Promise<void>) => void}) => void;
    const listeners = new Map<string, Listener>();
    const claim = vi.fn().mockResolvedValue(undefined);
    const removeCache = vi.fn();
    const source = readFileSync(new URL('../pwa/service-worker.template.txt', import.meta.url), 'utf8')
      .replace('__VERSION__', 'test').replace('__ASSETS__', '[]');
    runInNewContext(source, {
      self: {addEventListener: (name: string, callback: Listener) => listeners.set(name, callback),
        clients: {matchAll: async () => [{}], claim}},
      caches: {delete: removeCache},
    });
    let activation: Promise<void> | undefined;
    listeners.get('activate')!({waitUntil: promise => {activation = promise;}});
    await activation;
    expect(claim).toHaveBeenCalledOnce();
    expect(removeCache).not.toHaveBeenCalled();
  });
});
