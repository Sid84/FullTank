# ===== React Native Clean Rebuild (Windows/Android) =====
# Usage: Right‑click PowerShell -> Run as Admin (optional), then:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\clean-rebuild.ps1

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Killing stray processes..."
taskkill /F /IM node.exe /T | Out-Null
taskkill /F /IM gradle* /T   | Out-Null
adb kill-server 2>$null

Write-Host "Removing node_modules & lockfiles..."
npx rimraf node_modules
Remove-Item -Force package-lock.json
Remove-Item -Force yarn.lock
Remove-Item -Force pnpm-lock.yaml

Write-Host "Clearing Metro/haste caches..."
npx rimraf "$env:LOCALAPPDATA\Temp\metro-cache"
npx rimraf "$env:LOCALAPPDATA\Temp\haste-map*"

Write-Host "Cleaning Android builds..."
npx rimraf android\app\build
npx rimraf android\build
npx rimraf android\.gradle

Write-Host "Purging Gradle cache (will re-download)..."
npx rimraf "$env:USERPROFILE\.gradle\caches"

Write-Host "Optional RN CLI cache..."
npx rimraf "$env:USERPROFILE\.cache\react-native"

Write-Host "Installing dependencies (npm ci preferred)..."
if (Test-Path "package-lock.json") {
  npm ci
} else {
  npm install
}

Write-Host "Gradle clean..."
pushd android
./gradlew clean
popd

Write-Host "Starting Metro (reset cache) in a new window..."
Start-Process powershell -ArgumentList "npx react-native start --reset-cache"

Write-Host "Building & running on Android..."
npx react-native run-android

Write-Host "✅ Done."
