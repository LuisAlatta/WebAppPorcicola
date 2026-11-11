let selectedBarnIds: number[] = [];

export function setSelectedBarnIds(ids: number[]) {
  selectedBarnIds = [...ids];
}

export function installBarnScopeFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')
      || /^\/api\/(auth|admin|config|barns)(\/|$)/.test(url.pathname) || !selectedBarnIds.length) {
      return originalFetch(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('X-Barn-Ids', selectedBarnIds.join(','));
    return originalFetch(input, { ...init, headers });
  };
}
