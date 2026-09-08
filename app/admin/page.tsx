'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminDashboardView } from '@/components/admin/AdminDashboardView';
import { AdminAuthModal } from '@/components/admin/AdminAuthModal';

export default function AdminPage() {
  const router = useRouter();
  // El estado de autenticación reside en la memoria de React de la sesión.
  // Al refrescar el navegador o volver al Kiosco, se reinicia a false, bloqueando el panel.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleBackToKiosk = () => {
    setIsAuthenticated(false);
    router.push('/');
  };

  if (!isAuthenticated) {
    return (
      <AdminAuthModal
        isOpen={true}
        onSuccess={handleAuthSuccess}
        onCancel={handleBackToKiosk}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-main">
      <AdminDashboardView onBackToKiosk={handleBackToKiosk} />
    </div>
  );
}
