import { useEffect, useState } from 'react';
import type { Perfil, Vista } from '../types';
import {
  IconActivity,
  IconBarChart,
  IconBell,
  IconBox,
  IconCoins,
  IconGrid,
  IconHeart,
  IconLock,
  IconLogOut,
  IconPig,
  IconSettings,
  IconShield,
  IconWheat,
  IconWifiOff,
} from './icons';

interface NavbarProps {
  vistaActual: Vista;
  perfilActual: Perfil;
  usuario?: string;
  onNavigate: (vista: Vista) => void;
  onLogout: () => void;
}

interface ViewMeta {
  title: string;
  icon: React.ReactNode;
}

const profileNames: Record<Perfil, string> = {
  administrador: 'Administrador',
  responsable: 'Responsable',
  operario: 'Operario',
  veterinario: 'Veterinario',
};

const viewMeta: Record<Vista, ViewMeta> = {
  galpones: { title: 'Galpones', icon: <IconBox size={20} className="text-primary" /> },
  inicio: {
    title: 'Menú Principal',
    icon: <IconGrid size={20} className="text-primary" />,
  },
  animales: {
    title: 'Padrón de Animales',
    icon: <IconPig size={20} className="text-primary" />,
  },
  listado: {
    title: 'Padrón de Animales',
    icon: <IconPig size={20} className="text-primary" />,
  },
  formulario: {
    title: 'Padrón de Animales',
    icon: <IconPig size={20} className="text-primary" />,
  },
  detalle: {
    title: 'Padrón de Animales',
    icon: <IconPig size={20} className="text-primary" />,
  },
  reproduccion: {
    title: 'Manejo Reproductivo',
    icon: <IconHeart size={20} className="text-primary" />,
  },
  inventario: {
    title: 'Inventario de Animales',
    icon: <IconBox size={20} className="text-primary" />,
  },
  alimentacion: {
    title: 'Alimentación y Nutrición',
    icon: <IconWheat size={20} className="text-primary" />,
  },
  sanidad: {
    title: 'Sanidad y Fármacos',
    icon: <IconActivity size={20} className="text-primary" />,
  },
  alertas: {
    title: 'Alertas y Pendientes',
    icon: <IconBell size={20} className="text-primary" />,
  },
  finanzas: {
    title: 'Finanzas de la Granja',
    icon: <IconCoins size={20} className="text-primary" />,
  },
  reportes: {
    title: 'Reportes y Estadísticas',
    icon: <IconBarChart size={20} className="text-primary" />,
  },
  configuracion: {
    title: 'Configuración',
    icon: <IconSettings size={20} className="text-primary" />,
  },
  administracion: {
    title: 'Administración',
    icon: <IconShield size={20} className="text-primary" />,
  },
  login: {
    title: 'Acceso al Sistema',
    icon: <IconLock size={20} className="text-primary" />,
  },
};

export function Navbar({ vistaActual, perfilActual, usuario, onNavigate, onLogout }: NavbarProps) {
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

  const currentMeta = viewMeta[vistaActual] ?? {
    title: 'Menú Principal',
    icon: <IconGrid size={20} className="text-primary" />,
  };

  return (
    <header className="navbar-wrapper">
      <div className="navbar-top">
        <div className="navbar-brand">
          <button
            type="button"
            className="brand-link-btn"
            onClick={() => onNavigate('inicio')}
            title="Ir al Menú Principal"
            aria-label={`Módulo actual: ${currentMeta.title}. Clic para ir al Menú Principal`}
          >
            <span className="inline-flex items-center justify-start gap-2 leading-none brand-text text-left">
              {currentMeta.icon}
              <span>{currentMeta.title}</span>
            </span>
          </button>
        </div>
        <div className="navbar-controls">
          <span className="badge-env">{profileNames[perfilActual]}</span>
          {usuario && <span className="text-xs text-muted user-badge-navbar">{usuario}</span>}
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
