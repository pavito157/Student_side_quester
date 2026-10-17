import { useState } from 'react'
import { AccountIcon, MenuIcon, SettingsIcon } from './icons'
import { colors } from '../constants/colors'
import SidebarModal from './SidebarModal'

interface HeaderProps {
  title?: string
  onAccountClick?: () => void
  onSettingsClick?: () => void
}

function Header({
  title = 'Sidequester',
  onAccountClick,
  onSettingsClick,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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
            className="rounded-lg p-2 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
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
              aria-label="Account"
              onClick={onAccountClick}
              className="rounded-lg p-2 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: colors.primary, outlineColor: colors.primary }}
            >
              <AccountIcon />
            </button>
            <button
              type="button"
              aria-label="Settings"
              onClick={onSettingsClick}
              className="rounded-lg p-2 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: colors.secondary, outlineColor: colors.secondary }}
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
      </header>

      
      <SidebarModal
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title="Quick menu"
      >
        <p className="text-sm" style={{ color: colors.muted }}>
          Your next side quest is just around the corner.
        </p>
      </SidebarModal>
    </>
  )
}

export default Header
