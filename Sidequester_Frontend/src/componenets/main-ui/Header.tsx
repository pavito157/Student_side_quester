import { useEffect, useRef, useState } from 'react'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/clerk-react'
import { AccountIcon, MenuIcon, SettingsIcon } from '../icons'
import { colors } from '../../constants/colors'

interface HeaderProps {
  title?: string
  onSettingsClick?: () => void
  onMenuClick: () => void
}

function Header({
  title = 'Sidequester',
  onSettingsClick,
  onMenuClick,
}: HeaderProps) {
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
            onClick={onMenuClick}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg p-0 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
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
              onClick={() => {
                onSettingsClick?.()
              }}
              className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg p-0 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
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
              <div className="inline-flex size-10 shrink-0 items-center justify-center">
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox: 'size-8',
                    },
                  }}
                />
              </div>
            </SignedIn>
          </div>
        </div>
      </header>
    </>
  )
}

export default Header
