'use client';

import React, { useState } from 'react';
import { KioskScreen } from '@/components/kiosk/KioskScreen';
import { AdminDashboardView } from '@/components/admin/AdminDashboardView';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { Fingerprint, LayoutDashboard, Monitor, Shield, Database, Wifi } from 'lucide-react';

export default function Home() {
  const [currentView, setCurrentView] = useState<'kiosk' | 'admin'>('kiosk');

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-main">
      {/* HEADER SUPERIOR WEB */}
      <header className="glass-card border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-40">
        {/* Marca & Logo */}
        <div
          onClick={() => setCurrentView('kiosk')}
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
          <div
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              isSupabaseConfigured
                ? 'bg-status-success/15 text-status-success border-status-success/30'
                : 'bg-neon-emerald/10 text-neon-green border-neon-green/20'
            }`}
          >
            {isSupabaseConfigured ? <Database size={13} /> : <Wifi size={13} />}
            <span>{isSupabaseConfigured ? 'Supabase Conectado' : 'Modo Demostración / Offline'}</span>
          </div>

          {/* Toggle Kiosco / Admin */}
          <div className="flex bg-surface/80 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setCurrentView('kiosk')}
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
              onClick={() => setCurrentView('admin')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentView === 'admin'
                  ? 'bg-neon-green text-black shadow-neon'
                  : 'text-text-muted hover:text-white'
              }`}
            >
              <LayoutDashboard size={14} />
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
          <AdminDashboardView onBackToKiosk={() => setCurrentView('kiosk')} />
        )}
      </div>
    </div>
  );
}
