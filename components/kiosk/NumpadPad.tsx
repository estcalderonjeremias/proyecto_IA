'use client';

import React from 'react';
import { Delete, ArrowRight } from 'lucide-react';
import { sounds } from '@/lib/sound';

interface NumpadPadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export const NumpadPad: React.FC<NumpadPadProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
}) => {
  const handleDigit = (digit: string) => {
    if (disabled || value.length >= 15) return;
    sounds.playKeypress();
    onChange(value + digit);
  };

  const handleBackspace = () => {
    if (disabled || value.length === 0) return;
    sounds.playKeypress();
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled || value.length === 0) return;
    sounds.playKeypress();
    onChange('');
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="flex flex-col gap-3 w-full max-w-[340px]">
      {/* Display Pantalla DNI */}
      <div className="bg-surface/80 border border-neon-emerald/30 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-inner">
        <span
          className={`font-mono text-xl sm:text-2xl font-bold tracking-widest ${
            value ? 'text-text-main' : 'text-text-dim text-base font-normal tracking-normal'
          }`}
        >
          {value || 'Ingresa DNI / Cédula'}
        </span>

        {value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-text-muted hover:text-text-main px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Grid del Teclado Táctil */}
      <div className="grid grid-cols-3 gap-2.5">
        {digits.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => handleDigit(digit)}
            className="h-14 sm:h-16 bg-surface/70 hover:bg-surface/90 active:scale-95 border border-white/10 hover:border-neon-green/40 rounded-xl text-white font-mono text-xl font-bold transition-all shadow-md flex items-center justify-center disabled:opacity-50"
          >
            {digit}
          </button>
        ))}

        {/* Tecla Borrar */}
        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={handleBackspace}
          className="h-14 sm:h-16 bg-status-error/10 hover:bg-status-error/20 active:scale-95 border border-status-error/30 rounded-xl text-status-error flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none"
          title="Borrar dígito"
        >
          <Delete size={22} />
        </button>

        {/* Tecla 0 */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleDigit('0')}
          className="h-14 sm:h-16 bg-surface/70 hover:bg-surface/90 active:scale-95 border border-white/10 hover:border-neon-green/40 rounded-xl text-white font-mono text-xl font-bold transition-all shadow-md flex items-center justify-center disabled:opacity-50"
        >
          0
        </button>

        {/* Tecla Fichar / Confirmar */}
        <button
          type="button"
          disabled={disabled || value.trim().length === 0}
          onClick={onSubmit}
          className={`h-14 sm:h-16 rounded-xl flex items-center justify-center transition-all text-white font-semibold active:scale-95 ${
            value.trim().length > 0
              ? 'bg-gradient-to-r from-neon-emerald to-neon-green shadow-neon hover:brightness-110'
              : 'bg-surface/40 text-text-dim border border-white/5 opacity-40 cursor-not-allowed'
          }`}
          title="Registrar Marcación"
        >
          <ArrowRight size={26} />
        </button>
      </div>
    </div>
  );
};
