import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react'
import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ProjectPage } from './pages/ProjectPage'
import { SignInPage } from './pages/SignInPage'
import { SimulatorPage } from './pages/SimulatorPage'
import { PageSkeleton, ToastProvider } from './components/ui'

function App() {
  return <ToastProvider>
    <AuthLoading><PageSkeleton /></AuthLoading>
    <Unauthenticated><SignInPage /></Unauthenticated>
    <Authenticated><Routes><Route path="/" element={<HomePage />} /><Route path="/p/:id" element={<ProjectPage />} /><Route path="/admin/simulator" element={<SimulatorPage />} /></Routes></Authenticated>
  </ToastProvider>
}
export default App
