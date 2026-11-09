import React, { lazy, Suspense, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Perfil, Vista } from './types';
import { Navbar } from './components/Navbar';
import { PwaControls } from './components/PwaControls';
import { clearOperationAttempts } from './utils/operations';
import { BocetoLogin } from './components/BocetoLogin';
import { MenuPrincipal } from './components/MenuPrincipal';
import { BottomNav } from './components/BottomNav';
import { ModuloAdministracion } from './components/ModuloAdministracion';
import { ModuloConfiguracion } from './components/ModuloConfiguracion';
import { ModuloInventario } from './components/ModuloInventario';
import { ModuloReproduccion } from './components/ModuloReproduccion';
import { ModuloAlimentacion } from './components/ModuloAlimentacion';
import { ModuloSanidad } from './components/ModuloSanidad';
import { ModuloAlertas } from './components/ModuloAlertas';
const ModuloFinanzas = lazy(() => import('./components/ModuloFinanzas').then(module => ({default:module.ModuloFinanzas})));
const ModuloAnimales = lazy(() => import('./components/ModuloAnimales').then(module => ({default:module.ModuloAnimales})));
const ModuloReportes = lazy(() => import('./components/ModuloReportes').then(module => ({default:module.ModuloReportes})));
import './style.css';
import './pwa.css';

function getInitialView(): Vista {
  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/listado') return 'listado';
    if (path === '/animales') return 'animales';
    if (path === '/reproduccion') return 'reproduccion';
    if (path === '/alta' || path === '/formulario') return 'formulario';
    if (path === '/detalle' || path.startsWith('/animal/')) return 'detalle';
    if (path === '/inventario') return 'inventario';
    if (path === '/alimentacion') return 'alimentacion';
    if (path === '/sanidad') return 'sanidad';
    if (path === '/alertas') return 'alertas';
    if (path === '/finanzas') return 'finanzas';
    if (path === '/reportes') return 'reportes';
    if (path === '/configuracion' || path === '/config') return 'configuracion';
    if (path === '/administracion' || path === '/admin') return 'administracion';
    if (path === '/login') return 'login';
    if (path === '/inicio' || path === '/') return 'inicio';
  }
  return 'inicio';
}

function App() {
  const [vistaActual, setVistaActual] = useState<Vista>(getInitialView);
  const [perfilActual, setPerfilActual] = useState<Perfil>('responsable');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>(() => {
    const match = typeof window !== 'undefined' ? window.location.pathname.match(/^\/animal\/(.+)$/) : null;
    if (!match) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return '';
    }
  });
  const [estaAutenticado, setEstaAutenticado] = useState<boolean>(false);
  const [estadoSesion,setEstadoSesion]=useState<'cargando'|'lista'|'error'>('cargando');
  const [usuarioActual, setUsuarioActual] = useState<string>('');
  const [logoutError,setLogoutError]=useState('');

  useEffect(() => {
    // Verificar si hay sesión activa en el servidor
    const verificarSesion = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json() as { ok: boolean; user: { role: Perfil; username: string } };
          setPerfilActual(data.user.role);
          setUsuarioActual(data.user.username);
          setEstaAutenticado(true);
          setEstadoSesion('lista');
        } else if(res.status===401){
          setEstaAutenticado(false);
          setEstadoSesion('lista');
        } else {
          setEstadoSesion('error');
        }
      } catch {
        setEstaAutenticado(false);
        setEstadoSesion('error');
      }
    };
    verificarSesion();

    const handlePopState = () => {
      setVistaActual(getInitialView());
      const match=window.location.pathname.match(/^\/animal\/(.+)$/);
      if(match){try{setSelectedAnimalId(decodeURIComponent(match[1]));}catch{setSelectedAnimalId('');}}
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (vista: Vista) => {
    setVistaActual(vista);
    if (typeof window !== 'undefined' && window.history) {
      let targetPath = '/';
      if (vista === 'listado') targetPath = '/listado';
      else if (vista === 'animales') targetPath = '/animales';
      else if (vista === 'reproduccion') targetPath = '/reproduccion';
      else if (vista === 'formulario') targetPath = '/alta';
      else if (vista === 'detalle') targetPath = `/animal/${selectedAnimalId}`;
      else if (vista === 'inventario') targetPath = '/inventario';
      else if (vista === 'alimentacion') targetPath = '/alimentacion';
      else if (vista === 'sanidad') targetPath = '/sanidad';
      else if (vista === 'alertas') targetPath = '/alertas';
      else if (vista === 'finanzas') targetPath = '/finanzas';
      else if (vista === 'reportes') targetPath = '/reportes';
      else if (vista === 'configuracion') targetPath = '/configuracion';
      else if (vista === 'administracion') targetPath = '/administracion';
      else if (vista === 'login') targetPath = '/login';
      else if (vista === 'inicio') targetPath = '/inicio';
      window.history.pushState(null, '', targetPath);
    }
  };

  const handleLogin = (perfil: Perfil, username?: string) => {
    clearOperationAttempts();
    setPerfilActual(perfil);
    if (username) setUsuarioActual(username);
    setEstaAutenticado(true);
    if(vistaActual==='login')handleNavigate('inicio');
  };

  const handleLogout = async () => {
    setLogoutError('');
    try {
      const response=await fetch('/api/auth/logout', { method: 'POST' });
      if(!response.ok)throw new Error('No se pudo cerrar la sesión. Vuelve a intentar.');
    } catch {
      setLogoutError('No se pudo cerrar la sesión en el servidor. Comprueba la conexión y vuelve a intentar.');
      return;
    }
    clearOperationAttempts();
    setEstaAutenticado(false);
    handleNavigate('login');
  };

  const renderVista = () => {
    if(estadoSesion==='cargando')return <div className="session-check" role="status">Comprobando sesión…</div>;
    if(estadoSesion==='error')return <div className="session-check" role="alert"><h1>No se pudo comprobar la sesión</h1><p>Comprueba la conexión y vuelve a intentar para acceder a los datos de la granja.</p><button className="btn btn-primary" type="button" onClick={()=>window.location.reload()}>Volver a intentar</button></div>;
    if (!estaAutenticado || vistaActual === 'login') {
      return (
        <BocetoLogin
          onLogin={handleLogin}
        />
      );
    }

    if((vistaActual==='configuracion'||vistaActual==='administracion')&&perfilActual!=='administrador')return <div className="session-check" role="alert"><h1>Acceso restringido</h1><p>Este módulo solo está disponible para el administrador.</p></div>;
    switch (vistaActual) {
      case 'inicio':
        return (
          <MenuPrincipal
            perfil={perfilActual}
            usuario={usuarioActual}
            onNavigate={handleNavigate}
          />
        );
      case 'listado':
      case 'formulario':
        return <Suspense fallback={<div className="module-container">Cargando animales…</div>}><ModuloAnimales perfil={perfilActual} /></Suspense>;
      case 'detalle':
        return <Suspense fallback={<div className="module-container">Cargando ficha…</div>}><ModuloAnimales perfil={perfilActual} initialAnimalKey={selectedAnimalId} /></Suspense>;
      case 'inventario':
        return <ModuloInventario perfil={perfilActual} />;
      case 'alimentacion':
        return <ModuloAlimentacion perfil={perfilActual} />;
      case 'sanidad':
        return <ModuloSanidad perfil={perfilActual} />;
      case 'alertas':
        return <ModuloAlertas perfil={perfilActual} />;
      case 'finanzas':
        return <Suspense fallback={<div className="module-container">Cargando finanzas…</div>}><ModuloFinanzas perfil={perfilActual} /></Suspense>;
      case 'reportes':
        return <Suspense fallback={<div className="module-container">Cargando reportes…</div>}><ModuloReportes perfil={perfilActual} /></Suspense>;
      case 'animales':
        return <Suspense fallback={<div className="module-container">Cargando animales…</div>}><ModuloAnimales perfil={perfilActual} /></Suspense>;
      case 'reproduccion':
        return <ModuloReproduccion perfil={perfilActual} />;
      case 'configuracion':
        return <ModuloConfiguracion />;
      case 'administracion':
        return (
          <ModuloAdministracion
            perfil={perfilActual}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      {estaAutenticado && vistaActual !== 'login' && (
        <Navbar
          vistaActual={vistaActual}
          perfilActual={perfilActual}
          usuario={usuarioActual}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      )}
      <PwaControls />
      {logoutError && <div className="alert alert-danger" role="alert">{logoutError}</div>}

      <main className="main-content">
        {renderVista()}
      </main>

      {estaAutenticado && vistaActual !== 'login' && (
        <BottomNav
          vistaActual={vistaActual}
          perfilActual={perfilActual}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
export { App };
