#!/usr/bin/env bash
# Live dashboard for the production VPS (root@vinahost).
# Colored, auto-refreshing view of load, CPU, memory, disk, top processes and
# the bibotracking systemd service.
#
#   scripts/vps-monitor.sh          # live dashboard, refresh every 2s (default)
#   scripts/vps-monitor.sh 5        # live dashboard, refresh every 5s
#   scripts/vps-monitor.sh once     # single snapshot, then exit
#   HOST=root@othervps scripts/vps-monitor.sh
#   SERVICE=foo scripts/vps-monitor.sh
set -euo pipefail

HOST="${HOST:-root@vinahost}"
SERVICE="${SERVICE:-bibotracking}"

ARG="${1:-2}"
if [[ "$ARG" == "once" ]]; then
  ONCE=1; INTERVAL=2
else
  ONCE=0; INTERVAL="$ARG"
  [[ "$INTERVAL" =~ ^[0-9]+$ ]] || { echo "usage: $0 [seconds|once]" >&2; exit 1; }
fi

# ---- local colors -------------------------------------------------------------
if [[ -t 1 ]]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; RST=$'\e[0m'
  RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; CYN=$'\e[36m'; GREY=$'\e[90m'
else
  BOLD=""; DIM=""; RST=""; RED=""; GRN=""; YEL=""; CYN=""; GREY=""
fi

# Remote gathers raw numbers in ONE ssh round-trip; we render locally with color.
remote_raw() {
  ssh -o ConnectTimeout=10 -o BatchMode=yes "$HOST" SERVICE="$SERVICE" bash -s <<'REMOTE'
set -euo pipefail
echo "HOST $(hostname)"
echo "DATE $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "UP $(uptime | sed 's/.*up //; s/,  *[0-9]* user.*//')"
# load1 load5 load15 ncpu
read -r l1 l5 l15 < <(awk '{print $1, $2, $3}' /proc/loadavg)
echo "LOAD $l1 $l5 $l15 $(nproc)"
# cpu idle% from the second sample (first sample is since-boot, useless)
idle=$(top -bn2 -d0.4 | awk '/^%Cpu/{line=$0} END{n=split(line,a," "); for(i=1;i<=n;i++) if(a[i]=="id,") print a[i-1]}')
echo "CPUIDLE ${idle:-0}"
# mem: total used avail (in MiB)
read -r mt mu ma < <(free -m | awk '/^Mem:/{print $2, $3, $7}')
echo "MEM $mt $mu $ma"
# swap total used (MiB)
read -r st su < <(free -m | awk '/^Swap:/{print $2, $3}')
echo "SWAP $st $su"
# disk: size used avail use% on /
read -r ds du da dp < <(df -BG / | awk 'NR==2{gsub("G","",$2);gsub("G","",$3);gsub("G","",$4);gsub("%","",$5);print $2,$3,$4,$5}')
echo "DISK $ds $du $da $dp"
echo "PROC"
ps -eo pcpu,pmem,pid,comm --sort=-pcpu | awk 'NR>1 && NR<=6{printf "  %5s%% %5s%%  %-6s %s\n",$1,$2,$3,$4}'
echo "ENDPROC"
if systemctl is-active "$SERVICE" >/dev/null 2>&1; then
  since=$(systemctl show "$SERVICE" -p ActiveEnterTimestamp --value)
  mpid=$(systemctl show "$SERVICE" -p MainPID --value)
  echo "SVC active $mpid|$since"
else
  echo "SVC inactive 0|"
fi
REMOTE
}

# horizontal bar: bar <percent> <width>
bar() {
  local pct=$1 width=${2:-24} filled color
  (( pct < 0 )) && pct=0; (( pct > 100 )) && pct=100
  filled=$(( pct * width / 100 ))
  if   (( pct >= 90 )); then color=$RED
  elif (( pct >= 70 )); then color=$YEL
  else color=$GRN; fi
  printf "%s" "$color"
  printf '█%.0s' $(seq 1 $filled) 2>/dev/null
  printf "%s" "$GREY"
  printf '░%.0s' $(seq 1 $(( width - filled ))) 2>/dev/null
  printf "%s" "$RST"
}

render() {
  local raw="$1"
  local host date up
  host=$(awk '/^HOST /{ $1=""; sub(/^ /,""); print; exit}' <<<"$raw")
  date=$(awk '/^DATE /{ $1=""; sub(/^ /,""); print; exit}' <<<"$raw")
  up=$(awk '/^UP /{ $1=""; sub(/^ /,""); print; exit}' <<<"$raw")

  # Tolerant parse: a transient garbled/partial frame must NOT kill the loop, so
  # every read is guarded and every field gets a safe default before arithmetic.
  local l1 l5 l15 ncpu idle mt mu ma st su ds du da dp svc_state svc_rest
  read -r _ l1 l5 l15 ncpu < <(grep '^LOAD ' <<<"$raw") || :
  read -r _ idle         < <(grep '^CPUIDLE ' <<<"$raw") || :
  read -r _ mt mu ma     < <(grep '^MEM ' <<<"$raw") || :
  read -r _ st su        < <(grep '^SWAP ' <<<"$raw") || :
  read -r _ ds du da dp  < <(grep '^DISK ' <<<"$raw") || :
  read -r _ svc_state svc_rest < <(grep '^SVC ' <<<"$raw") || :

  svc_state=${svc_state:-unknown}
  local svc_pid="${svc_rest%%|*}" svc_since="${svc_rest#*|}"

  # Sanitize EVERY numeric field. A garbled frame can put a stray word (e.g. "ni")
  # where a number belongs; in $(( 100 - ni )) bash reads `ni` as a variable and
  # set -u aborts. num() forces a clean number (or 0) so arithmetic is always safe.
  num() { [[ "$1" =~ ^[0-9]+([.][0-9]+)?$ ]] && printf '%s' "$1" || printf '0'; }
  l1=$(num "${l1:-}"); l5=$(num "${l5:-}"); l15=$(num "${l15:-}")
  ncpu=$(num "${ncpu:-}"); (( ncpu < 1 )) && ncpu=1
  idle=$(num "${idle:-}"); mt=$(num "${mt:-}"); mu=$(num "${mu:-}"); ma=$(num "${ma:-}")
  st=$(num "${st:-}"); su=$(num "${su:-}")
  ds=$(num "${ds:-}"); du=$(num "${du:-}"); da=$(num "${da:-}"); dp=$(num "${dp:-}")

  # derived integers (idle may be "98.0" → strip decimal; guard divide-by-zero)
  local cpu_used=$(( 100 - ${idle%.*} ))
  local mem_pct=0; (( mt > 0 )) && mem_pct=$(( mu * 100 / mt ))
  local load_pct
  load_pct=$(awk -v l="$l1" -v n="$ncpu" 'BEGIN{if(n<1)n=1; p=l/n*100; if(p>100)p=100; if(p<0)p=0; printf "%d", p}')

  local sep="${GREY}────────────────────────────────────────────────────────${RST}"
  printf "%s╭─ %sVPS MONITOR%s  %s%s%s\n" "$CYN" "$BOLD" "$RST$CYN" "$HOST" "" "$RST"
  printf "%s│%s  %s%s%s   up %s   %s%s%s\n" "$CYN" "$RST" "$BOLD" "$host" "$RST" "$up" "$DIM" "$date" "$RST"
  printf "%s╰%s\n" "$CYN" "$RST"

  # LOAD
  printf "  %sLOAD%s  %s  %s%5.2f%s / %5.2f / %5.2f  %s(%s cores)%s\n" \
    "$BOLD" "$RST" "$(bar "$load_pct" 24)" "$BOLD" "$l1" "$RST" "$l5" "$l15" "$DIM" "$ncpu" "$RST"
  # CPU
  printf "  %sCPU %s  %s  %s%3d%%%s busy   %s%s%% idle%s\n" \
    "$BOLD" "$RST" "$(bar "$cpu_used" 24)" "$BOLD" "$cpu_used" "$RST" "$DIM" "$idle" "$RST"
  # MEM
  printf "  %sMEM %s  %s  %s%3d%%%s  %sMi used / %sMi total  %s(%sMi avail)%s\n" \
    "$BOLD" "$RST" "$(bar "$mem_pct" 24)" "$BOLD" "$mem_pct" "$RST" "$mu" "$mt" "$DIM" "$ma" "$RST"
  # SWAP (only if present)
  if [[ "${st:-0}" -gt 0 ]]; then
    local swap_pct=$(( su * 100 / st ))
    printf "  %sSWAP%s  %s  %s%3d%%%s  %sMi / %sMi\n" \
      "$BOLD" "$RST" "$(bar "$swap_pct" 24)" "$BOLD" "$swap_pct" "$RST" "$su" "$st"
  else
    printf "  %sSWAP%s  %s(no swap configured)%s\n" "$BOLD" "$RST" "$DIM" "$RST"
  fi
  # DISK
  printf "  %sDISK%s  %s  %s%3d%%%s  %sG used / %sG total  %s(%sG free)%s\n" \
    "$BOLD" "$RST" "$(bar "${dp:-0}" 24)" "$BOLD" "${dp:-0}" "$RST" "$du" "$ds" "$DIM" "$da" "$RST"

  # SERVICE
  if [[ "$svc_state" == "active" ]]; then
    printf "  %sSVC %s  %s●%s %s%s%s  %srunning%s  %spid %s  since %s%s\n" \
      "$BOLD" "$RST" "$GRN" "$RST" "$BOLD" "$SERVICE" "$RST" "$GRN" "$RST" "$DIM" "$svc_pid" "$svc_since" "$RST"
  else
    printf "  %sSVC %s  %s●%s %s%s%s  %sNOT RUNNING%s\n" \
      "$BOLD" "$RST" "$RED" "$RST" "$BOLD" "$SERVICE" "$RST" "$RED" "$RST"
  fi

  echo "$sep"
  printf "  %s%5s  %5s   %-6s %s%s\n" "$DIM" "CPU" "MEM" "PID" "COMMAND" "$RST"
  awk '/^PROC$/{f=1;next} /^ENDPROC$/{f=0} f' <<<"$raw"
}

dashboard() {
  local raw status
  if raw=$(remote_raw 2>/dev/null); then
    render "$raw"
    status=ok
  else
    printf "  %s!! ssh to %s failed — retrying%s\n" "$RED" "$HOST" "$RST"
    status=fail
  fi
  if [[ "$ONCE" -eq 0 ]]; then
    printf "\n  %srefreshing every %ss · Ctrl-C to quit%s\n" "$DIM" "$INTERVAL" "$RST"
  fi
  return 0
}

if [[ "$ONCE" -eq 1 ]]; then
  dashboard
  exit 0
fi

# Live mode: hide cursor, restore on exit, redraw from top each tick (no flicker).
# Uses raw ANSI (not clear/tput) so it never depends on $TERM being set.
cleanup() { printf '\e[?25h\e[0m\n'; }          # restore cursor/color
on_signal() { cleanup; trap - EXIT; exit 0; }   # Ctrl-C / SIGTERM must actually quit
trap cleanup EXIT
trap on_signal INT TERM
printf '\e[?25l\e[2J'   # hide cursor + clear screen
while true; do
  # Never let a single bad frame abort the loop; render in a guarded subshell.
  out=$(dashboard) || out="  ${RED}!! render error — retrying${RST}"
  printf '\e[H%s\e[J' "$out"   # home, draw, clear to end of screen
  sleep "$INTERVAL"
done
