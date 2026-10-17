import Button from './componenets/Button'

function App() {

  return (
    <>
      <div>
        <text>
          Sidequester
        </text>
        <Button onClick={() => console.log('Button clicked!')}>
          Click Me
        </Button>
      </div>
    </>
  )
}

export default App
