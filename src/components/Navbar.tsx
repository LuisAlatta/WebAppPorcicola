import { useEffect, useState } from 'react';
import type { Perfil, Vista } from '../types';
import { IconLogOut, IconWifiOff } from './icons';

interface NavbarProps {
  vistaActual: Vista;
  perfilActual: Perfil;
  usuario?: string;
  onNavigate: (vista: Vista) => void;
  onLogout: () => void;
}

const profileNames: Record<Perfil, string> = {
  administrador: 'Administrador',
  responsable: 'Responsable',
  operario: 'Operario',
  veterinario: 'Veterinario',
};

export function Navbar({ perfilActual, usuario, onNavigate, onLogout }: NavbarProps) {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  return (
    <header className="navbar-wrapper">
      <div className="navbar-top">
        <div className="navbar-brand">
          <button
            type="button"
            className="brand-link-btn"
            onClick={() => onNavigate('inicio')}
            title="Ir al Menú Principal"
            aria-label="Ir al Menú Principal"
          >
            <span className="brand-text">Mi Granja Pro</span>
          </button>
          <span className="badge-env">{profileNames[perfilActual]}</span>
          {usuario && <span className="text-xs text-muted user-badge-navbar">{usuario}</span>}
        </div>
        <div className="navbar-controls">
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-logout"
            onClick={onLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconLogOut size={16} />
              <span>Salir</span>
            </span>
          </button>
        </div>
      </div>
      {!online && (
        <div className="status-strip strip-offline" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconWifiOff size={16} />
            <span>Sin conexión. Al recuperar la red, comprueba el registro antes de reenviarlo.</span>
          </span>
        </div>
      )}
    </header>
  );
}
