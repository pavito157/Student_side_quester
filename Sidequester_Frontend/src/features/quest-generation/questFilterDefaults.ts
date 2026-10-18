/** Automatic default only; explicit checkbox choices take precedence. */
export function defaultMultiQuest(time: string, customTime = ''): boolean {
  if (!time || time === 'any') return false
  const minutes = Number(time === 'custom' ? customTime : time)
  return Number.isFinite(minutes) && minutes >= 60
}

