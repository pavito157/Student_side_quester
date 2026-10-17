export function navigateTo(path: string): void {
  if (window.location.pathname === path) return

  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'instant' })
}
