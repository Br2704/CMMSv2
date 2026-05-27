$ErrorActionPreference = "Continue"

try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3001/api/auth/login' -Method Post -Body (@{email='admin@tamoptix.tech';password='JKFenner@123'} | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing
    Write-Host "LOGIN OK"
    Write-Host $resp.Content
} catch {
    Write-Host "STATUS: $($_.Exception.Response.StatusCode)"
    $raw = $_.Exception.Response.GetResponseStream()
    $rdr = New-Object System.IO.StreamReader($raw)
    $text = $rdr.ReadToEnd()
    $rdr.Close()
    Write-Host "RAW TEXT: $text"
    
    $json = $text | ConvertFrom-Json
    Write-Host "Parsed:"
    Write-Host "  details.captcha.question = $($json.details.captcha.question)"
    Write-Host "  details.captcha.token = $($json.details.captcha.token)"
}
