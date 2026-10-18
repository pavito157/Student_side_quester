// Stable canonical catalog IDs. Artwork is original; no official UF insignias.
const ids = ['beaty_towers', 'broward_hall', 'buckman_hall', 'cypress_hall', 'east_hall',
  'fletcher_hall', 'honors_village', 'hume_hall', 'infinity_hall', 'jennings_hall',
  'keys_residential_complex', 'lakeside_residential_complex', 'mallory_hall', 'murphree_hall',
  'north_hall', 'rawlings_hall', 'reid_hall', 'riker_hall', 'sledd_hall',
  'springs_residential_complex', 'thomas_hall', 'tolbert_hall', 'weaver_hall', 'yulee_hall', 'off_campus'] as const
const palettes = [
  ['#32674d', '#ffe4a0'], ['#435785', '#e6d4ff'], ['#90452e', '#ffe4a0'],
  ['#35676e', '#c6f0df'], ['#744a78', '#ffe0bc'],
] as const
export const DORM_EMBLEMS = Object.fromEntries(ids.map((id, index) => [id, {
  id, motif: index % 5, variant: Math.floor(index / 5),
  colors: [palettes[index % 5][0], ['#ffe4a0', '#d9edce', '#f4d3ce', '#d6e5f2', '#f4e4ba'][Math.floor(index / 5)]],
}]))
const fallback = { id: 'unknown', motif: 0, variant: 0, colors: ['#5c6259', '#f3ebd0'] as readonly string[] }
export function getDormEmblem(id: string) {
  return Object.hasOwn(DORM_EMBLEMS, id) ? DORM_EMBLEMS[id] : fallback
}
