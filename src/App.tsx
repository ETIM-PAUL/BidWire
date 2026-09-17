import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react'
import { Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ProjectPage } from './pages/ProjectPage'
import { SignInPage } from './pages/SignInPage'

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
        </Routes>
      </Authenticated>
    </>
  )
}

export default App
