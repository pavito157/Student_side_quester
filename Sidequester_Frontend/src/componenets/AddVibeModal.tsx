import VibeEditor from './sidebar/VibeEditor'
import type { Vibe } from '../types/vibe'

interface AddVibeModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (vibe: Omit<Vibe, 'id' | 'createdAt' | 'updatedAt'>) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
  vibeToEdit?: Vibe | null
}

function AddVibeModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  vibeToEdit,
}: AddVibeModalProps) {
  if (!isOpen) return null

  return (
    <VibeEditor
      key={vibeToEdit?.id ?? 'new-vibe'}
      vibeToEdit={vibeToEdit}
      onSave={async (vibe) => {
        await onSave(vibe)
        onClose()
      }}
      onDelete={async (id) => {
        await onDelete(id)
        onClose()
      }}
    />
  )
}

export default AddVibeModal
