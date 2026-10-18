import { useEffect, useRef, useState } from 'react'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/clerk-react'
import { AccountIcon, LeaderboardIcon, MenuIcon, SettingsIcon } from '../ui/icons'
import { colors } from '../../constants/colors'
import { FallingLeaves, NavFoliage, PixelLeafIcon } from '../decor/AdventureDecor'
import { navigateTo } from '../../services/navigation'

interface HeaderProps {
  title?: string
  activeSidequestCount?: number
  onSettingsClick?: () => void
  onMenuClick?: () => void
  showFoliage?: boolean
}

function Header({
  title = 'Sidequester',
  activeSidequestCount = 0,
  onSettingsClick,
  onMenuClick,
  showFoliage = true,
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
        aria-label={title}
        className="hud-header sticky top-0 z-30 w-full border-b px-3 py-2.5 sm:px-6 sm:py-3"
        style={{ backgroundColor: colors.surface, borderColor: colors.border }}
      >
        <div className="header-pixel-sky" aria-hidden="true">
          <PixelLeafIcon className="header-leaf header-leaf-one" />
          <PixelLeafIcon className="header-leaf header-leaf-two" />
          <PixelLeafIcon className="header-leaf header-leaf-three" />
          <PixelLeafIcon className="header-leaf header-leaf-four" />
          <PixelLeafIcon className="header-leaf header-leaf-five" />
          <PixelLeafIcon className="header-leaf header-leaf-six" />
          <PixelLeafIcon className="header-leaf header-leaf-seven" />
          <PixelLeafIcon className="header-leaf header-leaf-eight" />
        </div>
        <div className="header-content grid w-full grid-cols-[minmax(2.5rem,1fr)_auto_minmax(2.5rem,1fr)] items-center gap-2">
          <button
            type="button"
            aria-label={`Open menu${activeSidequestCount > 0
              ? `, ${activeSidequestCount} active sidequest${activeSidequestCount === 1 ? '' : 's'}`
              : ''}`}
            aria-haspopup="dialog"
            onClick={onMenuClick}
            className="hud-button relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center p-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: colors.foreground, outlineColor: colors.primary }}
            hidden={!onMenuClick}
          >
            <MenuIcon />
            {activeSidequestCount > 0 && (
              <span
                aria-hidden="true"
                className="quest-count-pixel absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[0.65rem] font-bold leading-none"
                style={{
                  backgroundColor: '#ed592d',
                  borderColor: colors.surface,
                  color: colors.secondaryForeground,
                }}
              >
                {activeSidequestCount > 99 ? '99+' : activeSidequestCount}
              </span>
            )}
          </button>
          {!onMenuClick && (
            <a
              href="/"
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                navigateTo('/')
              }}
              className="hud-button w-fit max-w-full justify-self-start rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: colors.foreground, outlineColor: colors.primary }}
            >
              Quest board
            </a>
          )}

          <a
            href="/welcome"
            aria-label="Sidequester — welcome page"
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              navigateTo('/welcome')
            }}
            className="brand-title min-w-0 justify-center truncate rounded-sm text-center"
            style={{ color: colors.foreground }}
          >
            <img src="/favicon.svg" alt="" aria-hidden="true" width="24" height="24" className="brand-icon" />
            <PixelLeafIcon className="brand-sparkle" />
            Sidequester
          </a>

          <div className="flex items-center justify-end gap-1">
            {onSettingsClick && <button
              type="button"
              aria-label="Settings"
              aria-haspopup="dialog"
              onClick={() => {
                onSettingsClick?.()
              }}
              className="hud-button inline-flex size-10 shrink-0 cursor-pointer items-center justify-center p-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: colors.foreground, outlineColor: colors.primary }}
            >
              <SettingsIcon />
            </button>}
            <a
              href="/leaderboard"
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                navigateTo('/leaderboard')
              }}
              aria-label="Leaderboard"
              className="hud-button inline-flex size-10 items-center justify-center gap-2 p-0 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:size-auto sm:min-h-10 sm:px-3 sm:py-2 sm:text-sm"
              style={{
                color: colors.foreground,
                outlineColor: colors.primary,
              }}
            >
              <LeaderboardIcon />
              <span className="hidden sm:inline">Leaderboard</span>
            </a>
            <SignedOut>
              <div className="relative" ref={authMenuRef}>
                <button
                  type="button"
                  aria-label="Sign in or sign up"
                  aria-haspopup="true"
                  aria-expanded={isAuthMenuOpen}
                  aria-controls="auth-dropdown"
                  onClick={() => setIsAuthMenuOpen((open) => !open)}
                  className="hud-button cursor-pointer p-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ color: colors.primary, outlineColor: colors.primary }}
                >
                  <AccountIcon />
                </button>
                {isAuthMenuOpen && (
                  <div
                    id="auth-dropdown"
                    aria-label="Authentication options"
                    className="rpg-dialog absolute right-0 top-full z-40 mt-2 w-44 rounded-xl border p-2 shadow-xl"
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
        {showFoliage && <NavFoliage />}
      </header>
      <FallingLeaves />
    </>
  )
}

export default Header
