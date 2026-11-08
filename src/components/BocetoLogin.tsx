import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Perfil } from '../types';
import {
  IconPig,
  IconUser,
  IconLock,
  IconEye,
  IconEyeOff,
  IconAlertCircle,
  IconShield,
  IconLogIn,
  IconRefreshCw,
} from './icons';

interface LoginProps {
  onLogin: (perfil: Perfil, username?: string) => void;
}

export function BocetoLogin({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as {
        user?: { role: Perfil; username: string };
        error?: string;
      };
      if (!response.ok || !data.user) {
        throw new Error(
          data.error || 'No se pudo iniciar sesión. Comprueba tus credenciales.',
        );
      }
      onLogin(data.user.role, data.user.username);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servidor. Vuelve a intentar cuando tengas conexión.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="card login-card">
        <header className="login-header">
          <div className="login-emblem-wrap">
            <div className="login-emblem" aria-hidden="true">
              <IconPig size={30} className="login-emblem-icon" />
            </div>
          </div>
          <h1 className="login-title">Mi Granja Pro</h1>
          <p className="login-subtitle">Sistema integral de gestión porcícola</p>
        </header>

        <form onSubmit={submit} className="login-form">
          <div className="form-group">
            <label htmlFor="login-username" className="login-label">
              Usuario
            </label>
            <div className="input-with-icon-wrapper">
              <span className="input-icon-lead" aria-hidden="true">
                <IconUser size={18} />
              </span>
              <input
                id="login-username"
                className="form-input login-input"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ej. admin@granja.pe"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="login-label">
              Contraseña
            </label>
            <div className="input-with-icon-wrapper">
              <span className="input-icon-lead" aria-hidden="true">
                <IconLock size={18} />
              </span>
              <input
                id="login-password"
                className="form-input login-input input-has-trail"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                className="btn-password-toggle"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((value) => !value)}
                disabled={loading}
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger login-alert" role="alert">
              <IconAlertCircle size={18} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-login-submit"
            disabled={loading}
          >
            <span className="inline-flex items-center justify-center gap-2 leading-none">
              {loading ? (
                <>
                  <IconRefreshCw size={18} className="spinner-icon" />
                  <span>Comprobando…</span>
                </>
              ) : (
                <>
                  <IconLogIn size={18} />
                  <span>Entrar</span>
                </>
              )}
            </span>
          </button>
        </form>

        <footer className="login-card-footer">
          <div className="login-security-badge">
            <IconShield size={14} />
            <span>Acceso seguro para personal autorizado</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
