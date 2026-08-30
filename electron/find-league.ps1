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

  static HashSet<uint> ParsePids(string csv) {
    var set = new HashSet<uint>();
    foreach (var p in (csv ?? "").Split(',')) {
      uint n;
      if (uint.TryParse(p.Trim(), out n) && n > 0) set.Add(n);
    }
    return set;
  }

  // 0 = not game, 1 = LoL or unknown game focused, 2 = TFT focused
  public static int ForegroundKind(string lolPidsCsv, string tftPidsCsv) {
    var lolPids = ParsePids(lolPidsCsv);
    var tftPids = ParsePids(tftPidsCsv);
    IntPtr fg = GetForegroundWindow();
    if (fg == IntPtr.Zero) return 0;
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    if (tftPids.Contains(pid)) return 2;
    if (lolPids.Contains(pid)) return 1;
    var cls = new StringBuilder(256);
    GetClassName(fg, cls, 256);
    var title = new StringBuilder(512);
    GetWindowText(fg, title, 512);
    var c = cls.ToString();
    var t = title.ToString();
    bool gameClass = c.IndexOf("RiotWindowClass", StringComparison.OrdinalIgnoreCase) >= 0;
    bool gameTitle = t.IndexOf("League of Legends (TM)", StringComparison.OrdinalIgnoreCase) >= 0;
    bool tftTitle = t.TrimStart().StartsWith("TFT", StringComparison.OrdinalIgnoreCase)
      || t.IndexOf("Teamfight Tactics", StringComparison.OrdinalIgnoreCase) >= 0;
    bool tftClass = c.IndexOf("UnrealWindow", StringComparison.OrdinalIgnoreCase) >= 0;
    if (tftClass && tftTitle) return 2;
    if (gameClass && gameTitle) return 1;
    return 0;
  }

  // Returns: left top right bottom kind   (kind 1=lol, 2=tft)
  public static string Best(string lolPidsCsv, string tftPidsCsv) {
    var lolPids = ParsePids(lolPidsCsv);
    var tftPids = ParsePids(tftPidsCsv);
    var allPids = new HashSet<uint>(lolPids);
    foreach (var p in tftPids) allPids.Add(p);
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
      bool lolClient = t.IndexOf("League of Legends (TM) Client", StringComparison.OrdinalIgnoreCase) >= 0;
      bool lolTitle = lolClient
        || t.IndexOf("League of Legends (TM)", StringComparison.OrdinalIgnoreCase) >= 0;
      bool tftTitle = t.TrimStart().StartsWith("TFT", StringComparison.OrdinalIgnoreCase)
        || t.IndexOf("Teamfight Tactics", StringComparison.OrdinalIgnoreCase) >= 0;
      bool tftClass = c.IndexOf("UnrealWindow", StringComparison.OrdinalIgnoreCase) >= 0;
      bool isTftPid = tftPids.Contains(pid);
      bool isLolPid = lolPids.Contains(pid);
      // TFT process window counts even when the title is bare / localized.
      bool tftGame = isTftPid || (tftTitle && tftClass);
      bool gameClient = lolClient || tftGame;
      bool gameTitle = lolTitle || tftGame;
      bool byClass = c.IndexOf("RiotWindowClass", StringComparison.OrdinalIgnoreCase) >= 0
        || tftClass;
      bool byPid = allPids.Count > 0 && allPids.Contains(pid);
      if (allPids.Count > 0) {
        if (!byPid && !gameClient) return true;
      } else if (!gameTitle && !(byClass && lolTitle)) {
        if (!tftGame) return true;
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
      if (tftGame) score += 50000000; // prefer TFT when both somehow visible
      if (score > bestScore) {
        bestScore = score;
        int kind = (tftGame || isTftPid) ? 2 : 1;
        best = r.Left + " " + r.Top + " " + r.Right + " " + r.Bottom + " " + kind;
      }
      return true;
    }, IntPtr.Zero);
    return best;
  }
}
"@

function Emit-Line {
  $lolIds = @(
    Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -eq 'League of Legends' } |
      ForEach-Object { $_.Id }
  ) -join ','

  $tftIds = @(
    Get-Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ProcessName -like 'TFTClient*' } |
      ForEach-Object { $_.Id }
  ) -join ','

  $running = 0
  if ($lolIds -or $tftIds) { $running = 1 }

  $hit = $null
  if ($lolIds -or $tftIds) { $hit = [GdFind]::Best($lolIds, $tftIds) }
  if (-not $hit) { $hit = [GdFind]::Best('', '') }

  $focused = [GdFind]::ForegroundKind($lolIds, $tftIds)

  if ($hit) {
    # hit already includes kind: left top right bottom kind
    [Console]::WriteLine("$hit $focused $running")
  } else {
    [Console]::WriteLine("0 0 0 0 0 $focused $running")
  }
  [Console]::Out.Flush()
}

while ($true) {
  Emit-Line
  Start-Sleep -Milliseconds 300
}
