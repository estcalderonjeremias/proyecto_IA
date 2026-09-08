import { NextRequest, NextResponse } from 'next/server';
import { ServerStore } from '@/lib/serverStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = ServerStore.getAll();
    return NextResponse.json({
      success: true,
      data: store
    });
  } catch (error) {
    console.error('[API /api/sync GET] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener datos del servidor' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, data } = body;

    switch (action) {
      case 'saveEmpleado': {
        const saved = ServerStore.saveEmpleado(data);
        return NextResponse.json({ success: true, data: saved });
      }

      case 'deleteEmpleado': {
        ServerStore.deleteEmpleado(data.id);
        return NextResponse.json({ success: true });
      }

      case 'saveTurno': {
        const saved = ServerStore.saveTurno(data);
        return NextResponse.json({ success: true, data: saved });
      }

      case 'deleteTurno': {
        ServerStore.deleteTurno(data.id);
        return NextResponse.json({ success: true });
      }

      case 'saveAsistencia': {
        const saved = ServerStore.saveAsistencia(data);
        return NextResponse.json({ success: true, data: saved });
      }

      case 'bulkMerge': {
        const merged = ServerStore.bulkMerge(data);
        return NextResponse.json({ success: true, data: merged });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Acción desconocida: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[API /api/sync POST] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error al procesar la solicitud en el servidor' },
      { status: 500 }
    );
  }
}
