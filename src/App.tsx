import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react'
import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { InsightsPage } from './pages/InsightsPage'
import { ProjectPage } from './pages/ProjectPage'
import { SignInPage } from './pages/SignInPage'
import { SimulatorPage } from './pages/SimulatorPage'
import { AppErrorBoundary, PageSkeleton, ToastProvider } from './components/ui'

function App(){return <ToastProvider><AppErrorBoundary><AuthLoading><PageSkeleton/></AuthLoading><Routes><Route path="/insights" element={<Authenticated><InsightsPage/></Authenticated>}/><Route path="*" element={<><Unauthenticated><SignInPage/></Unauthenticated><Authenticated><Routes><Route path="/" element={<HomePage/>}/><Route path="/p/:id" element={<ProjectPage/>}/><Route path="/admin/simulator" element={<SimulatorPage/>}/></Routes></Authenticated></>}/></Routes></AppErrorBoundary></ToastProvider>}
export default App
