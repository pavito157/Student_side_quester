import { useState } from 'react'
import { colors } from '../../constants/colors'
import BudgetButton from './BudgetButton'
import SidequestMeButton from './SidequestMeButton'
import TimeButton from './TimeButton'
import WhereButton from './WhereButton'

type Filters = {
  where: string
  time: string
  budget: string
}

const sidequests = [
  // Reitz Union
  { name: 'Find a student org flyer for an event this week and add it to your calendar', where: 'reitz-union', minutes: 15, cost: 0 },
  { name: 'Grab a coffee or snack and people-watch for a bit', where: 'reitz-union', minutes: 30, cost: 5 },
  { name: 'Treat a friend to lunch at the food court', where: 'reitz-union', minutes: 45, cost: 15 },
  { name: 'Go to an event and introduce yourself to two new people', where: 'reitz-union', minutes: 120, cost: 0 },

  // Marston Science Library
  { name: 'Browse the shelves and find a book on a topic you know nothing about', where: 'Marston', minutes: 30, cost: 0 },
  { name: 'Find the best study spot on a floor you have never visited', where: 'Marston', minutes: 45, cost: 0 },
  { name: 'Do a 60-minute phone-free study sprint', where: 'Marston', minutes: 60, cost: 0 },
  { name: 'Reserve a group study room and start a study group with two classmates', where: 'Marston', minutes: 120, cost: 0 },

  // Library West
  { name: 'Write down your goals for the semester in a quiet corner', where: 'Libwest', minutes: 30, cost: 0 },
  { name: 'Pick up a book outside your major and read the first chapter', where: 'Libwest', minutes: 45, cost: 0 },
  { name: 'Swap flashcards with a friend for an hour', where: 'Libwest', minutes: 60, cost: 0 },
  { name: 'Plan out your whole month of assignments and exams', where: 'Libwest', minutes: 90, cost: 0 },

  // Flavet Field
  { name: 'Toss a frisbee or kick a ball around with a friend', where: 'Flavet', minutes: 30, cost: 0 },
  { name: 'Pack a picnic and eat it on the field', where: 'Flavet', minutes: 60, cost: 8 },
  { name: 'Organize a pickup game with at least five friends', where: 'Flavet', minutes: 90, cost: 0 },
  { name: 'Bring snacks and host a sunset hangout for your group', where: 'Flavet', minutes: 120, cost: 15 },

  // Lake Wauburg (off campus, minutes include travel)
  { name: 'Take sunset photos from the shoreline', where: 'Wauburg', minutes: 120, cost: 0 },
  { name: 'Play sand volleyball with a group', where: 'Wauburg', minutes: 120, cost: 0 },
  { name: 'Pack lunch and picnic by the lake', where: 'Wauburg', minutes: 150, cost: 8 },
  { name: 'Spend the afternoon on the water with friends', where: 'Wauburg', minutes: 180, cost: 20 },

  // Southwest Recreation Center
  { name: 'Shoot hoops or join a pickup game', where: 'SouthWest', minutes: 45, cost: 0 },
  { name: 'Try a group fitness class you have never done', where: 'SouthWest', minutes: 60, cost: 0 },
  { name: 'Swim a few laps or relax at the pool', where: 'SouthWest', minutes: 60, cost: 0 },
  { name: 'Work out, then grab a post-workout meal with a friend', where: 'SouthWest', minutes: 120, cost: 15 },

  // Student Recreation Center
  { name: 'Look up intramural sports and sign up a team', where: 'studentrec', minutes: 15, cost: 0 },
  { name: 'Do a 30-minute workout with a friend who has never been', where: 'studentrec', minutes: 30, cost: 0 },
  { name: 'Try a machine or workout you have never used', where: 'studentrec', minutes: 45, cost: 0 },
  { name: 'Play pickup basketball with strangers, then get a smoothie', where: 'studentrec', minutes: 90, cost: 5 },
]

function QuestFilterButtons() {
  const [selectedFilters, setSelectedFilters] = useState<Filters>({
    where: '',
    time: '',
    budget: '',
  })
  const [suggestion, setSuggestion] = useState('')

  function generateSidequest() {
    if (!selectedFilters.where || !selectedFilters.time || !selectedFilters.budget) {
      setSuggestion('Please select an option for Where, Time, and Budget.')
      return
    }

    const matches = sidequests.filter((sidequest) => {
      const matchesWhere =
        !selectedFilters.where ||
        selectedFilters.where === 'any' ||
        sidequest.where === selectedFilters.where
      const timeLimit = Number(selectedFilters.time)
      const matchesTime =
        !selectedFilters.time ||
        selectedFilters.time === 'any' ||
        (timeLimit === 120 ? sidequest.minutes >= timeLimit : sidequest.minutes <= timeLimit)
      const matchesBudget =
        !selectedFilters.budget ||
        selectedFilters.budget === 'any' ||
        (selectedFilters.budget === '0'
          ? sidequest.cost === 0
          : selectedFilters.budget === '10'
            ? sidequest.cost < 10
            : sidequest.cost >= 10 && sidequest.cost <= 25)

      return matchesWhere && matchesTime && matchesBudget
    })

    if (matches.length === 0) {
      setSuggestion('No sidequests match those filters yet. Try a different combination.')
      return
    }

    const index = Math.floor(Math.random() * matches.length)
    setSuggestion(matches[index].name)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <WhereButton
          value={selectedFilters.where}
          onChange={(where) => {
            setSelectedFilters((currentFilters) => ({ ...currentFilters, where }))
            setSuggestion('')
          }}
        />
        <TimeButton
          value={selectedFilters.time}
          onChange={(time) => {
            setSelectedFilters((currentFilters) => ({ ...currentFilters, time }))
            setSuggestion('')
          }}
        />
        <BudgetButton
          value={selectedFilters.budget}
          onChange={(budget) => {
            setSelectedFilters((currentFilters) => ({ ...currentFilters, budget }))
            setSuggestion('')
          }}
        />
      </div>
      <SidequestMeButton onClick={generateSidequest} />
      {suggestion && (
        <p
          aria-live="polite"
          className="rounded-lg border p-4 font-medium"
          style={{
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            color: colors.foreground,
          }}
        >
          {suggestion}
        </p>
      )}
    </div>
  )
}

export default QuestFilterButtons
