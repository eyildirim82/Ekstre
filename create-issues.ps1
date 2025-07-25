param(
    [string]$File = ".\backlog.json"
)

if (!(Test-Path $File)) {
    Write-Error "backlog.json bulunamadı. -File parametresiyle yol verin."
    exit 1
}

Write-Host "Reading $File ..."
$json = Get-Content $File -Raw | ConvertFrom-Json

foreach ($issue in $json.issues) {
    $title   = $issue.title
    $body    = $issue.body
    $labels  = $issue.labels -join ","

    Write-Host "Creating issue: $title"

    gh issue create `
        --title $title `
        --body  $body `
        --label $labels
}
