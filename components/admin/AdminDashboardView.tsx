'use client';

import React, { useState, useEffect } from 'react';
import { Asistencia, Empleado, Turno, EstadoEmpleado } from '@/types/database';
import { AsistenciasService, EmpleadosService, TurnosService } from '@/lib/supabaseClient';
import { ExceptionReviewModal } from './ExceptionReviewModal';
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  Search, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Plus, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  CalendarCheck,
  Flame,
  LayoutDashboard,
  Shield,
  LogOut,
  X,
  Check
} from 'lucide-react';

interface AdminDashboardViewProps {
  onBackToKiosk: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onBackToKiosk }) => {
  const [activeTab, setActiveTab] = useState<'asistencias' | 'empleados' | 'turnos'>('asistencias');
  
  // Data States
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [selectedException, setSelectedException] = useState<Asistencia | null>(null);

  // Modals for CRUD
  const [showEmpModal, setShowEmpModal] = useState<boolean>(false);
  const [editingEmp, setEditingEmp] = useState<Empleado | null>(null);
  const [empDoc, setEmpDoc] = useState('');
  const [empName, setEmpName] = useState('');
  const [empTurnoId, setEmpTurnoId] = useState('');
  const [empEstado, setEmpEstado] = useState<EstadoEmpleado>('Pendiente_Biometria');

  const [showTurnoModal, setShowTurnoModal] = useState<boolean>(false);
  const [editingTurno, setEditingTurno] = useState<Turno | null>(null);
  const [turnoNombre, setTurnoNombre] = useState('');
  const [turnoIngreso, setTurnoIngreso] = useState('08:00');
  const [turnoSalida, setTurnoSalida] = useState('16:00');
  const [turnoMaxExtras, setTurnoMaxExtras] = useState(2);

  const loadAllData = async () => {
    setLoading(true);
    const [asistData, empData, turnoData] = await Promise.all([
      AsistenciasService.getAll(),
      EmpleadosService.getAll(),
      TurnosService.getAll(),
    ]);
    setAsistencias(asistData);
    setEmpleados(empData);
    setTurnos(turnoData);
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Exception Actions
  const handleApprove = async (id: string) => {
    await AsistenciasService.updateEstado(id, 'Normal');
    setSelectedException(null);
    loadAllData();
  };

  const handleRejectFraud = async (id: string) => {
    await AsistenciasService.updateEstado(id, 'Rechazado');
    setSelectedException(null);
    loadAllData();
  };

  const handleApproveAndRecalibrate = async (asistenciaId: string, empleadoId: string) => {
    await AsistenciasService.updateEstado(asistenciaId, 'Normal');
    await EmpleadosService.update(empleadoId, {
      estado: 'Pendiente_Biometria',
      datos_biometricos: null,
    });
    setSelectedException(null);
    loadAllData();
  };

  // KPIs
  const todayStr = new Date().toISOString().split('T')[0];
  const presentesHoy = asistencias.filter(a => a.fecha === todayStr).length;
  
  // Tardanzas: hora_entrada > hora_ingreso de su turno
  const tardanzasHoy = asistencias.filter(a => {
    if (a.fecha !== todayStr) return false;
    const horaEntradaDate = new Date(a.hora_entrada);
    const turno = a.empleado?.turno;
    if (!turno) return false;
    const [tHour, tMin] = turno.hora_ingreso.split(':').map(Number);
    const entradaMinutes = horaEntradaDate.getHours() * 60 + horaEntradaDate.getMinutes();
    const turnoMinutes = tHour * 60 + tMin;
    return entradaMinutes > turnoMinutes + 10; // 10 min tolerancia
  }).length;

  const excepcionesPendientes = asistencias.filter(a => a.estado_fichaje === 'Requiere_Aprobacion').length;
  const horasExtrasAcumuladas = asistencias.reduce((acc, a) => acc + (a.horas_extras || 0), 0);

  // CRUD Empleado Submit
  const handleEmpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empDoc.trim() || !empName.trim()) return;

    if (editingEmp) {
      await EmpleadosService.update(editingEmp.id, {
        documento: empDoc.trim(),
        nombre_completo: empName.trim(),
        turno_id: empTurnoId || null,
        estado: empEstado,
      });
    } else {
      await EmpleadosService.create({
        documento: empDoc.trim(),
        nombre_completo: empName.trim(),
        turno_id: empTurnoId || null,
        estado: empEstado,
        datos_biometricos: null,
      });
    }
    setShowEmpModal(false);
    loadAllData();
  };

  // CRUD Turno Submit
  const handleTurnoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnoNombre.trim()) return;

    if (editingTurno) {
      await TurnosService.update(editingTurno.id, {
        nombre: turnoNombre.trim(),
        hora_ingreso: `${turnoIngreso}:00`,
        hora_salida: `${turnoSalida}:00`,
        max_horas_extras: Number(turnoMaxExtras),
      });
    } else {
      await TurnosService.create({
        nombre: turnoNombre.trim(),
        hora_ingreso: `${turnoIngreso}:00`,
        hora_salida: `${turnoSalida}:00`,
        max_horas_extras: Number(turnoMaxExtras),
      });
    }
    setShowTurnoModal(false);
    loadAllData();
  };

  const filteredAsistencias = asistencias.filter((a) => {
    const matchName = a.empleado?.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      a.empleado?.documento.includes(searchTerm);
    const matchStatus = filterStatus === 'TODOS' || a.estado_fichaje === filterStatus;
    return matchName && matchStatus;
  });

  return (
    <div className="flex min-h-screen bg-background text-text-main">
      {/* SIDEBAR OSCURO CON ACENTOS VERDES */}
      <aside className="w-64 bg-surface/90 border-r border-white/10 p-6 flex flex-col justify-between shrink-0 hidden md:flex">
        <div className="flex flex-col gap-6">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-neon-emerald to-neon-green flex items-center justify-center text-black font-bold shadow-neon">
              <Shield size={22} />
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight text-white">BioAccess</div>
              <div className="text-[11px] text-neon-green font-semibold">Admin Dashboard</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5 pt-4">
            <button
              type="button"
              onClick={() => setActiveTab('asistencias')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'asistencias'
                  ? 'bg-neon-green/15 text-neon-green border border-neon-green/30 shadow-[0_0_15px_rgba(34,197,94,0.15)]'
                  : 'text-text-muted hover:text-text-main hover:bg-white/5'
              }`}
            >
              <CalendarCheck size={18} />
              Monitor Asistencia
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('empleados')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'empleados'
                  ? 'bg-neon-green/15 text-neon-green border border-neon-green/30 shadow-[0_0_15px_rgba(34,197,94,0.15)]'
                  : 'text-text-muted hover:text-text-main hover:bg-white/5'
              }`}
            >
              <Users size={18} />
              Empleados
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('turnos')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'turnos'
                  ? 'bg-neon-green/15 text-neon-green border border-neon-green/30 shadow-[0_0_15px_rgba(34,197,94,0.15)]'
                  : 'text-text-muted hover:text-text-main hover:bg-white/5'
              }`}
            >
              <Clock size={18} />
              Turnos Laborales
            </button>
          </nav>
        </div>

        {/* Footer Sidebar */}
        <div className="pt-6 border-t border-white/10">
          <button
            type="button"
            onClick={onBackToKiosk}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-text-muted hover:text-white text-xs font-semibold transition-colors"
          >
            <LogOut size={15} />
            Volver a Modo Kiosco
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto max-w-7xl">
        {/* Header Móvil */}
        <div className="flex items-center justify-between mb-6 md:hidden">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Shield size={20} className="text-neon-green" /> BioAccess Admin
          </div>
          <button
            type="button"
            onClick={onBackToKiosk}
            className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-text-muted"
          >
            Modo Kiosco
          </button>
        </div>

        {/* Navegación Tabs Móvil */}
        <div className="flex gap-2 mb-6 md:hidden overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('asistencias')}
            className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
              activeTab === 'asistencias' ? 'bg-neon-green text-black' : 'bg-surface text-text-muted'
            }`}
          >
            Asistencias
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('empleados')}
            className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
              activeTab === 'empleados' ? 'bg-neon-green text-black' : 'bg-surface text-text-muted'
            }`}
          >
            Empleados
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('turnos')}
            className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${
              activeTab === 'turnos' ? 'bg-neon-green text-black' : 'bg-surface text-text-muted'
            }`}
          >
            Turnos
          </button>
        </div>

        {/* 4 TARJETAS DE ESTADÍSTICAS (KPIS) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Presentes Hoy */}
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-neon-green/15 border border-neon-green/30 flex items-center justify-center text-neon-green shadow-neon">
              <Users size={24} />
            </div>
            <div>
              <div className="text-xs text-text-dim font-medium">Presentes Hoy</div>
              <div className="text-2xl font-extrabold text-white">{presentesHoy}</div>
            </div>
          </div>

          {/* Tardanzas */}
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-status-error/15 border border-status-error/30 flex items-center justify-center text-status-error">
              <Flame size={24} />
            </div>
            <div>
              <div className="text-xs text-text-dim font-medium">Tardanzas Detectadas</div>
              <div className="text-2xl font-extrabold text-white">{tardanzasHoy}</div>
            </div>
          </div>

          {/* Excepciones Pendientes */}
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-status-warning/15 border border-status-warning/30 flex items-center justify-center text-status-warning shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <AlertTriangle size={24} />
            </div>
            <div>
              <div className="text-xs text-text-dim font-medium">Excepciones Pendientes</div>
              <div className={`text-2xl font-extrabold ${excepcionesPendientes > 0 ? 'text-status-warning' : 'text-white'}`}>
                {excepcionesPendientes}
              </div>
            </div>
          </div>

          {/* Horas Extras */}
          <div className="glass-card p-5 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-neon-emerald/15 border border-neon-emerald/30 flex items-center justify-center text-neon-emerald">
              <Clock size={24} />
            </div>
            <div>
              <div className="text-xs text-text-dim font-medium">Horas Extras Totales</div>
              <div className="text-2xl font-extrabold text-white">{horasExtrasAcumuladas.toFixed(1)} hs</div>
            </div>
          </div>
        </div>

        {/* TAB 1: MONITOR DE ASISTENCIAS */}
        {activeTab === 'asistencias' && (
          <div className="flex flex-col gap-5">
            {/* Header & Filtros */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Monitor de Asistencias & Excepciones</h2>
                <p className="text-xs text-text-muted">Visualización en vivo de fichajes y validación de seguridad.</p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="glass-card px-3 py-2 rounded-xl flex items-center gap-2 flex-1 sm:w-64">
                  <Search size={16} className="text-text-muted shrink-0" />
                  <input
                    type="text"
                    placeholder="Buscar por DNI o Empleado..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs text-white w-full"
                  />
                </div>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-surface border border-white/10 text-xs text-white rounded-xl px-3 py-2 outline-none"
                >
                  <option value="TODOS">Todos los Estados</option>
                  <option value="Normal">Normal</option>
                  <option value="Requiere_Aprobacion">Requiere Aprobación</option>
                  <option value="Rechazado">Rechazado</option>
                </select>

                <button
                  type="button"
                  onClick={loadAllData}
                  className="p-2 rounded-xl bg-surface hover:bg-surface-hover border border-white/10 text-text-muted hover:text-white"
                  title="Recargar"
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Tabla Asistencias */}
            <div className="glass-card rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-white/10 text-text-dim uppercase tracking-wider">
                    <th className="p-4">Empleado</th>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Entrada</th>
                    <th className="p-4">Salida</th>
                    <th className="p-4">Horas</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Revisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredAsistencias.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-text-dim">
                        No hay marcaciones para mostrar con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    filteredAsistencias.map((a) => (
                      <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-text-main">{a.empleado?.nombre_completo || 'Empleado'}</div>
                          <div className="text-[11px] font-mono text-text-dim">DNI: {a.empleado?.documento}</div>
                        </td>
                        <td className="p-4 text-text-muted">{a.fecha}</td>
                        <td className="p-4 font-mono text-neon-green">
                          {new Date(a.hora_entrada).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4 font-mono">
                          {a.hora_salida ? (
                            <span className="text-blue-400">
                              {new Date(a.hora_salida).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-text-dim">En curso</span>
                          )}
                        </td>
                        <td className="p-4">
                          {a.horas_trabajadas != null ? `${a.horas_trabajadas} hs` : '---'}
                          {a.horas_extras != null && a.horas_extras > 0 && (
                            <span className="ml-1 text-neon-green font-semibold">(+{a.horas_extras} hs)</span>
                          )}
                        </td>
                        <td className="p-4">
                          {a.estado_fichaje === 'Normal' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success/15 text-status-success border border-status-success/30 font-semibold text-[11px]">
                              <CheckCircle size={12} /> Normal
                            </span>
                          )}
                          {a.estado_fichaje === 'Requiere_Aprobacion' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-warning/15 text-status-warning border border-status-warning/30 font-semibold text-[11px]">
                              <AlertTriangle size={12} /> Revisar Excepción
                            </span>
                          )}
                          {a.estado_fichaje === 'Rechazado' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-error/15 text-status-error border border-status-error/30 font-semibold text-[11px]">
                              <XCircle size={12} /> Fraude / Rechazado
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {a.foto_excepcion || a.estado_fichaje === 'Requiere_Aprobacion' ? (
                            <button
                              type="button"
                              onClick={() => setSelectedException(a)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-status-warning/15 hover:bg-status-warning/25 text-status-warning border border-status-warning/40 font-semibold text-xs transition-colors"
                            >
                              <Eye size={13} /> Revisar Foto
                            </button>
                          ) : (
                            <span className="text-text-dim text-[11px]">Validado</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: GESTIÓN DE EMPLEADOS */}
        {activeTab === 'empleados' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Nómina de Personal</h2>
                <p className="text-xs text-text-muted">Administración de usuarios y estado de enrolamiento biométrico.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingEmp(null);
                  setEmpDoc('');
                  setEmpName('');
                  setEmpTurnoId(turnos[0]?.id || '');
                  setEmpEstado('Pendiente_Biometria');
                  setShowEmpModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 text-white font-bold text-xs shadow-neon transition-all"
              >
                <Plus size={16} /> Nuevo Empleado
              </button>
            </div>

            <div className="glass-card rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[650px]">
                <thead>
                  <tr className="border-b border-white/10 text-text-dim uppercase tracking-wider">
                    <th className="p-4">Empleado</th>
                    <th className="p-4">DNI / Documento</th>
                    <th className="p-4">Turno Asignado</th>
                    <th className="p-4">Estado Biométrico</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {empleados.map((emp) => (
                    <tr key={emp.id} className="hover:bg-white/[0.02]">
                      <td className="p-4">
                        <div className="font-semibold text-text-main">{emp.nombre_completo}</div>
                      </td>
                      <td className="p-4 font-mono">{emp.documento}</td>
                      <td className="p-4">
                        {emp.turno ? (
                          <span className="px-2 py-0.5 rounded-full bg-white/5 text-neon-green border border-neon-green/20 text-[11px]">
                            {emp.turno.nombre}
                          </span>
                        ) : (
                          <span className="text-text-dim">Sin turno</span>
                        )}
                      </td>
                      <td className="p-4">
                        {emp.estado === 'Activo' && (
                          <span className="text-status-success font-semibold flex items-center gap-1">
                            <CheckCircle size={13} /> Activo (Enrolado)
                          </span>
                        )}
                        {emp.estado === 'Pendiente_Biometria' && (
                          <span className="text-status-warning font-semibold flex items-center gap-1">
                            <AlertTriangle size={13} /> Pendiente Enrolar
                          </span>
                        )}
                        {emp.estado === 'Inactivo' && (
                          <span className="text-status-error font-semibold flex items-center gap-1">
                            <XCircle size={13} /> Inactivo
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEmp(emp);
                              setEmpDoc(emp.documento);
                              setEmpName(emp.nombre_completo);
                              setEmpTurnoId(emp.turno_id || '');
                              setEmpEstado(emp.estado);
                              setShowEmpModal(true);
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white"
                            title="Editar"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(`¿Eliminar al empleado ${emp.nombre_completo}?`)) {
                                await EmpleadosService.delete(emp.id);
                                loadAllData();
                              }
                            }}
                            className="p-1.5 rounded-lg bg-status-error/10 hover:bg-status-error/20 text-status-error"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: GESTIÓN DE TURNOS */}
        {activeTab === 'turnos' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Turnos y Horarios</h2>
                <p className="text-xs text-text-muted">Configuración de jornadas y límites de horas extras.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTurno(null);
                  setTurnoNombre('');
                  setTurnoIngreso('08:00');
                  setTurnoSalida('16:00');
                  setTurnoMaxExtras(2);
                  setShowTurnoModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 text-white font-bold text-xs shadow-neon transition-all"
              >
                <Plus size={16} /> Nuevo Turno
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {turnos.map((t) => (
                <div key={t.id} className="glass-card p-5 rounded-2xl flex flex-col justify-between gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-sm">{t.nombre}</h3>
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(`¿Eliminar el turno ${t.nombre}?`)) {
                          await TurnosService.delete(t.id);
                          loadAllData();
                        }
                      }}
                      className="text-status-error p-1 hover:bg-status-error/10 rounded-lg"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="bg-surface/80 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                    <Clock size={18} className="text-neon-green" />
                    <div>
                      <div className="text-[11px] text-text-dim">Horario Laboral</div>
                      <div className="font-mono text-xs font-bold text-white">
                        {t.hora_ingreso.slice(0, 5)} hs — {t.hora_salida.slice(0, 5)} hs
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-text-muted">
                    <span>Máx. Horas Extras:</span>
                    <span className="font-semibold text-neon-green">{t.max_horas_extras} hs/día</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modal de Aprobación de Excepciones */}
      {selectedException && (
        <ExceptionReviewModal
          asistencia={selectedException}
          onClose={() => setSelectedException(null)}
          onApprove={handleApprove}
          onRejectFraud={handleRejectFraud}
          onApproveAndRecalibrate={handleApproveAndRecalibrate}
        />
      )}

      {/* Modal Crear/Editar Empleado */}
      {showEmpModal && (
        <div className="fixed inset-0 bg-[#0B0F17]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 rounded-3xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white text-lg">{editingEmp ? 'Editar Empleado' : 'Nuevo Empleado'}</h3>
              <button type="button" onClick={() => setShowEmpModal(false)} className="text-text-muted"><X size={20} /></button>
            </div>
            <form onSubmit={handleEmpSubmit} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="text-text-muted block mb-1">DNI / Documento</label>
                <input
                  type="text"
                  required
                  value={empDoc}
                  onChange={(e) => setEmpDoc(e.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none font-mono"
                  placeholder="Ej: 40123456"
                />
              </div>
              <div>
                <label className="text-text-muted block mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none"
                  placeholder="Ej: Juan Pérez"
                />
              </div>
              <div>
                <label className="text-text-muted block mb-1">Turno</label>
                <select
                  value={empTurnoId}
                  onChange={(e) => setEmpTurnoId(e.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none"
                >
                  <option value="">Seleccione turno</option>
                  {turnos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-text-muted block mb-1">Estado</label>
                <select
                  value={empEstado}
                  onChange={(e) => setEmpEstado(e.target.value as EstadoEmpleado)}
                  className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none"
                >
                  <option value="Pendiente_Biometria">Pendiente Biometría (Enrolar en Kiosco)</option>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEmpModal(false)} className="px-4 py-2 rounded-xl bg-white/5 text-text-muted">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-neon-green text-black font-bold">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear/Editar Turno */}
      {showTurnoModal && (
        <div className="fixed inset-0 bg-[#0B0F17]/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 rounded-3xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white text-lg">{editingTurno ? 'Editar Turno' : 'Nuevo Turno'}</h3>
              <button type="button" onClick={() => setShowTurnoModal(false)} className="text-text-muted"><X size={20} /></button>
            </div>
            <form onSubmit={handleTurnoSubmit} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="text-text-muted block mb-1">Nombre del Turno</label>
                <input
                  type="text"
                  required
                  value={turnoNombre}
                  onChange={(e) => setTurnoNombre(e.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none"
                  placeholder="Ej: Turno Mañana"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-text-muted block mb-1">Hora Entrada</label>
                  <input
                    type="time"
                    required
                    value={turnoIngreso}
                    onChange={(e) => setTurnoIngreso(e.target.value)}
                    className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-text-muted block mb-1">Hora Salida</label>
                  <input
                    type="time"
                    required
                    value={turnoSalida}
                    onChange={(e) => setTurnoSalida(e.target.value)}
                    className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-text-muted block mb-1">Máx. Horas Extras</label>
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={turnoMaxExtras}
                  onChange={(e) => setTurnoMaxExtras(Number(e.target.value))}
                  className="w-full bg-surface border border-white/10 rounded-xl p-2.5 text-white outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTurnoModal(false)} className="px-4 py-2 rounded-xl bg-white/5 text-text-muted">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-neon-green text-black font-bold">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
