/** Selected sprites from the supplied kit, plus original matching artwork. */
function Icon({ name, className = 'size-6' }: { name: string; className?: string }) {
  return <img src={`/art/cozy/${name}.png`} alt="" aria-hidden="true" draggable={false} className={`cozy-icon ${className}`} />
}
function MenuIcon() { return <Icon name="satchel" className="size-7 sm:size-8" /> }
function BackIcon() { return <img src="/art/cozy/navigation-arrow.svg" alt="" aria-hidden="true" draggable={false} className="cozy-icon size-5 rotate-180" /> }
function AccountIcon() { return <Icon name="portrait" className="size-7" /> }
function SettingsIcon() { return <Icon name="settings" className="size-6 sm:size-7" /> }
function LeaderboardIcon() { return <Icon name="trophy" className="size-5 sm:size-6" /> }
function CloseIcon() { return <Icon name="close" className="size-4 sm:size-5" /> }
export { AccountIcon, BackIcon, CloseIcon, LeaderboardIcon, MenuIcon, SettingsIcon }
