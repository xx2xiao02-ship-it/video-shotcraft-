param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [System.IO.File]::ReadAllText($InputPath, [System.Text.Encoding]::UTF8).Trim()
if (-not $text) { throw 'B mode TTS input is empty' }
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'zh-CN' } |
    Sort-Object @{Expression = { if ($_.VoiceInfo.Gender -eq 'Male') { 0 } else { 1 } }} | Select-Object -First 1
  if (-not $voice) { throw 'No Chinese offline voice is installed on this Windows machine' }
  $speaker.SelectVoice($voice.VoiceInfo.Name)
  $speaker.SetOutputToWaveFile($OutputPath)
  $speaker.Speak($text)
  Write-Output "Offline voice: $($voice.VoiceInfo.Name)"
} finally {
  $speaker.Dispose()
}
