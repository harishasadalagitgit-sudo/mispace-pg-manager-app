import { HashRouter, Route, Routes } from 'react-router-dom'
import LoginScreen from './components/LoginScreen'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import IncomeEntry from './pages/IncomeEntry'
import ExpenseEntry from './pages/ExpenseEntry'
import Approvals from './pages/Approvals'
import Records from './pages/Records'
import Directory from './pages/Directory'
import Bookings from './pages/Bookings'
import UpdateResidents from './pages/UpdateResidents'
import UpdateEmployees from './pages/UpdateEmployees'
import Reports from './pages/Reports'
import Checklist from './pages/Checklist'
import Settings from './pages/Settings'
import { AuthProvider, useAuth } from './lib/auth'

function AppRoutes(): React.JSX.Element {
  const { role } = useAuth()

  if (!role) {
    return <LoginScreen />
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="income/new" element={<IncomeEntry />} />
          <Route path="expense/new" element={<ExpenseEntry />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="records" element={<Records />} />
          <Route path="directory" element={<Directory />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="update-residents" element={<UpdateResidents />} />
          <Route path="update-employees" element={<UpdateEmployees />} />
          <Route path="reports" element={<Reports />} />
          <Route path="checklist" element={<Checklist />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
