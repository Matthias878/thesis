param(
    [string]$CpuMaxPrime = $(if ($env:CPU_MAX_PRIME) { $env:CPU_MAX_PRIME } else { "20000" }),
    [switch]$SkipPlaywright
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

# use with:
#   powershell -ExecutionPolicy Bypass -File .\testtool.ps1
# or:
#   powershell -ExecutionPolicy Bypass -File .\testtool.ps1 -SkipPlaywright

$RootDir          = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResultsDir       = Join-Path $RootDir "Frontend\tests\results"
$InputJson        = Join-Path $ResultsDir "automatic_testResults.json"
$AnalyzerHostPath = Join-Path $RootDir "Frontend\tests\data_analyzer.py"

$SysbenchImage = "severalnines/sysbench"
$PythonImage   = "python:3.11-slim"

# memory log output
$MemoryLogJsonl = Join-Path $ResultsDir "container_memory_usage.jsonl"
$MemoryPollSeconds = 2

Set-Location $RootDir

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Extract-SysbenchValue([string]$Text, [string]$Pattern) {
    $match = [regex]::Match($Text, $Pattern)
    if ($match.Success) {
        return $match.Groups[1].Value.Trim()
    }
    return ""
}

function Invoke-DockerCapture {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $tempOut = [System.IO.Path]::GetTempFileName()
    $tempErr = [System.IO.Path]::GetTempFileName()

    try {
        $process = Start-Process -FilePath "docker" `
            -ArgumentList $Arguments `
            -NoNewWindow `
            -Wait `
            -PassThru `
            -RedirectStandardOutput $tempOut `
            -RedirectStandardError $tempErr

        $stdoutLines = @()
        if (Test-Path -LiteralPath $tempOut) {
            $stdoutLines = Get-Content -LiteralPath $tempOut -ErrorAction SilentlyContinue
        }

        $stderrLines = @()
        if (Test-Path -LiteralPath $tempErr) {
            $stderrLines = Get-Content -LiteralPath $tempErr -ErrorAction SilentlyContinue
        }

        $filteredErr = @(
            $stderrLines | Where-Object {
                $_ -and
                $_.Trim() -ne "" -and
                $_ -notmatch '^\s*mesg:\s*ttyname failed:'
            }
        )

        $combined = @()
        if ($stdoutLines) { $combined += $stdoutLines }
        if ($filteredErr) { $combined += $filteredErr }

        [pscustomobject]@{
            ExitCode = $process.ExitCode
            Output   = ($combined -join "`n").Trim()
            StdOut   = ($stdoutLines -join "`n").Trim()
            StdErr   = ($filteredErr -join "`n").Trim()
        }
    }
    finally {
        Remove-Item -LiteralPath $tempOut -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $tempErr -ErrorAction SilentlyContinue
    }
}

function Invoke-DockerOrThrow {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    $result = Invoke-DockerCapture -Arguments $Arguments
    if ($result.Output) {
        Write-Host $result.Output
    }
    if ($result.ExitCode -ne 0) {
        throw "$FailureMessage`n$($result.Output)"
    }
    return $result
}

function Ensure-DockerImage([string]$ImageName) {
    Write-Host "==> Ensuring image exists: $ImageName"

    $inspect = Invoke-DockerCapture -Arguments @("image", "inspect", $ImageName)
    if ($inspect.ExitCode -eq 0) {
        return
    }

    $pull = Invoke-DockerCapture -Arguments @("pull", $ImageName)
    if ($pull.Output) {
        Write-Host $pull.Output
    }
    if ($pull.ExitCode -ne 0) {
        throw "Failed to pull image '$ImageName'.`n$($pull.Output)"
    }
}

function Get-DockerMountPath([string]$WindowsPath) {
    $fullPath = [System.IO.Path]::GetFullPath($WindowsPath)
    $normalized = $fullPath -replace '\\', '/'

    if ($normalized -match '^([A-Za-z]):/(.*)$') {
        $drive = $matches[1].ToLower()
        $rest  = $matches[2]
        return "/$drive/$rest"
    }

    return $normalized
}

function Start-DockerMemoryLogger {
    param(
        [Parameter(Mandatory = $true)]
        [string]$OutputPath,

        [int]$PollSeconds = 2
    )

    if (Test-Path -LiteralPath $OutputPath) {
        Remove-Item -LiteralPath $OutputPath -Force
    }

    New-Item -ItemType File -Path $OutputPath -Force | Out-Null

    $job = Start-Job -ArgumentList $OutputPath, $PollSeconds -ScriptBlock {
        param($LogPath, $IntervalSeconds)

        while ($true) {
            $timestamp = (Get-Date).ToString("o")

            $lines = & docker stats --no-stream --format "{{ json . }}" 2>$null

            foreach ($line in $lines) {
                if (-not $line -or $line.Trim() -eq "") {
                    continue
                }

                try {
                    $stat = $line | ConvertFrom-Json

                    $entry = [pscustomobject]@{
                        timestamp   = $timestamp
                        container   = $stat.Name
                        id          = $stat.ID
                        memoryUsage = $stat.MemUsage
                        memoryPercent = $stat.MemPerc
                        cpuPercent  = $stat.CPUPerc
                        netIO       = $stat.NetIO
                        blockIO     = $stat.BlockIO
                        pids        = $stat.PIDs
                    }

                    $entry | ConvertTo-Json -Compress | Add-Content -LiteralPath $LogPath
                }
                catch {
                    $fallback = [pscustomobject]@{
                        timestamp = $timestamp
                        raw       = $line
                        parseError = $_.Exception.Message
                    }

                    $fallback | ConvertTo-Json -Compress | Add-Content -LiteralPath $LogPath
                }
            }

            Start-Sleep -Seconds $IntervalSeconds
        }
    }

    return $job
}

function Stop-DockerMemoryLogger {
    param(
        [Parameter(Mandatory = $false)]
        $Job
    )

    if ($null -ne $Job) {
        try {
            Stop-Job -Job $Job -ErrorAction SilentlyContinue | Out-Null
        }
        finally {
            Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue | Out-Null
        }
    }
}

Require-Command "docker"
Ensure-Directory $ResultsDir

if (-not (Test-Path -LiteralPath $AnalyzerHostPath)) {
    throw "Analyzer script not found: $AnalyzerHostPath"
}

Write-Host "==> Checking Docker availability"
$dockerVersion = Invoke-DockerCapture -Arguments @("version", "--format", "{{.Server.Version}}")
if ($dockerVersion.ExitCode -ne 0) {
    throw "Docker does not seem to be running or accessible.`n$($dockerVersion.Output)"
}

Ensure-DockerImage $PythonImage
Ensure-DockerImage $SysbenchImage

Write-Host "==> Checking frontend_test container"
$frontendTestExists = Invoke-DockerCapture -Arguments @("ps", "-a", "--format", "{{.Names}}")
if ($frontendTestExists.ExitCode -ne 0) {
    throw "Failed to query Docker containers.`n$($frontendTestExists.Output)"
}
if (-not (($frontendTestExists.StdOut -split '\r?\n') -contains "frontend_test")) {
    throw "Container 'frontend_test' not found. Start it first with: docker compose --profile test up -d frontend_test"
}

$frontendTestRunning = Invoke-DockerCapture -Arguments @("ps", "--format", "{{.Names}}")
if ($frontendTestRunning.ExitCode -ne 0) {
    throw "Failed to query running Docker containers.`n$($frontendTestRunning.Output)"
}
if (-not (($frontendTestRunning.StdOut -split '\r?\n') -contains "frontend_test")) {
    throw "Container 'frontend_test' is not running. Start it with: docker compose --profile test up -d frontend_test"
}

$memoryLoggerJob = $null

try {
    Write-Host "==> Starting Docker memory logger"
    $memoryLoggerJob = Start-DockerMemoryLogger -OutputPath $MemoryLogJsonl -PollSeconds $MemoryPollSeconds
    Write-Host "Memory log: $MemoryLogJsonl"

    if (-not $SkipPlaywright) {
        Write-Host "==> Running Playwright test"
        $playwrightResult = Invoke-DockerCapture -Arguments @(
            "exec", "frontend_test",
            "npx", "playwright", "test", "bulk-upload.spec.js", "--config=playwright.config.js"
        )
        if ($playwrightResult.Output) {
            Write-Host $playwrightResult.Output
        }
        if ($playwrightResult.ExitCode -ne 0) {
            throw "Playwright test failed.`n$($playwrightResult.Output)"
        }
    } else {
        Write-Host "==> Skipping Playwright test"
    }

    if (-not (Test-Path -LiteralPath $InputJson)) {
        throw "Expected result JSON file not found: $InputJson"
    }

    $FrontendTestsHostPath = Join-Path $RootDir "Frontend\tests"
    $FrontendTestsDockerPath = Get-DockerMountPath $FrontendTestsHostPath

    Write-Host "==> Analyzing result JSON in Docker Python"
    $analyzerResult = Invoke-DockerCapture -Arguments @(
        "run", "--rm",
        "-v", "${FrontendTestsDockerPath}:/tests",
        $PythonImage,
        "python", "/tests/data_analyzer.py",
        "/tests/results/automatic_testResults.json",
        "/tests/results/container_memory_usage.jsonl"
    )

    if ($analyzerResult.Output) {
        Write-Host $analyzerResult.Output
    }

    if ($analyzerResult.ExitCode -ne 0) {
        throw "Analyzer failed.`n$($analyzerResult.Output)"
    }

    $BaseName   = [System.IO.Path]::GetFileNameWithoutExtension($InputJson)
    $BaseDir    = [System.IO.Path]::GetDirectoryName($InputJson)
    $SummaryTxt = Join-Path $BaseDir "${BaseName}_summary.txt"

    if (-not (Test-Path -LiteralPath $SummaryTxt)) {
        throw "Expected summary file not found after analyzer run: $SummaryTxt"
    }

    Write-Host "==> Running sysbench single-core"
    $singleResult = Invoke-DockerCapture -Arguments @(
        "run", "--rm",
        "--entrypoint", "sysbench",
        "--cpuset-cpus=0",
        $SysbenchImage,
        "cpu", "--cpu-max-prime=$CpuMaxPrime", "--threads=1", "run"
    )

    if ($singleResult.Output) {
        Write-Host $singleResult.Output
    }
    if ($singleResult.ExitCode -ne 0) {
        throw "Sysbench single-core failed.`n$($singleResult.Output)"
    }
    $singleOutput = $singleResult.Output

    Write-Host "==> Detecting CPU thread count"
    $totalThreadsResult = Invoke-DockerCapture -Arguments @(
        "run", "--rm",
        "--entrypoint", "sh",
        $SysbenchImage,
        "-c", "nproc"
    )

    if ($totalThreadsResult.Output) {
        Write-Host $totalThreadsResult.Output
    }
    if ($totalThreadsResult.ExitCode -ne 0) {
        throw "Could not detect CPU thread count.`n$($totalThreadsResult.Output)"
    }

    $totalThreadsRaw = $totalThreadsResult.Output
    $totalThreads = ($totalThreadsRaw -split '\r?\n' | Where-Object { $_.Trim() -match '^\d+$' } | Select-Object -Last 1).Trim()

    if (-not $totalThreads) {
        throw "Could not parse CPU thread count from:`n$totalThreadsRaw"
    }

    Write-Host "==> Running sysbench total CPU with $totalThreads threads"
    $totalResult = Invoke-DockerCapture -Arguments @(
        "run", "--rm",
        "--entrypoint", "sysbench",
        $SysbenchImage,
        "cpu", "--cpu-max-prime=$CpuMaxPrime", "--threads=$totalThreads", "run"
    )

    if ($totalResult.Output) {
        Write-Host $totalResult.Output
    }
    if ($totalResult.ExitCode -ne 0) {
        throw "Sysbench total CPU failed.`n$($totalResult.Output)"
    }
    $totalOutput = $totalResult.Output

    $singleEps        = Extract-SysbenchValue $singleOutput '(?m)^\s*events per second:\s*([^\r\n]+)$'
    $singleTotalTime  = Extract-SysbenchValue $singleOutput '(?m)^\s*total time:\s*([^\r\n]+)$'
    $singleLatencyAvg = Extract-SysbenchValue $singleOutput '(?ms)Latency \(ms\):.*?^\s*avg:\s*([^\r\n]+)$'

    $totalEps         = Extract-SysbenchValue $totalOutput '(?m)^\s*events per second:\s*([^\r\n]+)$'
    $totalTotalTime   = Extract-SysbenchValue $totalOutput '(?m)^\s*total time:\s*([^\r\n]+)$'
    $totalLatencyAvg  = Extract-SysbenchValue $totalOutput '(?ms)Latency \(ms\):.*?^\s*avg:\s*([^\r\n]+)$'

    if (-not $singleEps -or -not $singleTotalTime -or -not $singleLatencyAvg) {
        throw "Could not parse sysbench single-core output.`n--- RAW OUTPUT ---`n$singleOutput"
    }

    if (-not $totalEps -or -not $totalTotalTime -or -not $totalLatencyAvg) {
        throw "Could not parse sysbench total CPU output.`n--- RAW OUTPUT ---`n$totalOutput"
    }

    Add-Content -LiteralPath $SummaryTxt -Value ""
    Add-Content -LiteralPath $SummaryTxt -Value "===== SYSBENCH ====="
    Add-Content -LiteralPath $SummaryTxt -Value "single_core threads: 1, cpu_max_prime: $CpuMaxPrime, events/sec: $singleEps, total time: $singleTotalTime, avg latency ms: $singleLatencyAvg"
    Add-Content -LiteralPath $SummaryTxt -Value "total_cpu threads: $totalThreads, cpu_max_prime: $CpuMaxPrime, events/sec: $totalEps, total time: $totalTotalTime, avg latency ms: $totalLatencyAvg"
    Add-Content -LiteralPath $SummaryTxt -Value ""
    Add-Content -LiteralPath $SummaryTxt -Value "memory_log_jsonl: $MemoryLogJsonl"

    Write-Host "==> Done"
    Write-Host "Summary: $SummaryTxt"
    Write-Host "Memory log: $MemoryLogJsonl"
}
finally {
    Write-Host "==> Stopping Docker memory logger"
    Stop-DockerMemoryLogger -Job $memoryLoggerJob
}