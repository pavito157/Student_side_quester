import VibeEditor, { type Vibe } from './VibeEditor'

interface AddVibeModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (vibe: Omit<Vibe, 'id'>) => void
  onDelete: (id: string) => void
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
      onSave={(vibe) => {
        onSave(vibe)
        onClose()
      }}
      onDelete={(id) => {
        onDelete(id)
        onClose()
      }}
    />
  )
}

export default AddVibeModal
