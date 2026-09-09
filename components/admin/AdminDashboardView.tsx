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
  Check,
  Loader2,
  Camera,
  ScanFace
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
  const [dataError, setDataError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingEmpId, setDeletingEmpId] = useState<string | null>(null);

  // Admin Face Enrollment Modal States
  const [enrollingEmp, setEnrollingEmp] = useState<Empleado | null>(null);
  const [isCapturingAdminFace, setIsCapturingAdminFace] = useState<boolean>(false);
  const [enrollAdminError, setEnrollAdminError] = useState<string | null>(null);
  const adminVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const adminStreamRef = React.useRef<MediaStream | null>(null);

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
  const [isSavingTurno, setIsSavingTurno] = useState(false);
  const [turnoError, setTurnoError] = useState<string | null>(null);
  const [isSavingEmp, setIsSavingEmp] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);

  // 1. Conexión y Lectura Inicial (Carga directa desde Supabase)
  const loadAllData = async () => {
    setLoading(true);
    setDataError(null);
    try {
      const [asistData, empData, turnoData] = await Promise.all([
        AsistenciasService.getAll(),
        EmpleadosService.getAll(),
        TurnosService.getAll(),
      ]);
      setAsistencias(asistData);
      setEmpleados(empData);
      setTurnos(turnoData);
    } catch (err: unknown) {
      console.error('[AdminDashboard] Error cargando datos desde Supabase:', err);
      const msg = err instanceof Error ? err.message : 'Error al conectar con la base de datos de Supabase.';
      setDataError(msg);
    } finally {
      setLoading(false);
    }
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

  // 2. Creación e Inserción de un Empleado Nuevo
  const handleEmpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empDoc.trim() || !empName.trim()) return;

    setIsSavingEmp(true);
    setEmpError(null);

    try {
      if (editingEmp) {
        const updated = await EmpleadosService.update(editingEmp.id, {
          documento: empDoc.trim(),
          nombre_completo: empName.trim(),
          turno_id: empTurnoId || null,
          estado: empEstado,
        });
        setEmpleados(prev => prev.map(emp => emp.id === updated.id ? updated : emp));
      } else {
        // Inserción directa en Supabase asignando ID autogenerado y estado inicial pendiente
        const created = await EmpleadosService.create({
          documento: empDoc.trim(),
          nombre_completo: empName.trim(),
          turno_id: empTurnoId || null,
          estado: empEstado || 'Pendiente_Biometria',
          datos_biometricos: null,
        });
        // Agregar inmediatamente al estado local con el ID asignado por Supabase
        setEmpleados(prev => [...prev, created]);
      }
      setShowEmpModal(false);
      setEditingEmp(null);
    } catch (err: unknown) {
      console.error('Error al guardar empleado:', err);
      setEmpError(err instanceof Error ? err.message : 'Error al guardar empleado en Supabase.');
    } finally {
      setIsSavingEmp(false);
    }
  };

  // 4. Eliminación de Empleados (Directa en Supabase con confirmación)
  const handleDeleteEmpleado = async (emp: Empleado) => {
    const confirmed = window.confirm(
      `¿Estás seguro de eliminar permanentemente al empleado "${emp.nombre_completo}" (DNI: ${emp.documento})?\n\nEsta acción ejecutará una eliminación directa en Supabase.`
    );
    if (!confirmed) return;

    setDeletingEmpId(emp.id);
    setActionError(null);

    try {
      // Ejecuta instrucción .delete().eq('id', id_empleado) directa en Supabase
      await EmpleadosService.delete(emp.id);

      // Solo remueve al empleado de la pantalla cuando la respuesta de Supabase confirme que el registro se borró con éxito
      setEmpleados(prev => prev.filter(e => e.id !== emp.id));
    } catch (err: unknown) {
      console.error('Error al eliminar empleado en Supabase:', err);
      const msg = err instanceof Error ? err.message : 'Error al eliminar en Supabase.';
      setActionError(`No se pudo eliminar al empleado: ${msg}`);
      alert(`Error en Supabase: No se pudo eliminar al empleado.\n${msg}`);
    } finally {
      setDeletingEmpId(null);
    }
  };

  // 3. Enrolamiento Facial Directo desde el Admin ("Guardar Rostro")
  const startAdminEnrollment = async (emp: Empleado) => {
    setEnrollingEmp(emp);
    setEnrollAdminError(null);
    setIsCapturingAdminFace(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      adminStreamRef.current = stream;
      if (adminVideoRef.current) {
        adminVideoRef.current.srcObject = stream;
        adminVideoRef.current.play().catch(() => {});
      }
    } catch (camErr) {
      console.warn('Error al iniciar cámara web:', camErr);
      setEnrollAdminError('No se pudo acceder a la cámara. Verifica que tengas una cámara conectada y permisos activos.');
    }
  };

  const closeAdminEnrollment = () => {
    if (adminStreamRef.current) {
      adminStreamRef.current.getTracks().forEach(t => t.stop());
      adminStreamRef.current = null;
    }
    setEnrollingEmp(null);
    setIsCapturingAdminFace(false);
    setEnrollAdminError(null);
  };

  const handleAdminCaptureFace = async () => {
    if (!enrollingEmp) return;
    const video = adminVideoRef.current;
    if (!video) return;

    setIsCapturingAdminFace(true);
    setEnrollAdminError(null);

    try {
      let descriptor: number[] | null = null;
      try {
        const faceapi = await import('@vladmandic/face-api');
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (detection && detection.descriptor) {
          descriptor = Array.from(detection.descriptor);
        }
      } catch (fErr) {
        console.warn('face-api no disponible, usando extractor canvas:', fErr);
      }

      if (!descriptor) {
        const sourceWidth = video.videoWidth || 640;
        const sourceHeight = video.videoHeight || 480;
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(sourceWidth, sourceHeight);
          const startX = (sourceWidth - minDim) / 2;
          const startY = (sourceHeight - minDim) / 2;
          ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 120, 120);
          const pixels = ctx.getImageData(0, 0, 120, 120).data;
          const desc: number[] = new Array(128).fill(0);
          const blockSize = Math.floor(pixels.length / (4 * 128));
          for (let i = 0; i < 128; i++) {
            let sum = 0, count = 0;
            const start = i * blockSize * 4;
            const end = Math.min(start + blockSize * 4, pixels.length);
            for (let p = start; p < end; p += 4) {
              sum += 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
              count++;
            }
            desc[i] = count > 0 ? Number((sum / (count * 255)).toFixed(4)) : 0;
          }
          const norm = Math.sqrt(desc.reduce((acc, v) => acc + v * v, 0));
          if (norm > 0) desc.forEach((_, i) => (desc[i] = Number((desc[i] / norm).toFixed(4))));
          descriptor = desc;
        }
      }

      if (!descriptor || descriptor.length === 0) {
        throw new Error('No se detectó un patrón facial nítido. Asegúrate de enfocar bien tu rostro.');
      }

      // Ejecuta UPDATE en Supabase con los datos del rostro y cambia el estado a 'Activo'
      const updated = await EmpleadosService.saveBiometrics(enrollingEmp.id, descriptor);

      // Refresca el estado local en el cliente para que en la lista cambie visualmente a Activo de forma inmediata
      setEmpleados(prev => prev.map(e => e.id === updated.id ? updated : e));
      closeAdminEnrollment();
    } catch (err: unknown) {
      console.error('Error al guardar rostro en Supabase:', err);
      setEnrollAdminError(err instanceof Error ? err.message : 'Error al guardar rostro en Supabase.');
    } finally {
      setIsCapturingAdminFace(false);
    }
  };

  // CRUD Turno Submit
  const handleTurnoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombreTrim = turnoNombre.trim();
    if (!nombreTrim) return;

    setIsSavingTurno(true);
    setTurnoError(null);

    try {
      // Normalizar horas: si el input retorna "08:00" lo convertimos a "08:00:00"
      const ingresoFinal = turnoIngreso
        ? (turnoIngreso.split(':').length === 2 ? `${turnoIngreso}:00` : turnoIngreso)
        : '08:00:00';
      const salidaFinal = turnoSalida
        ? (turnoSalida.split(':').length === 2 ? `${turnoSalida}:00` : turnoSalida)
        : '16:00:00';

      let updatedTurno: Turno;
      if (editingTurno) {
        await TurnosService.update(editingTurno.id, {
          nombre: nombreTrim,
          hora_ingreso: ingresoFinal,
          hora_salida: salidaFinal,
          max_horas_extras: Number(turnoMaxExtras) || 0,
        });
        updatedTurno = {
          ...editingTurno,
          nombre: nombreTrim,
          hora_ingreso: ingresoFinal,
          hora_salida: salidaFinal,
          max_horas_extras: Number(turnoMaxExtras) || 0,
        };
        setTurnos(prev => prev.map(t => t.id === updatedTurno.id ? updatedTurno : t));
      } else {
        updatedTurno = await TurnosService.create({
          nombre: nombreTrim,
          hora_ingreso: ingresoFinal,
          hora_salida: salidaFinal,
          max_horas_extras: Number(turnoMaxExtras) || 0,
        });
        setTurnos(prev => [...prev, updatedTurno]);
      }

      // Cerrar modal inmediatamente
      setShowTurnoModal(false);
      setEditingTurno(null);

      // Refrescar datos en segundo plano
      loadAllData().catch(err => console.warn('[handleTurnoSubmit] Error recargando datos:', err));
    } catch (err: unknown) {
      console.error('Error al guardar turno:', err);
      setTurnoError(err instanceof Error ? err.message : 'Error al guardar el turno. Intente nuevamente.');
    } finally {
      setIsSavingTurno(false);
    }
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
        {/* Banner de error de conexión a Supabase */}
        {dataError && (
          <div className="mb-6 p-4 rounded-2xl bg-status-error/15 border border-status-error/30 text-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-status-error shrink-0" size={20} />
              <div>
                <div className="text-sm font-bold text-status-error">Error al conectar con Supabase</div>
                <div className="text-xs text-text-muted">{dataError}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={loadAllData}
              className="px-3.5 py-1.5 rounded-xl bg-status-error/25 hover:bg-status-error/40 text-white text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Reintentar
            </button>
          </div>
        )}

        {/* Banner de error de operaciones CRUD */}
        {actionError && (
          <div className="mb-6 p-4 rounded-2xl bg-status-error/15 border border-status-error/30 text-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-status-error shrink-0" size={20} />
              <div className="text-xs text-status-error font-semibold">{actionError}</div>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-text-muted hover:text-white p-1"
            >
              <X size={16} />
            </button>
          </div>
        )}

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
                  {loading && empleados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-text-dim">
                        <div className="flex items-center justify-center gap-2 text-xs">
                          <Loader2 size={16} className="animate-spin text-neon-green" />
                          <span>Cargando empleados desde Supabase...</span>
                        </div>
                      </td>
                    </tr>
                  ) : empleados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-text-dim text-xs">
                        No hay empleados registrados en la base de datos de Supabase.
                        <br />
                        <span className="text-neon-green font-semibold">Crea un nuevo empleado con el botón superior.</span>
                      </td>
                    </tr>
                  ) : (
                    empleados.map((emp) => {
                      const isActivo = emp.estado === 'Activo' || emp.estado === 'activo' || emp.estado_biometrico === 'activo';
                      const isPendiente = !isActivo && (emp.estado === 'Pendiente_Biometria' || emp.estado === 'pendiente de enrolamiento' || emp.estado_biometrico === 'pendiente de enrolamiento');
                      const isInactivo = emp.estado === 'Inactivo' || emp.estado === 'inactivo';

                      return (
                        <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-4">
                            <div className="font-semibold text-text-main">{emp.nombre_completo}</div>
                            <div className="text-[10px] text-text-dim font-mono">{emp.id}</div>
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
                            {isActivo && (
                              <span className="text-status-success font-semibold flex items-center gap-1 text-xs">
                                <CheckCircle size={13} /> Activo (Enrolado)
                              </span>
                            )}
                            {isPendiente && (
                              <span className="text-status-warning font-semibold flex items-center gap-1 text-xs">
                                <AlertTriangle size={13} /> Pendiente de Enrolamiento
                              </span>
                            )}
                            {isInactivo && (
                              <span className="text-status-error font-semibold flex items-center gap-1 text-xs">
                                <XCircle size={13} /> Inactivo
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              {/* 3. Botón para Enrolar Rostro ("Guardar Rostro") */}
                              {isPendiente && (
                                <button
                                  type="button"
                                  onClick={() => startAdminEnrollment(emp)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neon-green/15 hover:bg-neon-green/25 text-neon-green border border-neon-green/30 text-xs font-semibold transition-all shadow-neon"
                                  title="Escanear y Guardar Rostro"
                                >
                                  <Camera size={13} />
                                  <span>Enrolar Rostro</span>
                                </button>
                              )}

                              {/* Botón Editar */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEmp(emp);
                                  setEmpDoc(emp.documento);
                                  setEmpName(emp.nombre_completo);
                                  setEmpTurnoId(emp.turno_id || '');
                                  setEmpEstado(emp.estado as EstadoEmpleado);
                                  setShowEmpModal(true);
                                }}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-muted hover:text-white transition-colors"
                                title="Editar"
                              >
                                <Edit3 size={14} />
                              </button>

                              {/* 4. Botón Eliminar con confirmación y loader directo a Supabase */}
                              <button
                                type="button"
                                disabled={deletingEmpId === emp.id}
                                onClick={() => handleDeleteEmpleado(emp)}
                                className="p-1.5 rounded-lg bg-status-error/10 hover:bg-status-error/20 text-status-error disabled:opacity-50 transition-colors"
                                title="Eliminar de Supabase"
                              >
                                {deletingEmpId === emp.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
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
                  <option value="Pendiente_Biometria">Pendiente de enrolamiento (Escáner facial)</option>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
              {empError && (
                <div className="p-2.5 rounded-xl bg-status-error/15 border border-status-error/30 text-status-error text-xs font-semibold">
                  {empError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEmpModal(false)} className="px-4 py-2 rounded-xl bg-white/5 text-text-muted">Cancelar</button>
                <button
                  type="submit"
                  disabled={isSavingEmp}
                  className="px-4 py-2 rounded-xl bg-neon-green disabled:opacity-50 text-black font-bold flex items-center gap-2"
                >
                  {isSavingEmp ? <Loader2 size={14} className="animate-spin" /> : null}
                  {isSavingEmp ? 'Guardando...' : 'Guardar'}
                </button>
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
              {turnoError && (
                <div className="p-2.5 rounded-xl bg-status-error/15 border border-status-error/30 text-status-error text-xs font-semibold">
                  {turnoError}
                </div>
              )}
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
                <button
                  type="submit"
                  disabled={isSavingTurno}
                  className="px-4 py-2 rounded-xl bg-neon-green disabled:opacity-50 text-black font-bold flex items-center gap-2"
                >
                  {isSavingTurno ? <Loader2 size={14} className="animate-spin" /> : null}
                  {isSavingTurno ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal de Enrolamiento Facial Directo desde Admin ("Guardar Rostro") */}
      {enrollingEmp && (
        <div className="fixed inset-0 bg-[#0B0F17]/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-md p-6 rounded-3xl flex flex-col items-center text-center relative border border-white/10 shadow-2xl">
            <button
              type="button"
              onClick={closeAdminEnrollment}
              disabled={isCapturingAdminFace}
              className="absolute top-4 right-4 text-text-muted hover:text-white p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-neon-green/15 border border-neon-green/30 flex items-center justify-center text-neon-green mb-4 shadow-neon">
              <ScanFace size={28} />
            </div>

            <h3 className="text-xl font-bold text-white mb-1">Guardar Rostro en Supabase</h3>
            <p className="text-xs text-text-muted mb-4 max-w-xs">
              Enrolamiento facial de <strong className="text-white">{enrollingEmp.nombre_completo}</strong> (DNI: {enrollingEmp.documento})
            </p>

            {enrollAdminError && (
              <div className="w-full mb-4 p-3 rounded-xl bg-status-error/15 border border-status-error/30 text-status-error text-xs font-semibold text-left">
                {enrollAdminError}
              </div>
            )}

            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black/60 border border-white/10 mb-5 flex items-center justify-center">
              <video
                ref={adminVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 pointer-events-none border-2 border-neon-green/30 rounded-2xl flex items-center justify-center">
                <div className="w-40 h-48 border-2 border-dashed border-neon-green/50 rounded-full animate-pulse" />
              </div>
            </div>

            {/* Botón Verde "Guardar Rostro" */}
            <button
              type="button"
              onClick={handleAdminCaptureFace}
              disabled={isCapturingAdminFace}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-neon-emerald to-neon-green hover:brightness-110 disabled:opacity-50 text-white font-bold text-sm tracking-wide shadow-neon flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {isCapturingAdminFace ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Guardando en Supabase...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Guardar Rostro</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
