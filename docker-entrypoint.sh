#!/usr/bin/env bash
set -euo pipefail

# Optional headful debugging on servers without a GUI.
# Enable with:
#   -e XVFB=true -e DISPLAY=:99
# Optionally expose VNC with:
#   -e VNC=true -p 127.0.0.1:5900:5900

if [[ "${XVFB:-false}" == "true" ]]; then
  export DISPLAY="${DISPLAY:-:99}"
  # Start a virtual display
  Xvfb "$DISPLAY" -screen 0 "${XVFB_SCREEN:-1920x1080x24}" -ac +extension RANDR &

  # Lightweight window manager (helps some UIs render correctly)
  fluxbox >/dev/null 2>&1 &
fi

if [[ "${VNC:-false}" == "true" ]]; then
  export DISPLAY="${DISPLAY:-:99}"
  x11vnc -display "$DISPLAY" -forever -shared -nopw -rfbport "${VNC_PORT:-5900}" >/dev/null 2>&1 &
fi

exec npm start
