# Spawns a console-subsystem executable with a REAL console (unlike
# CREATE_NO_WINDOW/windowsHide, which gives the process NO console at all)
# that is immediately hidden. The distinction matters: a process with no
# console forces every console-app CHILD it spawns to allocate its OWN new
# (visible) console, since there's nothing to attach to. A process with a
# real-but-hidden console is what its own children inherit by default, so
# nothing further down the chain (e.g. a Bash-tool child process an agent
# CLI spawns internally) needs a window of its own either.
#
# Usage: powershell -NoProfile -WindowStyle Hidden -File hidden-console-launcher.ps1 <exePath> <arg1> <arg2> ...
# Stdin is relayed to the child's stdin; the child's stdout/stderr are
# relayed back out to this script's own stdout/stderr, byte-for-byte, so a
# caller piping this script exactly like it would pipe the real exe sees no
# difference in behavior — only the window disappears.

$ErrorActionPreference = 'Stop'

$exePath = $args[0]
$exeArgs = $args[1..($args.Length - 1)]

function Quote-Arg([string]$a) {
    if ($a -eq '') { return '""' }
    if ($a -notmatch '[\s"]') { return $a }
    # Win32 CommandLineToArgvW quoting: double any backslashes that
    # immediately precede a quote (or end the string right before the
    # closing quote), then escape the quote itself.
    $escaped = [System.Text.RegularExpressions.Regex]::Replace($a, '(\\*)"', '$1$1\"')
    $escaped = [System.Text.RegularExpressions.Regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exePath
$psi.Arguments = ($exeArgs | ForEach-Object { Quote-Arg $_ }) -join ' '
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $false
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
[void]$proc.Start()

$inStream = [Console]::OpenStandardInput()
$outStream = [Console]::OpenStandardOutput()
$errStream = [Console]::OpenStandardError()

$stdoutCopyTask = $proc.StandardOutput.BaseStream.CopyToAsync($outStream)
$stderrCopyTask = $proc.StandardError.BaseStream.CopyToAsync($errStream)

# Pure .NET Task objects (CopyToAsync, not a PowerShell scriptblock wrapped
# in Task.Run) — these don't need a PowerShell runspace to run on their own
# thread-pool thread, unlike an [Action]{...} scriptblock does, which is
# what the first version of this script got wrong (confirmed live:
# "There is no Runspace available to run scripts in this thread").
# Stdin is written synchronously, on this (runspace-having) thread, before
# touching output — our own stdin payload (a prompt/context string) is well
# within typical OS pipe buffer sizes, so this never blocks waiting on the
# child to drain it while output relay is stalled behind it.
$inStream.CopyTo($proc.StandardInput.BaseStream)
$proc.StandardInput.Close()

$proc.WaitForExit()
try {
    [System.Threading.Tasks.Task]::WaitAll(@($stdoutCopyTask, $stderrCopyTask))
} catch [System.AggregateException] {
    foreach ($e in $_.Exception.InnerExceptions) {
        [Console]::Error.WriteLine("relay task failed: $($e.GetType().FullName): $($e.Message)")
    }
}
$outStream.Flush()
$errStream.Flush()
exit $proc.ExitCode
