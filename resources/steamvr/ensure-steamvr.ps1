param([Parameter(Mandatory=$true)][string]$OpenVrDll, [switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
# Load the installed runtime dynamically: paths are arguments, never C# source.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class VrccOpenVr {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern IntPtr LoadLibraryW(string path);
    [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true)]
    private static extern IntPtr GetProcAddress(IntPtr module, string name);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate uint Init(ref int error, int applicationType);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate void Shutdown();
    private static Init initialize;
    private static Shutdown shutdown;
    public static void Load(string path) {
        IntPtr module = LoadLibraryW(path);
        if (module == IntPtr.Zero) throw new Exception("Cannot load installed OpenVR runtime");
        initialize = (Init)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module, "VR_InitInternal"), typeof(Init));
        shutdown = (Shutdown)Marshal.GetDelegateForFunctionPointer(GetProcAddress(module, "VR_ShutdownInternal"), typeof(Shutdown));
    }
    public static bool Ready() {
        int error = 0;
        uint token = initialize(ref error, 3); // VRApplication_Background must not start or keep SteamVR running.
        if (error != 0 || token == 0) return false;
        shutdown();
        return true;
    }
}
'@
if ($ValidateOnly) { exit 0 }
[VrccOpenVr]::Load([System.IO.Path]::GetFullPath($OpenVrDll))
if ([VrccOpenVr]::Ready()) {
    Write-Output 'VRCC_STEAMVR_READY'
    exit 0
}
# One fixed URI. Never run commands or arguments from an imported manifest.
# If another launch is already in progress, wait instead of issuing a second request.
$running = @(Get-Process -Name @('vrserver', 'vrmonitor', 'vrstartup') -ErrorAction SilentlyContinue)
if ($running.Count -eq 0) {
    Start-Process 'steam://run/250820'
}
$deadline = [DateTime]::UtcNow.AddSeconds(45)
do {
    Start-Sleep -Milliseconds 1000
    if ([VrccOpenVr]::Ready()) {
        Write-Output 'VRCC_STEAMVR_READY'
        exit 0
    }
} while ([DateTime]::UtcNow -lt $deadline)
Write-Error 'SteamVR did not become ready within 45 seconds. Check its window and headset connection.'
exit 1
