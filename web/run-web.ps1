param(
  [string]$HostName = '127.0.0.1',
  [int]$Port = 8080
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
python .\web\backend.py $HostName $Port
