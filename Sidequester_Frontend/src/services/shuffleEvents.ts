/** Fresh array; event identity, cached instructions and acceptance state stay intact. */
export function shuffleEvents<T extends { id: string }>(events: T[], previous: T[] = []): T[] {
  const shuffled = [...events]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
  }
  // A refresh should visibly change the order when there is more than one event.
  if (shuffled.length > 1 && shuffled.length === previous.length
      && shuffled.every((event, index) => event.id === previous[index].id)) {
    shuffled.push(shuffled.shift()!)
  }
  return shuffled
}
