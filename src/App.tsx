import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { AdminDashboard } from './pages/AdminDashboard';
import { SalesAgentDashboard } from './pages/SalesAgentDashboard';
import { OperationsManagerDashboard } from './pages/OperationsManagerDashboard';
import { OperatorDashboard } from './pages/OperatorDashboard';
import { LeadManagement } from './pages/LeadManagement';
import { QuotationManagement } from './pages/QuotationManagement';
import { QuotationCreation } from './pages/QuotationCreation';
import { JobScheduling } from './pages/JobScheduling';
import { SiteAssessment } from './pages/SiteAssessment';
import { JobSummaryFeedback } from './pages/JobSummaryFeedback';
import { EquipmentManagement } from './pages/EquipmentManagement';
import { ServicesManagement } from './pages/ServicesManagement';
import { UserManagement } from './pages/UserManagement';
import { Config } from './pages/Config';
import { Customers } from './pages/Customers';
import { Deals } from './pages/Deals';
import { DealDetails } from './pages/DealDetails';
import { useAuthStore } from './store/authStore';
import { QuotationTemplates } from './pages/QuotationTemplates';
import { QuotationTemplateEditor } from './pages/QuotationTemplateEditor';
import { AuthProvider } from './components/auth/SimpleAuthProvider';
import { ProtectedRoute } from './components/auth/SimpleProtectedRoute';

// Pre-determine the appropriate dashboard component based on user role
function DashboardRouter() {
  const { user, isAuthenticated } = useAuthStore();
  
  console.log('🏠 DashboardRouter called - User:', user, 'Authenticated:', isAuthenticated);
  
  // This should never actually happen because of ProtectedRoute,
  // but it's a safety check
  if (!isAuthenticated || !user) {
    console.log('❌ DashboardRouter: User not authenticated or missing, redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  // Ensure user role exists
  if (!user.role) {
    console.log('❌ DashboardRouter: User role is undefined');
    
    // Assign a default role based on email
    let defaultRole = 'operator';
    if (user.email) {
      if (user.email.includes('admin')) {
        defaultRole = 'admin';
      } else if (user.email.includes('sales')) {
        defaultRole = 'sales_agent';
      } else if (user.email.includes('manager') || user.email.includes('ops')) {
        defaultRole = 'operations_manager';
      }
    }
    
    console.log(`✅ Assigned default role: ${defaultRole} based on email: ${user.email}`);
    user.role = defaultRole as any;
  }
  
  // Return the appropriate dashboard based on role
  console.log('👤 Loading dashboard for role:', user.role);
  
  switch (user.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'sales_agent':
      return <SalesAgentDashboard />;
    case 'operations_manager':
      return <OperationsManagerDashboard />;
    case 'operator':
      return <OperatorDashboard />;
    default:
      console.log('❌ Unknown user role:', user.role, 'redirecting to login');
      return <Navigate to="/login" replace />;
  }
}

// Error fallback component for error boundaries (used in error cases)
export function ErrorFallback() {
  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center">
      <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
      <p className="mb-6">We encountered an error loading your dashboard.</p>
      <button 
        onClick={() => {
          // Clear potential error state
          sessionStorage.clear();
          localStorage.clear();
          window.location.href = '/login';
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Return to Login
      </button>
    </div>
  );
}

// Main application content (safety timeout removed to prevent auto-redirects)
function AppContent() {
  // No global timeout - auto-redirects were causing issues
  
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-white flex min-h-screen items-center justify-center z-50 loading-screen">
        <div className="flex flex-col items-center">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-4"></div>
          <p className="text-lg text-gray-700 font-medium">Loading application...</p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Click here if loading takes too long
          </button>
        </div>
      </div>
    }>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Protected routes that require authentication */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardRouter />} />
            
            <Route path="leads" element={<LeadManagement />} />
            <Route path="deals" element={<Deals />} />
            <Route path="deals/:id" element={<DealDetails />} />
            <Route path="quotations" element={<QuotationManagement />} />
            <Route path="quotations/create" element={<QuotationCreation />} />
            <Route path="customers" element={<Customers />} />
            
            <Route path="jobs" element={<JobScheduling />} />
            <Route path="site-assessment" element={<SiteAssessment />} />
            <Route path="job-summary/:id" element={<JobSummaryFeedback />} />
            
            {/* Admin-only routes */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="config" element={<Config />} />
              <Route path="config/users" element={<UserManagement />} />
              <Route path="config/equipment" element={<EquipmentManagement />} />
              <Route path="config/services" element={<ServicesManagement />} />
            </Route>
            
            <Route path="feedback" element={<JobSummaryFeedback />} />
            
            {/* Templates routes with role protection */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'sales_agent']} />}>
              <Route path="templates" element={<QuotationTemplates />} />
              <Route path="templates/new" element={<QuotationTemplateEditor />} />
              <Route path="templates/edit/:id" element={<QuotationTemplateEditor />} />
            </Route>
          </Route>
        </Route>
        
        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

// Main App component
function App() {
  useEffect(() => {
    // Auth listener is now initialized in main.tsx to prevent duplicate initialization
    console.log('App component mounted - auth listener already initialized in main.tsx');
  }, []);
  
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
