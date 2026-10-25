# NAS Admin - push ke GitHub + deploy pertama ke TrueNAS + setup CI/CD
# Jalankan dari PowerShell:
#   cd F:\Project\WebSite\nas-admin
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-setup.ps1

$ErrorActionPreference = 'Stop'
$Repo   = 'adhipramanax/nas-admin'
$Remote = "https://github.com/$Repo.git"
$SshKey = "$env:USERPROFILE\.ssh\truenas_deploy"
$Nas    = 'root@192.168.110.10'

Set-Location (Split-Path $PSScriptRoot -Parent)
Write-Host "`n==== 1. Git: commit & push ke $Remote ====" -ForegroundColor Cyan
if (Test-Path '_to_delete') { Remove-Item '_to_delete' -Recurse -Force }
if (-not (Test-Path '.git')) { git init -b master | Out-Null }
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m "NAS Admin: dashboard dokumentasi NAS + AI agent + CI/CD" | Out-Null }
$hasOrigin = (git remote) -contains 'origin'
if (-not $hasOrigin) { git remote add origin $Remote }
git branch -M master
git push -u origin master
if ($LASTEXITCODE -ne 0) { throw 'git push gagal' }

Write-Host "`n==== 2. Token runner GitHub Actions ====" -ForegroundColor Cyan
$token = ''
if (Get-Command gh -ErrorAction SilentlyContinue) {
  try { $token = gh api -X POST "repos/$Repo/actions/runners/registration-token" --jq .token 2>$null } catch { $token = '' }
}
if (-not $token) {
  Write-Host "Buka: https://github.com/$Repo/settings/actions/runners/new"
  Write-Host "Salin nilai setelah '--token' pada perintah ./config.sh (berlaku 1 jam)."
  $token = Read-Host 'Tempel token runner (Enter untuk lewati CI/CD)'
}

Write-Host "`n==== 3. Setup di TrueNAS via SSH ====" -ForegroundColor Cyan
$script = (Get-Content 'scripts\nas-setup.sh' -Raw) -replace "`r", ''
$script | ssh -i $SshKey -o StrictHostKeyChecking=accept-new $Nas "bash -s -- $token"
if ($LASTEXITCODE -ne 0) { throw 'Setup di NAS gagal - lihat pesan di atas' }

Write-Host "`nSelesai. Buka http://192.168.110.10:8002" -ForegroundColor Green
Write-Host "Cek CI/CD: https://github.com/$Repo/actions"
