import React from 'react'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import LoginPage from '@/components/shared/LoginPage'
import Dashboard from '@/components/shared/Dashboard'
import { Toaster } from 'sonner'

const AppContent: React.FC = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return user ? <Dashboard /> : <LoginPage />
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  )
}

export default App
