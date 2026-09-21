import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react'
import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ProjectPage } from './pages/ProjectPage'
import { SignInPage } from './pages/SignInPage'
import { SimulatorPage } from './pages/SimulatorPage'

function App() {
  return (
    <>
      <AuthLoading>
        <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
          Loading…
        </div>
      </AuthLoading>
      <Unauthenticated>
        <SignInPage />
      </Unauthenticated>
      <Authenticated>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/p/:id" element={<ProjectPage />} />
          <Route path="/admin/simulator" element={<SimulatorPage />} />
        </Routes>
      </Authenticated>
    </>
  )
}

export default App
