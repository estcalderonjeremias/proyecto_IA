'use client';

import React from 'react';
import { Asistencia } from '@/types/database';
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  X, 
  User, 
  Calendar, 
  Clock, 
  AlertTriangle,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

interface ExceptionReviewModalProps {
  asistencia: Asistencia;
  onClose: () => void;
  onApprove: (id: string) => void;
  onRejectFraud: (id: string) => void;
  onApproveAndRecalibrate: (asistenciaId: string, empleadoId: string) => void;
}

export const ExceptionReviewModal: React.FC<ExceptionReviewModalProps> = ({
  asistencia,
  onClose,
  onApprove,
  onRejectFraud,
  onApproveAndRecalibrate,
}) => {
  return (
    <div className="fixed inset-0 bg-[#0B0F17]/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="glass-card w-full max-w-xl p-6 sm:p-8 rounded-3xl flex flex-col gap-6 relative border border-status-warning/40 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
        {/* Botón Salir */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-main p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Encabezado */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-status-warning/15 border border-status-warning/30 flex items-center justify-center text-status-warning shadow-md">
            <AlertTriangle size={26} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Revisión de Excepción de Seguridad</h3>
            <p className="text-text-muted text-xs sm:text-sm">
              Fotografía capturada automáticamente por el sensor al detectar inconsistencia facial.
            </p>
          </div>
        </div>

        {/* Foto de Supabase Storage */}
        <div className="w-full h-64 rounded-2xl overflow-hidden bg-[#090D16] border border-white/10 flex items-center justify-center relative shadow-inner">
          {asistencia.foto_excepcion ? (
            <img
              src={asistencia.foto_excepcion}
              alt="Foto de Excepción en Supabase Storage"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-text-dim text-sm flex items-center gap-2">
              <ShieldAlert size={18} /> Sin fotografía adjunta
            </div>
          )}
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 backdrop-blur-sm text-[11px] font-mono text-neon-green border border-neon-green/30">
            Storage: fotos_excepciones
          </div>
        </div>

        {/* Metadatos del Fichaje */}
        <div className="bg-surface/70 p-4 rounded-xl border border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <User size={16} className="text-neon-green shrink-0" />
            <div>
              <div className="text-text-dim">Empleado</div>
              <div className="font-semibold text-text-main truncate">{asistencia.empleado?.nombre_completo || 'Desconocido'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-neon-green shrink-0" />
            <div>
              <div className="text-text-dim">Fecha</div>
              <div className="font-semibold text-text-main">{asistencia.fecha}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-neon-green shrink-0" />
            <div>
              <div className="text-text-dim">Hora de Entrada</div>
              <div className="font-semibold text-text-main font-mono">
                {new Date(asistencia.hora_entrada).toLocaleTimeString('es-AR')}
              </div>
            </div>
          </div>
        </div>

        {/* 3 ACCIONES REQUERIDAS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
          {/* Botón 1: Aprobar */}
          <button
            type="button"
            onClick={() => onApprove(asistencia.id)}
            className="py-3 px-3 rounded-xl bg-status-success/15 hover:bg-status-success/25 border border-status-success/40 text-status-success font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
          >
            <CheckCircle2 size={16} />
            Aprobar
          </button>

          {/* Botón 2: Rechazar (Fraude) */}
          <button
            type="button"
            onClick={() => onRejectFraud(asistencia.id)}
            className="py-3 px-3 rounded-xl bg-status-error/15 hover:bg-status-error/25 border border-status-error/40 text-status-error font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
          >
            <XCircle size={16} />
            Rechazar (Fraude)
          </button>

          {/* Botón 3: Aprobar y Re-calibrar Rostro */}
          <button
            type="button"
            onClick={() => onApproveAndRecalibrate(asistencia.id, asistencia.empleado_id)}
            className="py-3 px-3 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-neon"
          >
            <RefreshCw size={16} />
            Aprobar y Re-calibrar
          </button>
        </div>
      </div>
    </div>
  );
};
