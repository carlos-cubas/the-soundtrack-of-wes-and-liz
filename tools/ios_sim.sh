#!/usr/bin/env bash
# Build the game, run it in the iOS Simulator and save a screenshot.
#
#   npm run ios:sim                      # iPhone 17, screenshot after 8 s
#   SIM_DEVICE="iPhone 16e" npm run ios:sim
#   SHOT=out.png SHOT_WAIT=15 npm run ios:sim
#   SIM_DEVICE="iPad Pro 13-inch (M5)" START_QUERY="screen=map" ORIENTATION=left npm run ios:sim
#
# START_QUERY opens a web test entry point (play=l1, screen=map) and ORIENTATION
# (right or left) picks the landscape side; both only work in Debug builds.
# No signing is needed for the simulator. Output:
#   ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
#   ios/App/build/sim-screenshot.png (rotated to landscape)
set -euo pipefail
cd "$(dirname "$0")/.."

DEVICE="${SIM_DEVICE:-iPhone 17}"
BUNDLE_ID=com.samiracubas.wesandliz
DERIVED=ios/DerivedData
APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
SHOT="${SHOT:-ios/App/build/sim-screenshot.png}"
SHOT_WAIT="${SHOT_WAIT:-8}"
ORIENTATION="${ORIENTATION:-right}"

step() { printf '\n== %s\n' "$*"; }

step "vite build"
npx vite build

step "cap sync ios"
npx cap sync ios

step "simulator: $DEVICE"
find_udid() {
  xcrun simctl list devices available -j | node -e '
    const name = process.argv[1];
    const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const ios = Object.keys(devices).filter((r) => r.includes("iOS")).sort().reverse();
    for (const r of ios) {
      const d = devices[r].find((x) => x.name === name);
      if (d) { console.log(d.udid); break; }
    }' "$DEVICE"
}
UDID="$(find_udid)"
if [ -z "$UDID" ]; then
  RUNTIME="$(xcrun simctl list runtimes available -j | node -e '
    const { runtimes } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const ios = runtimes.filter((r) => r.platform === "iOS").sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
    console.log(ios.at(-1)?.identifier ?? "")')"
  [ -n "$RUNTIME" ] || { echo "no iOS simulator runtime installed (Xcode > Settings > Components)" >&2; exit 1; }
  TYPE="com.apple.CoreSimulator.SimDeviceType.$(echo "$DEVICE" | tr ' ' '-')"
  echo "creating $DEVICE ($TYPE, $RUNTIME)"
  UDID="$(xcrun simctl create "$DEVICE" "$TYPE" "$RUNTIME")"
fi
echo "udid $UDID"

step "xcodebuild"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  -quiet \
  build
echo "built $APP"

step "boot, install, launch"
xcrun simctl boot "$UDID" 2>/dev/null || true
# The Simulator window is optional: simctl drives a headless device just as well.
open -a Simulator --args -CurrentDeviceUDID "$UDID" 2>/dev/null || echo "(Simulator.app not found, running headless)"
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch --terminate-running-process "$UDID" "$BUNDLE_ID" \
  -startQuery "${START_QUERY:-}" -orientation "$ORIENTATION"

step "screenshot in ${SHOT_WAIT}s"
sleep "$SHOT_WAIT"
mkdir -p "$(dirname "$SHOT")"
xcrun simctl io "$UDID" screenshot "$SHOT" >/dev/null 2>&1
# The simulator captures its portrait framebuffer even though the game runs in
# landscape; turn the image so it reads the right way up.
read -r W H < <(sips -g pixelWidth -g pixelHeight "$SHOT" | awk '/pixel/ {print $2}' | xargs)
if [ "$H" -gt "$W" ]; then
  if [ "$ORIENTATION" = left ]; then sips -r 90 "$SHOT" >/dev/null; else sips -r 270 "$SHOT" >/dev/null; fi
fi
echo "saved $SHOT"
