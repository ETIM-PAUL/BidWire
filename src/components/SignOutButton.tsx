import { useAuthActions } from '@convex-dev/auth/react'

export function SignOutButton() {
  const { signOut } = useAuthActions()
  return (
    <button
      onClick={() => void signOut()}
      className="text-sm text-neutral-400 hover:text-neutral-200"
    >
      Sign out
    </button>
  )
}
