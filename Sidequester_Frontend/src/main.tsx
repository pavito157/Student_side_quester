import { ClerkProvider } from '@clerk/clerk-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import AmbientScene from './components/decor/AmbientScene'
import FirebaseSessionBridge from './auth/FirebaseSessionBridge'
import './index.css'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to .env.local.')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AmbientScene />
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <FirebaseSessionBridge>
        <App />
      </FirebaseSessionBridge>
    </ClerkProvider>
  </StrictMode>,
)
