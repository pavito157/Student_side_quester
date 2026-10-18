const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim()

if (!apiBaseUrl) {
  console.error('Set VITE_API_BASE_URL to the Tailscale HTTPS API URL before deploying.')
  process.exit(1)
}

let parsedUrl
try {
  parsedUrl = new URL(apiBaseUrl)
} catch {
  console.error('VITE_API_BASE_URL must be a valid HTTPS URL.')
  process.exit(1)
}

if (
  parsedUrl.protocol !== 'https:'
  || !parsedUrl.hostname
  || parsedUrl.username
  || parsedUrl.password
  || parsedUrl.search
  || parsedUrl.hash
) {
  console.error('VITE_API_BASE_URL must be an HTTPS API base URL without credentials, query, or fragment.')
  process.exit(1)
}
