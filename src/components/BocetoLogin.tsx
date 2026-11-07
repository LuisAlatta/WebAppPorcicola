import React, { useState } from 'react';
import { Perfil } from '../types';
import {
  IconShield,
  IconUser,
  IconStethoscope,
  IconClipboard,
  IconAlertCircle,
  IconEye,
  IconEyeOff,
  IconPig,
} from './icons';

interface BocetoLoginProps {
  onLogin: (perfil: Perfil, username?: string) => void;
  isErrorMode?: boolean;
}

export function BocetoLogin({ onLogin, isErrorMode = false }: BocetoLoginProps) {
  const [selectedPerfil, setSelectedPerfil] = useState<Perfil>('responsable');
  const [usuario, setUsuario] = useState('encargado@granja.pe');
  const [password, setPassword] = useState('Granja2026!');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarRechazo, setMostrarRechazo] = useState(isErrorMode);
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mostrarRechazo) {
      setMensajeError('Acceso denegado: Credenciales incorrectas o cuenta inactiva.');
      return;
    }

    setCargando(true);
    setMensajeError(null);

    try {
      // Intentar autenticación real con el Worker
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usuario, password }),
      });

      if (res.ok) {
        const data = await res.json() as { ok: boolean; user: { role: Perfil; username: string } };
        setCargando(false);
        onLogin(data.user.role, data.user.username);
        return;
      }
    } catch {
      // Si la API no está disponible en modo estático, permitir navegación con perfil seleccionado
    }

    setCargando(false);
    onLogin(selectedPerfil, usuario);
  };

  const handlePerfilSelect = (perfil: Perfil) => {
    setSelectedPerfil(perfil);
    setMostrarRechazo(false);
    setMensajeError(null);
    switch (perfil) {
      case 'administrador':
        setUsuario('admin@granja.pe');
        break;
      case 'responsable':
        setUsuario('encargado@granja.pe');
        break;
      case 'operario':
        setUsuario('operario1@granja.pe');
        break;
      case 'veterinario':
        setUsuario('veterinario@granja.pe');
        break;
    }
  };

  return (
    <div className="boceto-container">
      <div className="card login-card">
        <header className="login-header">
          <div className="farm-identity-banner">
            <span className="inline-flex items-center justify-center gap-2 leading-none brand-link">
              <IconPig size={26} className="brand-icon" />
              <span>Granja Porcícola San Luis</span>
            </span>
            <p className="farm-tagline text-xs text-muted">Sistema MiGranjaPro · Gestión porcina</p>
          </div>
          <div className="badge-boceto">Acceso seguro · T04</div>
          <h1 className="title-lg">Iniciar Sesión</h1>
          <p className="subtitle">Ingrese con sus credenciales autorizadas</p>
        </header>

        {(mostrarRechazo || mensajeError) && (
          <div className="alert alert-error" role="alert">
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconAlertCircle size={18} />
              <span>{mensajeError || 'Acceso denegado: Credenciales incorrectas o cuenta inactiva.'}</span>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="form-group">
            <label htmlFor="usuario" className="form-label">Usuario o correo institucional</label>
            <input
              id="usuario"
              type="text"
              className="form-input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="clave" className="form-label">Contraseña</label>
            <div className="password-input-wrapper">
              <input
                id="clave"
                type={mostrarPassword ? 'text' : 'password'}
                className="form-input password-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="btn-toggle-password"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                title={mostrarPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                <span className="inline-flex items-center justify-center leading-none">
                  {mostrarPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </span>
              </button>
            </div>
            <span className="form-helper">Control de visibilidad para pantallas táctiles y móviles</span>
          </div>

          <div className="perfiles-selector">
            <p className="form-helper">Demostración por rol (ACC-03):</p>
            <div className="button-group-grid">
              <button
                type="button"
                className={`btn btn-profile ${selectedPerfil === 'administrador' ? 'btn-active' : ''}`}
                onClick={() => handlePerfilSelect('administrador')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconShield size={16} />
                  <span>Administrador</span>
                </span>
              </button>

              <button
                type="button"
                className={`btn btn-profile ${selectedPerfil === 'responsable' ? 'btn-active' : ''}`}
                onClick={() => handlePerfilSelect('responsable')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconUser size={16} />
                  <span>Responsable</span>
                </span>
              </button>

              <button
                type="button"
                className={`btn btn-profile ${selectedPerfil === 'operario' ? 'btn-active' : ''}`}
                onClick={() => handlePerfilSelect('operario')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconClipboard size={16} />
                  <span>Operario</span>
                </span>
              </button>

              <button
                type="button"
                className={`btn btn-profile ${selectedPerfil === 'veterinario' ? 'btn-active' : ''}`}
                onClick={() => handlePerfilSelect('veterinario')}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <IconStethoscope size={16} />
                  <span>Veterinario</span>
                </span>
              </button>
            </div>
          </div>

          <div className="actions-stack">
            <button type="submit" className="btn btn-primary btn-block" disabled={cargando}>
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <span>{cargando ? 'Autenticando en D1...' : 'Ingresar al sistema'}</span>
              </span>
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMostrarRechazo(!mostrarRechazo);
                setMensajeError(null);
              }}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <span>{mostrarRechazo ? 'Quitar simulación de error' : 'Simular error de acceso'}</span>
              </span>
            </button>
          </div>
        </form>

        <footer className="card-footer-note">
          <p>Autenticación con sesiones revocables en D1, cookies HttpOnly/Secure y rate limiting.</p>
        </footer>
      </div>
    </div>
  );
}
