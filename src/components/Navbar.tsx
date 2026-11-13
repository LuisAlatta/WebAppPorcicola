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
  IconHome,
} from './icons';

interface NavbarProps {
  vistaActual: Vista;
  perfilActual: Perfil;
  usuario?: string;
  onNavigate: (vista: Vista) => void;
  onLogout: () => void;
  onBack?: () => void;
  hideBack?: boolean;
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
const shortProfileNames: Record<Perfil, string> = {
  administrador: 'Admin.', responsable: 'Resp.', operario: 'Oper.', veterinario: 'Vet.',
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

export function Navbar({ vistaActual, perfilActual, usuario, onNavigate, onLogout, onBack, hideBack }: NavbarProps) {
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
  const showBack = !hideBack && vistaActual !== 'login' && (!!onBack || !['inicio', 'galpones'].includes(vistaActual));

  return (
    <header className="navbar-wrapper">
      <div className="navbar-top">
        <div className="navbar-brand">
          {showBack && (
            <button type="button" className="btn btn-ghost navbar-back" data-action="back" aria-label={onBack ? 'Volver sin cambiar los galpones' : 'Volver al Inicio'} title={onBack ? 'Volver sin cambiar los galpones' : 'Volver al Inicio'} onClick={onBack ?? (() => onNavigate('inicio'))}>Regresar</button>
          )}
          <button
            type="button"
            className="brand-link-btn"
            onClick={() => onNavigate('inicio')}
            title="Ir al Menú Principal"
            aria-label={`Módulo actual: ${currentMeta.title}. Clic para ir al Menú Principal`}
          >
            <span className="navbar-view-icon">{currentMeta.icon}</span>
            <span className="navbar-titles"><span className="navbar-app-name">Mi Granja PRO <span className="navbar-home"><IconHome size={12} /><span>Inicio</span></span></span><span className="navbar-page-title">{currentMeta.title}</span></span>
          </button>
        </div>
        <div className="navbar-controls">
          <div className="navbar-account"><span className="navbar-role" title={profileNames[perfilActual]}><span className="navbar-role-full">{profileNames[perfilActual]}</span><span className="navbar-role-short" aria-hidden="true">{shortProfileNames[perfilActual]}</span></span>{usuario && <span className="navbar-username" title={usuario}>{usuario}</span>}</div>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-logout"
            onClick={onLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <IconLogOut size={18} />
          </button>
        </div>
      </div>
      {!online && (
        <div className="connection-banner" role="status">
          <span className="inline-flex items-center justify-center gap-2 leading-none">
            <IconWifiOff size={16} />
            <span>Sin conexión. Al recuperar la red, comprueba el registro antes de reenviarlo.</span>
          </span>
        </div>
      )}
    </header>
  );
}
