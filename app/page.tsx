'use client';

import React, { useState } from 'react';
import { KioskScreen } from '@/components/kiosk/KioskScreen';
import { AdminDashboardView } from '@/components/admin/AdminDashboardView';
import { AdminAuthModal } from '@/components/admin/AdminAuthModal';
import {
  isSupabaseConfigured,
  saveCustomSupabaseConfig,
  clearCustomSupabaseConfig,
} from '@/lib/supabaseClient';
import {
  Fingerprint,
  LayoutDashboard,
  Monitor,
  Database,
  WifiOff,
  Lock,
  X,
  Settings,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

export default function Home() {
  const [currentView, setCurrentView] = useState<'kiosk' | 'admin'>('kiosk');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState<boolean>(false);
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');

  // Al seleccionar la pestaña Admin, se verifica la clave
  const handleSelectAdmin = () => {
    if (isAdminAuthenticated) {
      setCurrentView('admin');
    } else {
      setShowAuthModal(true);
    }
  };

  // Al volver al modo Kiosco se bloquea la sesión administrativa
  const handleBackToKiosk = () => {
    setIsAdminAuthenticated(false);
    setShowAuthModal(false);
    setCurrentView('kiosk');
  };

  const handleAuthSuccess = () => {
    setIsAdminAuthenticated(true);
    setShowAuthModal(false);
    setCurrentView('admin');
  };

  const handleSaveSupabase = () => {
    if (sbUrl.trim() && sbKey.trim()) {
      saveCustomSupabaseConfig(sbUrl, sbKey);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main">
      {/* HEADER SUPERIOR WEB */}
      <header className="glass-card border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-40">
        {/* Marca & Logo */}
        <div
          onClick={handleBackToKiosk}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-neon-emerald to-neon-green flex items-center justify-center text-black font-bold shadow-neon group-hover:scale-105 transition-transform">
            <Fingerprint size={22} />
          </div>
          <div>
            <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              BioAccess <span className="text-neon-green font-normal">Web</span>
            </div>
            <div className="text-[10px] text-text-dim uppercase tracking-wider">
              Control Biométrico Vercel
            </div>
          </div>
        </div>

        {/* Switcher de Vistas & Badge Supabase */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Badge Estado Supabase */}
          <button
            type="button"
            onClick={() => setShowSupabaseModal(true)}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-all hover:brightness-110 ${
              isSupabaseConfigured
                ? 'bg-status-success/15 text-status-success border-status-success/30'
                : 'bg-status-error/15 text-status-error border-status-error/30'
            }`}
          >
            {isSupabaseConfigured ? <Database size={13} /> : <WifiOff size={13} />}
            <span>{isSupabaseConfigured ? 'Supabase Conectado' : 'Sin Conexión a Supabase'}</span>
          </button>

          {/* Toggle Kiosco / Admin */}
          <div className="flex bg-surface/80 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={handleBackToKiosk}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentView === 'kiosk'
                  ? 'bg-neon-green text-black shadow-neon'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <Monitor size={14} />
              Kiosco
            </button>

            <button
              type="button"
              onClick={handleSelectAdmin}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentView === 'admin'
                  ? 'bg-neon-green text-black shadow-neon'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              {isAdminAuthenticated ? <LayoutDashboard size={14} /> : <Lock size={14} />}
              Admin
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO DE LA VISTA SELECCIONADA */}
      <div className="flex-1">
        {currentView === 'kiosk' ? (
          <KioskScreen />
        ) : (
          <AdminDashboardView onBackToKiosk={handleBackToKiosk} />
        )}
      </div>

      {/* Modal de Autenticación para ingresar a Admin */}
      <AdminAuthModal
        isOpen={showAuthModal}
        onSuccess={handleAuthSuccess}
        onCancel={() => setShowAuthModal(false)}
      />

      {/* Modal de Configuración de Supabase */}
      {showSupabaseModal && (
        <div className="fixed inset-0 bg-[#0B0F17]/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 rounded-3xl relative">
            <button
              type="button"
              onClick={() => setShowSupabaseModal(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-white p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isSupabaseConfigured
                  ? 'bg-status-success/20 border-status-success/40 text-status-success'
                  : 'bg-status-error/20 border-status-error/40 text-status-error'
              }`}>
                {isSupabaseConfigured ? <CheckCircle size={22} /> : <AlertTriangle size={22} />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isSupabaseConfigured ? 'Supabase Conectado' : 'Conectar Supabase'}
                </h3>
                <p className="text-xs text-text-muted">
                  {isSupabaseConfigured
                    ? 'Base de datos PostgreSQL activa y sincronizada'
                    : 'Configura las credenciales para activar la persistencia'}
                </p>
              </div>
            </div>

            {isSupabaseConfigured ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 rounded-xl bg-status-success/10 border border-status-success/20 text-xs text-status-success">
                  <p className="font-semibold mb-1">✅ Conexión establecida</p>
                  <p className="text-text-muted">
                    Todos los empleados, turnos y asistencias se guardan en la nube de Supabase.
                    Los datos son accesibles desde cualquier dispositivo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearCustomSupabaseConfig();
                  }}
                  className="text-xs text-text-dim hover:text-status-error transition-colors text-center"
                >
                  Desconectar credenciales personalizadas
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-xs">
                <div className="p-3 rounded-xl bg-status-warning/10 border border-status-warning/20 text-status-warning">
                  <p className="font-semibold mb-1">⚠️ Para que funcione en Vercel:</p>
                  <p className="text-text-muted">
                    Necesitas agregar tus variables de entorno de Supabase en{' '}
                    <strong className="text-white">Vercel → Settings → Environment Variables</strong>:
                  </p>
                  <ul className="mt-1.5 text-text-dim list-disc list-inside">
                    <li><code className="text-neon-green">NEXT_PUBLIC_SUPABASE_URL</code></li>
                    <li><code className="text-neon-green">NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
                  </ul>
                  <p className="text-text-muted mt-1.5">
                    O puedes configurarlas manualmente aquí abajo para este navegador:
                  </p>
                </div>

                <div>
                  <label className="text-text-muted block mb-1">Supabase URL</label>
                  <input
                    type="text"
                    value={sbUrl}
                    onChange={(e) => setSbUrl(e.target.value)}
                    placeholder="https://tu-proyecto.supabase.co"
                    className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="text-text-muted block mb-1">Anon Key</label>
                  <input
                    type="password"
                    value={sbKey}
                    onChange={(e) => setSbKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none text-xs font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveSupabase}
                  disabled={!sbUrl.trim() || !sbKey.trim()}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 text-white font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  <Settings size={14} />
                  Conectar y Recargar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
