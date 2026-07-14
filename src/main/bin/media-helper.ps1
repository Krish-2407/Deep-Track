param (
    [string]$Action = "status",
    [int]$Level = 50
)

# Deep Track Media Helper
# Queries Windows System Media Transport Controls (SMTC) for active media session.
# Works with: Spotify, Chrome (YouTube, Netflix, etc.), Edge, Firefox, and any
# app that registers with Windows SMTC (shown in the Windows volume flyout).

if ($Action -eq "status") {
    Write-Host "Media Helper Active"
    exit
}

if ($Action -eq "metadata") {
    $ErrorActionPreference = 'Stop'
    try {
        # Load Windows Runtime extension assembly for async-to-task bridging
        [void][System.Reflection.Assembly]::Load("System.Runtime.WindowsRuntime, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089")

        # Load WinRT type proxies — ContentType=WindowsRuntime tells PowerShell these
        # are WinRT types, not standard .NET types.
        [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
        [void][Windows.Foundation.IAsyncOperation`1, Windows.Foundation, ContentType=WindowsRuntime]

        # Helper: bridge a WinRT IAsyncOperation to a .NET Task and block for result.
        # PowerShell 5.1 cannot directly await WinRT async operations; we resolve the
        # AsTask<T>() extension method dynamically from System.WindowsRuntimeSystemExtensions.
        function Await-WinRT {
            param($asyncOperation, $resultType)
            $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
                Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Length -eq 1 -and $_.IsGenericMethod } |
                Select-Object -First 1
            $genericMethod = $method.MakeGenericMethod($resultType)
            $task = $genericMethod.Invoke($null, @($asyncOperation))
            return $task.GetType().GetProperty("Result").GetValue($task)
        }

        # Step 1: Get the global session manager
        $mgrOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
        $mgr = Await-WinRT $mgrOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

        # Step 2: Get the current (foreground/priority) media session
        $session = $mgr.GetCurrentSession()
        if ($null -eq $session) {
            # No active media session on the system (nothing playing or paused)
            Write-Output "{}"
            exit
        }

        # Step 3: Fetch media properties (title, artist, album, etc.)
        $propsOp = $session.TryGetMediaPropertiesAsync()
        $mediaPropsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
        $props = Await-WinRT $propsOp $mediaPropsType

        # Step 4: Fetch playback info (Playing / Paused / Stopped)
        $playback = $session.GetPlaybackInfo()

        # Safely escape strings for valid JSON (handles backslashes, quotes, control chars)
        function Escape-Json {
            param([string]$str)
            if ([string]::IsNullOrEmpty($str)) { return "" }
            return $str.Replace('\', '\\').Replace('"', '\"').Replace("`n", '\n').Replace("`r", '')
        }

        $title  = Escape-Json $props.Title
        $artist = Escape-Json $props.Artist
        $album  = Escape-Json $props.AlbumTitle
        $status = if ($null -ne $playback -and $null -ne $playback.PlaybackStatus) {
            $playback.PlaybackStatus.ToString()
        } else { "Unknown" }

        Write-Output "{""title"":""$title"",""artist"":""$artist"",""album"":""$album"",""status"":""$status""}"

    } catch {
        # Any failure (no WinRT support, permissions, etc.) — return empty object
        # so the frontend gracefully falls back to "No media playing"
        Write-Output "{}"
    }
}
