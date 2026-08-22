param([int]$GdPid = 0)

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class GdFind {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  public static int ForegroundKind(string gamePidsCsv, int gdPid) {
    var gamePids = new HashSet<uint>();
    foreach (var p in (gamePidsCsv ?? "").Split(',')) {
      uint n;
      if (uint.TryParse(p.Trim(), out n) && n > 0) gamePids.Add(n);
    }
    IntPtr fg = GetForegroundWindow();
    // Exclusive fullscreen often reports no foreground HWND. Keep the HUD only
    // if the game process is alive and no other window is in front.
    if (fg == IntPtr.Zero) return gamePids.Count > 0 ? 1 : 0;
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    if (gamePids.Contains(pid)) return 1;
    var cls = new StringBuilder(256);
    GetClassName(fg, cls, 256);
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    var c = cls.ToString();
    var t = title.ToString();
    bool gameClass = c.IndexOf("RiotWindowClass", StringComparison.OrdinalIgnoreCase) >= 0;
    bool gameTitle = t.IndexOf("League of Legends (TM)", StringComparison.OrdinalIgnoreCase) >= 0;
    if (gameClass && gameTitle) return 1;
    return 0;
  }

  public static string Best(string pidsCsv) {
    var pids = new HashSet<uint>();
    foreach (var p in (pidsCsv ?? "").Split(',')) {
      uint n;
      if (uint.TryParse(p.Trim(), out n) && n > 0) pids.Add(n);
    }
    int bestScore = 0;
    string best = "";
    EnumWindows((h, l) => {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      var title = new StringBuilder(512);
      GetWindowText(h, title, 512);
      var cls = new StringBuilder(256);
      GetClassName(h, cls, 256);
      var t = title.ToString();
      var c = cls.ToString();
      if (t.IndexOf("GD Esports", StringComparison.OrdinalIgnoreCase) >= 0) return true;
      if (t.IndexOf("Rift.lol", StringComparison.OrdinalIgnoreCase) >= 0) return true;
      if (t.IndexOf("RIFT.LOL", StringComparison.OrdinalIgnoreCase) >= 0) return true;
      // Prefer the in-game client, not Riot Client / launcher chrome.
      bool gameClient = t.IndexOf("League of Legends (TM) Client", StringComparison.OrdinalIgnoreCase) >= 0;
      bool gameTitle = gameClient
        || t.IndexOf("League of Legends (TM)", StringComparison.OrdinalIgnoreCase) >= 0;
      bool byClass = c.IndexOf("RiotWindowClass", StringComparison.OrdinalIgnoreCase) >= 0;
      bool byPid = pids.Count > 0 && pids.Contains(pid);
      if (pids.Count > 0) {
        if (!byPid && !gameClient) return true;
      } else if (!gameTitle && !byClass) {
        return true;
      }
      RECT r;
      GetWindowRect(h, out r);
      int w = r.Right - r.Left, hgt = r.Bottom - r.Top;
      if (w < 200 || hgt < 200) return true;
      int score = w * hgt;
      if (IsWindowVisible(h)) score += 50000000;
      if (gameClient) score += 500000000;
      if (byClass && gameTitle) score += 200000000;
      if (byPid) score += 100000000;
      if (score > bestScore) {
        bestScore = score;
        best = r.Left + " " + r.Top + " " + r.Right + " " + r.Bottom;
      }
      return true;
    }, IntPtr.Zero);
    return best;
  }
}
"@

function Emit-Line {
  $gameIds = @(
    Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -eq 'League of Legends' } |
      ForEach-Object { $_.Id }
  ) -join ','

  $running = 0
  if ($gameIds) { $running = 1 }

  $hit = $null
  if ($gameIds) { $hit = [GdFind]::Best($gameIds) }
  if (-not $hit) { $hit = [GdFind]::Best('') }

  $focused = [GdFind]::ForegroundKind($gameIds, $GdPid)

  if ($hit) {
    [Console]::WriteLine("$hit $focused $running")
  } else {
    [Console]::WriteLine("0 0 0 0 $focused $running")
  }
  [Console]::Out.Flush()
}

while ($true) {
  Emit-Line
  Start-Sleep -Milliseconds 300
}
