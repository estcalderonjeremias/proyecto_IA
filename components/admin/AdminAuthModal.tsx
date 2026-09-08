'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { sounds } from '@/lib/sound';

interface AdminAuthModalProps {
  isOpen?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

const ADMIN_PASSWORD = 'Belgrano1905';

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen = true,
  onSuccess,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shake, setShake] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (password === ADMIN_PASSWORD) {
      sounds.playSuccess();
      setError(null);
      setIsSubmitting(false);
      onSuccess();
    } else {
      sounds.playError();
      setError('Contraseña incorrecta. Acceso restringido al personal autorizado.');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setIsSubmitting(false);
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-[#070A0F]/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md glass-card border border-white/10 rounded-3xl p-8 flex flex-col items-center relative shadow-2xl transition-transform ${
          shake ? 'animate-bounce text-status-error' : ''
        }`}
      >
        {/* Glow de fondo decorativo */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-neon-green/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-neon-emerald/10 rounded-full blur-3xl pointer-events-none" />

        {/* Ícono de Escudo / Candado */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-neon-emerald/20 to-neon-green/20 border border-neon-green/40 flex items-center justify-center text-neon-green mb-5 shadow-neon">
          <ShieldCheck size={32} />
        </div>

        {/* Título & Subtítulo */}
        <h2 className="text-2xl font-black text-white tracking-tight mb-2 flex items-center gap-2">
          Acceso Administrador
        </h2>
        <p className="text-xs text-text-muted text-center max-w-xs mb-6">
          Ingresa la contraseña de seguridad para desbloquear el Dashboard de Gestión y Monitoreo de Asistencias.
        </p>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-dim">
              <KeyRound size={17} />
            </div>

            <input
              type={showPassword ? 'text' : 'password'}
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Contraseña de control"
              className="w-full pl-10 pr-11 py-3 bg-surface/80 border border-white/10 focus:border-neon-green/60 rounded-xl text-white placeholder-text-dim text-sm outline-none transition-all"
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-text-muted hover:text-white transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-status-error/15 border border-status-error/30 text-status-error text-xs font-semibold animate-in fade-in">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 disabled:opacity-50 text-black font-extrabold text-sm shadow-neon transition-all flex items-center justify-center gap-2"
            >
              <Lock size={16} />
              Desbloquear Panel
            </button>

            <button
              type="button"
              onClick={onCancel}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft size={14} />
              Volver al Kiosco
            </button>
          </div>
        </form>

        {/* Footer de Seguridad */}
        <div className="mt-6 text-[10px] text-text-dim text-center">
          BioAccess Security • Clave de acceso en sesión activa
        </div>
      </div>
    </div>
  );
};
