import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionState } from '../src/components/SessionState';
import { BottomNav } from '../src/components/BottomNav';
import { Navbar } from '../src/components/Navbar';
import { PwaInstallButton } from '../src/components/PwaInstallButton';
import { BocetoLogin } from '../src/components/BocetoLogin';

afterEach(() => vi.unstubAllGlobals());

describe('Estados globales y navegación', () => {
  it('muestra carga de sesión sin acción y error con reintento', () => {
    const loading = renderToStaticMarkup(createElement(SessionState, { state: 'loading' }));
    const error = renderToStaticMarkup(createElement(SessionState, { state: 'error', onAction: () => {} }));
    expect(loading).toContain('role="status"');
    expect(loading).toContain('spinner-icon');
    expect(loading).not.toContain('<button');
    expect(error).toContain('role="alert"');
    expect(error).toContain('Volver a intentar');
  });
  it('ofrece salida al inicio cuando se deniega el acceso', () => {
    const html = renderToStaticMarkup(createElement(SessionState, { state: 'denied', onAction: () => {} }));
    expect(html).toContain('Acceso restringido');
    expect(html).toContain('Volver al Inicio');
    expect(html).toContain('btn-outline');
  });
  it('conserva los seis destinos y marca solo el destino activo', () => {
    const html = renderToStaticMarkup(createElement(BottomNav, { vistaActual: 'detalle', perfilActual: 'responsable', onNavigate: () => {} }));
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    for (const label of ['Menú', 'Animales', 'Reproducción', 'Inventario', 'Finanzas', 'Alertas']) expect(html).toContain(`aria-label="${label}"`);
  });
  it('la barra superior tiene regreso, inicio explícito y estado sin conexión', () => {
    vi.stubGlobal('navigator', { onLine: false });
    const html = renderToStaticMarkup(createElement(Navbar, { vistaActual: 'reportes', perfilActual: 'administrador', onNavigate: () => {}, onLogout: () => {} }));
    expect(html).toContain('aria-label="Volver al Inicio"');
    expect(html).toContain('navbar-home');
    expect(html).toContain('Admin.');
    expect(html).toContain('connection-banner');
    expect(html).toContain('comprueba el registro antes de reenviarlo');
  });
  it('presenta instalación como tarjeta solo cuando el dispositivo lo permite', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone Safari', platform: 'iPhone', maxTouchPoints: 1 });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    const html = renderToStaticMarkup(createElement(PwaInstallButton, { card: true }));
    expect(html).toContain('pwa-install-card');
    expect(html).toContain('Instalar aplicación');
  });
  it('el acceso conserva los campos y el control accesible de contraseña', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome', platform: 'Win32', maxTouchPoints: 0 });
    const html = renderToStaticMarkup(createElement(BocetoLogin, { onLogin: () => {} }));
    expect(html).toContain('class="login-card"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="Mostrar contraseña"');
    expect(html).toContain('aria-pressed="false"');
  });
});
