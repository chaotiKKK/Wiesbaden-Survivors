$ErrorActionPreference = 'Stop'

$appName = 'Wiesbaden Survivors'
$processName = 'WiesbadenSurvivors'
$exeName = 'WiesbadenSurvivors.exe'
$sourceExe = Join-Path $PSScriptRoot $exeName

function Save-Shortcut {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    $parent = [System.IO.Path]::GetDirectoryName($Path)
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $TargetPath
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.IconLocation = "$TargetPath,0"
    $shortcut.Description = $appName
    $shortcut.Save()
}

try {
    if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) {
        throw "$exeName wurde neben diesem Installer nicht gefunden."
    }

    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
    $desktop = [Environment]::GetFolderPath('Desktop')
    $programs = [Environment]::GetFolderPath('Programs')

    if ([string]::IsNullOrWhiteSpace($localAppData)) {
        throw "Der LocalAppData-Ordner konnte nicht ermittelt werden."
    }
    if ([string]::IsNullOrWhiteSpace($desktop) -or -not (Test-Path -LiteralPath $desktop -PathType Container)) {
        throw "Der Desktop-Ordner konnte nicht ermittelt werden."
    }
    if ([string]::IsNullOrWhiteSpace($programs)) {
        throw "Der Startmenue-Ordner konnte nicht ermittelt werden."
    }

    $installDir = Join-Path (Join-Path $localAppData 'Programs') $appName
    $installedExe = Join-Path $installDir $exeName
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null

    $sourcePath = [System.IO.Path]::GetFullPath($sourceExe)
    $installedPath = [System.IO.Path]::GetFullPath($installedExe)
    if (-not [string]::Equals($sourcePath, $installedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $running = Get-Process -Name $processName -ErrorAction SilentlyContinue
        if ($running) {
            throw "Wiesbaden Survivors laeuft noch. Bitte das Spiel schliessen und den Installer erneut starten."
        }
        Copy-Item -LiteralPath $sourceExe -Destination $installedExe -Force
    }

    $shell = New-Object -ComObject WScript.Shell
    $desktopShortcut = Join-Path $desktop "$appName.lnk"
    $startMenuShortcut = Join-Path $programs "$appName.lnk"

    Save-Shortcut -Path $desktopShortcut -TargetPath $installedExe -WorkingDirectory $installDir
    Save-Shortcut -Path $startMenuShortcut -TargetPath $installedExe -WorkingDirectory $installDir

    Write-Host ""
    Write-Host "Wiesbaden Survivors wurde installiert."
    Write-Host "Programm:   $installedExe"
    Write-Host "Desktop:    $desktopShortcut"
    Write-Host "Startmenue: $startMenuShortcut"
} catch {
    Write-Host ""
    Write-Host "Installation fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

exit 0
