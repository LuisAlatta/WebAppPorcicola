// Keep the notice in sync even when another tab activates the waiting worker.
export function observeWaitingWorker(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
  onChange: (worker: ServiceWorker | null) => void,
) {
  const workers = new Set<ServiceWorker>();
  const check = () => {
    for (const worker of [registration.installing, registration.waiting]) {
      if (worker && !workers.has(worker)) {
        workers.add(worker);
        worker.addEventListener('statechange', check);
      }
    }
    const waiting = registration.waiting;
    onChange(waiting?.state === 'installed' ? waiting : null);
  };
  registration.addEventListener('updatefound', check);
  container.addEventListener('controllerchange', check);
  check();
  return () => {
    registration.removeEventListener('updatefound', check);
    container.removeEventListener('controllerchange', check);
    for (const worker of workers) worker.removeEventListener('statechange', check);
  };
}

export function activateWaitingWorker(worker: ServiceWorker, container: ServiceWorkerContainer) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      container.removeEventListener('controllerchange', check);
    };
    const check = () => {
      // Activated is not enough: this page must actually use the new worker.
      if (container.controller === worker) {
        cleanup();
        resolve();
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('No se pudo completar la actualización. Inténtalo de nuevo.'));
    }, 20000);
    container.addEventListener('controllerchange', check);
    if (container.controller === worker) {
      check();
      return;
    }
    try {
      worker.postMessage({ type: 'ACTIVATE_UPDATE' });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
