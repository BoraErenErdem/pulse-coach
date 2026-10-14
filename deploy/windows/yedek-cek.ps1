# Sunucudaki veritabanı yedeklerini bu bilgisayara çeker (deploy/README.md "Yedekleme").
# Görev Zamanlayıcı her gün çalıştırır; elle de çalışır:
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy\windows\yedek-cek.ps1
# Sunucuda yedek anahtarı yalnız "list" ve "get <ad>" çalıştırabilir
# (deploy/cloudvist/yedek-ver.sh). Eksik dökümler indirilir, boyutu ve pg_dump
# imzası tutarsa yerine konur; adındaki tarihe göre $Gun günden eskiler silinir.
param(
    [string]$Sunucu = 'pulsecoach-yedek',   # ~/.ssh/config'teki Host
    [string]$Hedef = 'C:\pulsecoach-yedek',
    [int]$Gun = 30,
    [string]$Ssh = "$env:SystemRoot\System32\OpenSSH\ssh.exe"
)
$ErrorActionPreference = 'Stop'
$adKalibi = '^pulsecoach_(\d{8}_\d{6})_\d{6}\.dump$'

New-Item -ItemType Directory -Force $Hedef | Out-Null
$kayit = Join-Path $Hedef 'yedek-cek.log'
function Yaz([string]$mesaj) {
    Add-Content -Path $kayit -Encoding UTF8 -Value ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $mesaj)
}

# ssh'ı çalıştırıp stdout'u bayt olarak dosyaya ya da belleğe alır
# (PowerShell 5.1'in > yönlendirmesi ikili veriyi metne çevirip bozar).
function Ssh-Calistir([string]$komut, [System.IO.Stream]$cikis) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo $Ssh
    $psi.Arguments = "-o BatchMode=yes -o ConnectTimeout=30 $Sunucu $komut"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $hata = $p.StandardError.ReadToEndAsync()
    $p.StandardOutput.BaseStream.CopyTo($cikis)
    $p.WaitForExit()
    if ($p.ExitCode -ne 0) { throw "ssh '$komut' kod $($p.ExitCode): $($hata.Result.Trim())" }
}

# Dosya adındaki UTC zaman damgası; ad yedek adı değilse $null.
function Ad-Tarihi([string]$ad) {
    $m = [regex]::Match($ad, $adKalibi)
    if (-not $m.Success) { return $null }
    [datetime]::ParseExact($m.Groups[1].Value, 'yyyyMMdd_HHmmss', $null, 'AssumeUniversal')
}

try {
    $liste = New-Object System.IO.MemoryStream
    Ssh-Calistir 'list' $liste
    $satirlar = [System.Text.Encoding]::UTF8.GetString($liste.ToArray()) -split "`n" | Where-Object { $_.Trim() }

    $yeni = 0
    $hatali = 0
    foreach ($satir in $satirlar) {
        $ad, $boyut = $satir.Trim() -split ' '
        $tarih = Ad-Tarihi $ad
        if ($null -eq $tarih -or $boyut -notmatch '^\d+$') { throw "beklenmeyen liste satırı: $satir" }
        $dosya = Join-Path $Hedef $ad
        if (Test-Path $dosya) { continue }
        if ($tarih -lt (Get-Date).AddDays(-$Gun)) { continue }

        # Bir dökümdeki sorun diğerlerini ve eski yedek temizliğini durdurmaz.
        $gecici = "$dosya.partial"
        try {
            $akis = [System.IO.File]::Create($gecici)
            try { Ssh-Calistir "get $ad" $akis } finally { $akis.Dispose() }
            $gelen = (Get-Item $gecici).Length
            $imza = Get-Content $gecici -Encoding Byte -TotalCount 5
            $imza = if ($imza) { [System.Text.Encoding]::ASCII.GetString([byte[]]$imza) } else { '' }
            if ($gelen -ne [int64]$boyut -or $imza -ne 'PGDMP') {
                throw "bozuk indi ($gelen / $boyut bayt, imza '$imza')"
            }
            Move-Item $gecici $dosya
            (Get-Item $dosya).LastWriteTime = $tarih
            Yaz "indirildi: $ad ($gelen bayt)"
            $yeni++
        } catch {
            Remove-Item $gecici -ErrorAction SilentlyContinue
            Yaz "HATA: $ad - $($_.Exception.Message)"
            $hatali++
        }
    }

    $sinir = (Get-Date).AddDays(-$Gun)
    Get-ChildItem $Hedef -File | ForEach-Object {
        if ($_.Name -like '*.partial') { Remove-Item $_.FullName; return }
        $tarih = Ad-Tarihi $_.Name
        if ($null -ne $tarih -and $tarih -lt $sinir) { Remove-Item $_.FullName; Yaz "silindi (>$Gun gün): $($_.Name)" }
    }
    Yaz "bitti: $yeni yeni, $hatali hatalı, sunucuda $(@($satirlar).Count) yedek"
    if ($hatali) { exit 1 }
} catch {
    Yaz "HATA: $($_.Exception.Message)"
    exit 1
}
