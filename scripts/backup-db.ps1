$ErrorActionPreference = "Stop"

if (-not $env:DB_HOST -or -not $env:DB_PORT -or -not $env:DB_USER -or -not $env:DB_PASSWORD -or -not $env:DB_NAME) {
  throw "DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME must be set."
}

$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { ".\\backups" }
$retentionDays = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 14 }
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupFile = Join-Path $backupDir "cmms-$timestamp.dump"

$env:PGPASSWORD = $env:DB_PASSWORD
pg_dump -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME --format=custom --file $backupFile

$outputFile = $backupFile
if ($env:BACKUP_ENCRYPTION_PASSPHRASE) {
  $salt = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($salt)
  $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($env:BACKUP_ENCRYPTION_PASSPHRASE, $salt, 100000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Key = $derive.GetBytes(32)
  $aes.GenerateIV()
  $encryptor = $aes.CreateEncryptor()
  $plainBytes = [System.IO.File]::ReadAllBytes($backupFile)
  $cipherBytes = $encryptor.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
  $encryptedFile = "$backupFile.enc"
  [System.IO.File]::WriteAllBytes($encryptedFile, $salt + $aes.IV + $cipherBytes)
  Remove-Item -Force $backupFile
  $outputFile = $encryptedFile
}

Get-ChildItem -Path $backupDir -Include "cmms-*.dump","cmms-*.dump.enc" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$retentionDays) } | Remove-Item -Force
Write-Host "Backup written to $outputFile"
