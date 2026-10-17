import { useEffect, useState } from 'react'
import { colors } from '../constants/colors'

function LocationPrivacySettings() {
  const [permission, setPermission] = useState<
    'granted' | 'denied' | 'prompt' | 'unsupported' | 'checking'
  >('checking')

  useEffect(() => {
    let isCurrent = true
    let permissionStatus: PermissionStatus | undefined

    async function readPermission() {
      if (!navigator.permissions?.query) {
        setPermission('unsupported')
        return
      }

      try {
        permissionStatus = await navigator.permissions.query({ name: 'geolocation' })
        if (!isCurrent) return

        setPermission(permissionStatus.state)
        permissionStatus.onchange = () => {
          if (isCurrent && permissionStatus) setPermission(permissionStatus.state)
        }
      } catch {
        if (isCurrent) setPermission('unsupported')
      }
    }

    void readPermission()
    return () => {
      isCurrent = false
      if (permissionStatus) permissionStatus.onchange = null
    }
  }, [])

  const permissionLabel = {
    checking: 'Checking browser permission…',
    granted: 'Allowed',
    denied: 'Blocked',
    prompt: 'Not yet allowed',
    unsupported: 'Permission status unavailable',
  }[permission]

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4"
        style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Location permission</span>
          <span
            className="rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{
              color: permission === 'granted' ? colors.success : colors.muted,
              backgroundColor:
                permission === 'granted' ? colors.successBackground : colors.surface,
              borderColor:
                permission === 'granted' ? colors.successBorder : colors.border,
            }}
          >
            {permissionLabel}
          </span>
        </div>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
        When you’re signed in and your browser already allows location access, Sidequester can
        use your approximate location to fill in the Where filter. Your location is not saved
        to your account. To change access, use your browser’s site permissions.
      </p>
    </div>
  )
}

export default LocationPrivacySettings
