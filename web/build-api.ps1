$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$bash = 'C:\msys64\usr\bin\bash.exe'
if (!(Test-Path $bash)) {
  throw 'MSYS2 bash not found at C:\msys64\usr\bin\bash.exe'
}

# Convert current Windows root path to MSYS style and escape single quotes for bash.
$msysRoot = ($root -replace '\\', '/') -replace '^([A-Za-z]):', '/$1'
$msysRoot = $msysRoot -replace "'", "'\\''"

& C:\msys64\usr\bin\env.exe MSYSTEM=UCRT64 CHERE_INVOKING=1 $bash -lc "export PATH=/ucrt64/bin:/usr/bin:\$PATH; cd '$msysRoot'; qmake-qt5 TexasSolverApi.pro -o Makefile.api; mingw32-make -f Makefile.api -j8"
Write-Host 'api.dll built at release/api.dll'
