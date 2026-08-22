$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

Add-Type @"
using System.Runtime.InteropServices;

public static class GdKeys {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);

  public static bool CtrlB() {
    bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
    bool b = (GetAsyncKeyState(0x42) & 0x8000) != 0;
    return ctrl && b && !((GetAsyncKeyState(0x10) & 0x8000) != 0);
  }

  public static bool CtrlShiftS() {
    bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
    bool shift = (GetAsyncKeyState(0x10) & 0x8000) != 0;
    bool s = (GetAsyncKeyState(0x53) & 0x8000) != 0;
    return ctrl && shift && s;
  }
}
"@

$editWasDown = $false
$scoutWasDown = $false
while ($true) {
  $editDown = [GdKeys]::CtrlB()
  if ($editDown -and -not $editWasDown) {
    [Console]::WriteLine('EDIT_HOTKEY')
    [Console]::Out.Flush()
  }
  $editWasDown = $editDown

  $scoutDown = [GdKeys]::CtrlShiftS()
  if ($scoutDown -and -not $scoutWasDown) {
    [Console]::WriteLine('SCOUT_HOTKEY')
    [Console]::Out.Flush()
  }
  $scoutWasDown = $scoutDown

  Start-Sleep -Milliseconds 40
}
