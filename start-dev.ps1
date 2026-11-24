# Starts the API and the website, each in its own window.
# Run from the project folder with:
#   powershell -ExecutionPolicy Bypass -File .\start-dev.ps1

$root = $PSScriptRoot

Start-Process powershell -WorkingDirectory "$root\server" `
  -ArgumentList '-NoExit', '-Command', 'npx tsx watch index.ts'

Start-Process powershell -WorkingDirectory "$root\client" `
  -ArgumentList '-NoExit', '-Command', 'npm run dev'

Write-Host 'Started the API (http://localhost:3000) and the website (http://localhost:5173).'
Write-Host 'Close the two new windows to stop them.'