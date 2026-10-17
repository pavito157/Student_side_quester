import { useEffect, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { deleteUserVibe, getUserVibes, saveUserVibe } from '../../services/vibes'
import type { Vibe } from '../../types/vibe'
import SidebarModal from './SidebarModal'
import VibeEditor from './VibeEditor'
import VibeCard from './VibeCard'
import ActiveSidequests from '../main-ui/ActiveSidequests'
import type { ActiveSidequest } from '../../types/sidequest'

interface VibesSidebarProps {
  isOpen: boolean
  onClose: () => void
  onApplyVibe: (vibe: Vibe) => void
  activeSidequests: ActiveSidequest[]
  isLoadingActiveSidequests: boolean
  activeSidequestsError: string
}

type VibeListState = {
  userId: string | null
  vibes: Vibe[]
  error: string
}

function VibesSidebar({
  isOpen,
  onClose,
  onApplyVibe,
  activeSidequests,
  isLoadingActiveSidequests,
  activeSidequestsError,
}: VibesSidebarProps) {
  const { isLoaded, isSignedIn, user } = useUser()
  const userId = user?.id
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [vibeToEdit, setVibeToEdit] = useState<Vibe | null>(null)
  const [vibeList, setVibeList] = useState<VibeListState>({
    userId: null,
    vibes: [],
    error: '',
  })
  const hasLoadedCurrentUser = vibeList.userId === userId
  const vibes = userId && hasLoadedCurrentUser ? vibeList.vibes : []
  const vibeListError = userId && hasLoadedCurrentUser ? vibeList.error : ''
  const isLoadingVibes = !isLoaded || Boolean(userId && !hasLoadedCurrentUser)
  const canManageVibes = isLoaded && isSignedIn === true && Boolean(userId)
  const shouldShowEditor = isEditorOpen && canManageVibes

  useEffect(() => {
    if (!isOpen || !isLoaded || !userId) return

    let isCurrent = true
    void getUserVibes(userId)
      .then((savedVibes) => {
        if (isCurrent) setVibeList({ userId, vibes: savedVibes, error: '' })
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setVibeList({
            userId,
            vibes: [],
            error: error instanceof Error ? error.message : 'Could not load your saved vibes.',
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [isLoaded, isOpen, userId])

  function closeSidebar() {
    setIsEditorOpen(false)
    setVibeToEdit(null)
    onClose()
  }

  async function saveVibe(vibe: Parameters<typeof saveUserVibe>[1]) {
    if (!userId) throw new Error('Sign in to save vibes to your account.')
    const savedVibe = await saveUserVibe(userId, vibe, vibeToEdit?.id)
    setVibeList((current) => {
      if (current.userId !== userId) return current
      return {
        ...current,
        error: '',
        vibes: vibeToEdit
          ? current.vibes.map((currentVibe) =>
              currentVibe.id === savedVibe.id ? savedVibe : currentVibe,
            )
          : [savedVibe, ...current.vibes],
      }
    })
    setIsEditorOpen(false)
    setVibeToEdit(null)
  }

  async function removeVibe(id: string) {
    if (!userId) throw new Error('Sign in to delete saved vibes.')
    await deleteUserVibe(userId, id)
    setVibeList((current) => {
      if (current.userId !== userId) return current
      return { ...current, vibes: current.vibes.filter((vibe) => vibe.id !== id) }
    })
    setIsEditorOpen(false)
    setVibeToEdit(null)
  }

  return (
    <SidebarModal
      isOpen={isOpen}
      onClose={closeSidebar}
      onAddVibe={() => {
        if (!canManageVibes) return
        setVibeToEdit(null)
        setIsEditorOpen(true)
      }}
      onBack={shouldShowEditor ? () => {
        setIsEditorOpen(false)
        setVibeToEdit(null)
      } : undefined}
      showAddVibe={!shouldShowEditor && canManageVibes}
      title={shouldShowEditor ? (vibeToEdit ? 'Edit vibe' : 'Add a vibe') : 'Quick menu'}
    >
      {shouldShowEditor ? (
        <VibeEditor
          key={vibeToEdit?.id ?? 'new-vibe'}
          vibeToEdit={vibeToEdit}
          onSave={saveVibe}
          onDelete={removeVibe}
        />
      ) : (
        <>
          {isLoadingVibes ? (
            <p role="status" className="text-sm" style={{ color: colors.muted }}>
              Loading your saved vibes...
            </p>
          ) : vibeListError ? (
            <p role="alert" className="text-sm" style={{ color: colors.error }}>
              {vibeListError}
            </p>
          ) : vibes.length === 0 ? (
            <p className="text-sm" style={{ color: colors.muted }}>
              {userId
                ? 'Your next sidequest is just around the corner. Add a vibe to save your preferences.'
                : 'Sign in to save vibes to your account and use them on your next sidequest.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {vibes.map((vibe) => (
                <VibeCard
                  key={vibe.id}
                  vibe={vibe}
                  onUse={(selectedVibe) => {
                    onApplyVibe(selectedVibe)
                    closeSidebar()
                  }}
                  onEdit={(editedVibe) => {
                    setVibeToEdit(editedVibe)
                    setIsEditorOpen(true)
                  }}
                />
              ))}
            </ul>
          )}
          <ActiveSidequests
            sidequests={activeSidequests}
            isLoading={isLoadingActiveSidequests}
            error={activeSidequestsError}
            isSignedIn={isSignedIn === true}
          />
        </>
      )}
    </SidebarModal>
  )
}

export default VibesSidebar
