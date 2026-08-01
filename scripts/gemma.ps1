# Padanan PowerShell dari snippet curl resmi hackathon.
# Dipakai untuk verifikasi cepat bahwa akun/project punya akses ke Gemma,
# tanpa lewat kode aplikasi.
#
#   .\scripts\gemma.ps1 -ProjectId "your-project-id" -Prompt "Summer travel plan to Paris"

param(
    [Parameter(Mandatory = $true)][string]$ProjectId,
    [string]$Prompt = "Summer travel plan to Paris",
    [string]$Region = "global",
    [string]$Endpoint = "aiplatform.googleapis.com",
    [string]$Model = "google/gemma-4-26b-a4b-it-maas",
    [int]$MaxTokens = 8192
)

$ErrorActionPreference = "Stop"

$token = $env:GOOGLE_ACCESS_TOKEN
if (-not $token) {
    if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
        throw "gcloud tidak ditemukan dan GOOGLE_ACCESS_TOKEN belum di-set."
    }
    $token = (gcloud auth print-access-token).Trim()
}

$uri = "https://$Endpoint/v1/projects/$ProjectId/locations/$Region/endpoints/openapi/chat/completions"

$body = @{
    model      = $Model
    stream     = $false
    max_tokens = $MaxTokens
    messages   = @(@{ role = "user"; content = $Prompt })
    chat_template_kwargs = @{ enable_thinking = $true }
} | ConvertTo-Json -Depth 6

$response = Invoke-RestMethod -Method Post -Uri $uri -Body $body `
    -ContentType "application/json" `
    -Headers @{ Authorization = "Bearer $token" }

$response.choices[0].message.content
