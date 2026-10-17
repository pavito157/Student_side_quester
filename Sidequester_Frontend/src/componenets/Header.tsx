import { useEffect, useRef, useState } from 'react'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/clerk-react'
import { AccountIcon, MenuIcon, SettingsIcon } from './icons'
import { colors } from '../constants/colors'
import SidebarModal from './SidebarModal'
import SettingsModal from './SettingsModal'
import VibeEditor, { type Vibe } from './VibeEditor'

interface HeaderProps {
  title?: string
  onSettingsClick?: () => void
}

function Header({
  title = 'Sidequester',
  onSettingsClick,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isAddVibeOpen, setIsAddVibeOpen] = useState(false)
  const [vibeToEdit, setVibeToEdit] = useState<Vibe | null>(null)
  const [vibes, setVibes] = useState<Vibe[]>([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false)
  const authMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isAuthMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!authMenuRef.current?.contains(event.target as Node)) {
        setIsAuthMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsAuthMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAuthMenuOpen])

  return (
    <>
      <header
        className="sticky top-0 z-10 w-full border-b px-3 py-2.5 sm:px-6 sm:py-3"
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      >
        <div className="relative flex w-full items-center justify-between">
          <button
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            onClick={() => setIsMenuOpen(true)}
            className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: colors.foreground, outlineColor: colors.primary }}
          >
            <MenuIcon />
          </button>

          <h1
            className="pointer-events-none absolute left-1/2 max-w-[calc(100%-8rem)] -translate-x-1/2 truncate text-base font-bold sm:text-xl"
            style={{ color: colors.foreground }}
          >
            {title}
          </h1>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Settings"
              aria-haspopup="dialog"
              aria-expanded={isSettingsOpen}
              onClick={() => {
                setIsSettingsOpen(true)
                onSettingsClick?.()
              }}
              className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: colors.secondary, outlineColor: colors.secondary }}
            >
              <SettingsIcon />
            </button>
            <SignedOut>
              <div className="relative" ref={authMenuRef}>
                <button
                  type="button"
                  aria-label="Sign in or sign up"
                  aria-haspopup="true"
                  aria-expanded={isAuthMenuOpen}
                  aria-controls="auth-dropdown"
                  onClick={() => setIsAuthMenuOpen((open) => !open)}
                  className="cursor-pointer rounded-lg p-2 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: colors.primary, outlineColor: colors.primary }}
                >
                  <AccountIcon />
                </button>
                {isAuthMenuOpen && (
                  <div
                    id="auth-dropdown"
                    aria-label="Authentication options"
                    className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border p-2 shadow-xl"
                    style={{
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.border,
                    }}
                  >
                    <SignInButton mode="modal">
                      <button
                        type="button"
                        onClick={() => setIsAuthMenuOpen(false)}
                        className="w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: colors.foreground, outlineColor: colors.primary }}
                      >
                        Sign in
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                      <button
                        type="button"
                        onClick={() => setIsAuthMenuOpen(false)}
                        className="mt-1 w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{
                          backgroundColor: colors.primary,
                          color: colors.primaryForeground,
                          outlineColor: colors.primary,
                        }}
                      >
                        Sign up
                      </button>
                    </SignUpButton>
                  </div>
                )}
              </div>
            </SignedOut>
            <SignedIn>
              <div className="[&_button]:cursor-pointer">
                <UserButton />
              </div>
            </SignedIn>
          </div>
        </div>
      </header>

      
      <SidebarModal
        isOpen={isMenuOpen}
        onClose={() => {
          setIsMenuOpen(false)
          setIsAddVibeOpen(false)
          setVibeToEdit(null)
        }}
        onAddVibe={() => {
          setVibeToEdit(null)
          setIsAddVibeOpen(true)
        }}
        onBack={isAddVibeOpen ? () => {
          setIsAddVibeOpen(false)
          setVibeToEdit(null)
        } : undefined}
        showAddVibe={!isAddVibeOpen}
        title={isAddVibeOpen ? (vibeToEdit ? 'Edit vibe' : 'Add a vibe') : 'Quick menu'}
      >
        {isAddVibeOpen ? (
          <VibeEditor
            key={vibeToEdit?.id ?? 'new-vibe'}
            vibeToEdit={vibeToEdit}
            onSave={(vibe) => {
              if (vibeToEdit) {
                setVibes((savedVibes) =>
                  savedVibes.map((savedVibe) =>
                    savedVibe.id === vibeToEdit.id ? { ...vibe, id: vibeToEdit.id } : savedVibe,
                  ),
                )
              } else {
                setVibes((savedVibes) => [...savedVibes, { ...vibe, id: crypto.randomUUID() }])
              }
              setIsAddVibeOpen(false)
              setVibeToEdit(null)
            }}
            onDelete={(id) => {
              setVibes((savedVibes) => savedVibes.filter((vibe) => vibe.id !== id))
              setIsAddVibeOpen(false)
              setVibeToEdit(null)
            }}
          />
        ) : vibes.length === 0 ? (
          <p className="text-sm" style={{ color: colors.muted }}>
            Your next side quest is just around the corner. Add a vibe to save your preferences.
          </p>
        ) : (
          <ul className="space-y-3">
            {vibes.map((vibe) => (
              <li
                key={vibe.id}
                className="rounded-xl border p-4"
                style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border }}
              >
                <h3 className="truncate font-semibold">{vibe.name}</h3>
                <p
                  className="mt-1 line-clamp-2 text-sm"
                  style={{ color: colors.muted }}
                  title={vibe.description}
                >
                  {vibe.description}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setVibeToEdit(vibe)
                    setIsAddVibeOpen(true)
                  }}
                  className="mt-3 min-h-10 cursor-pointer rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: colors.border,
                    color: colors.primary,
                    outlineColor: colors.primary,
                  }}
                >
                  Edit vibe
                </button>
              </li>
            ))}
          </ul>
        )}
      </SidebarModal>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  )
}

export default Header
