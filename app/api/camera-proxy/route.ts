import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  try {
    const controller = new AbortController();
    // Timeout para la conexión inicial
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(targetUrl, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return new NextResponse(`Remote camera server returned ${res.status}`, { status: res.status });
    }

    const contentType = res.headers.get('Content-Type') || '';

    // Si es un flujo continuo MJPEG (como DroidCam /video o IP Webcam /video)
    if (
      contentType.includes('multipart') ||
      targetUrl.includes('/video') ||
      targetUrl.includes('/mjpeg')
    ) {
      return new NextResponse(res.body, {
        headers: {
          'Content-Type': contentType || 'multipart/x-mixed-replace; boundary=boundarydonotcross',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Connection': 'keep-alive',
        },
      });
    }

    // Si es una imagen estática (ej: /shot.jpg, /snapshot.jpg)
    const arrayBuffer = await res.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType || 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error conectando con la cámara del celular';
    return new NextResponse(message, { status: 502 });
  }
}
