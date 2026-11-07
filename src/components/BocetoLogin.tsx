import React, { useState } from 'react';
import { Perfil } from '../types';
import { IconShield, IconUser, IconStethoscope, IconClipboard, IconAlertCircle } from './icons';

interface BocetoLoginProps {
  onLogin: (perfil: Perfil) => void;
  isErrorMode?: boolean;
}

export function BocetoLogin({ onLogin, isErrorMode = false }: BocetoLoginProps) {
  const [selectedPerfil, setSelectedPerfil] = useState<Perfil>('responsable');
  const [usuario, setUsuario] = useState('encargado@granja.pe');
  const [password, setPassword] = useState('••••••••');
  const [mostrarRechazo, setMostrarRechazo] = useState(isErrorMode);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mostrarRechazo) {
      return;
    }
    onLogin(selectedPerfil);
  };

  const handlePerfilSelect = (perfil: Perfil) => {
    setSelectedPerfil(perfil);
    setMostrarRechazo(false);
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
          <div className="badge-boceto">Boceto navegable · T02</div>
          <h1 className="title-lg">Web Porcícola</h1>
          <p className="subtitle">Gestión integral de piara y galpones</p>
        </header>

        {mostrarRechazo && (
          <div className="alert alert-error" role="alert">
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              <IconAlertCircle size={18} />
              <strong>Acceso denegado:</strong> Credenciales incorrectas o cuenta inactiva.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="form-group">
            <label htmlFor="usuario" className="form-label">Usuario o correo</label>
            <input
              id="usuario"
              type="text"
              className="form-input"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="clave" className="form-label">Contraseña</label>
            <input
              id="clave"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="perfiles-selector">
            <p className="form-helper">Seleccionar perfil para el recorrido:</p>
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
            <button type="submit" className="btn btn-primary btn-block">
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <span>Ingresar al sistema</span>
              </span>
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setMostrarRechazo(!mostrarRechazo)}
            >
              <span className="inline-flex items-center justify-center gap-2 leading-none">
                <span>{mostrarRechazo ? 'Quitar simulación de error' : 'Simular error de acceso'}</span>
              </span>
            </button>
          </div>
        </form>

        <footer className="card-footer-note">
          <p>Este módulo es un boceto de interfaz con fines de validación técnica de T02.</p>
        </footer>
      </div>
    </div>
  );
}
