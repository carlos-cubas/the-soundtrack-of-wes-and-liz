#!/usr/bin/env bash
# Build the game and install it on a connected iPhone or iPad, then launch it.
#
#   DEVICE=iPad npm run ios:device            # by type, name or UDID
#   DEVICE="Carlos’ iPhone" npm run ios:device
#   npm run ios:device                        # when only one device is paired
#
# Signs automatically with TEAM (default 3DU8Y8MDM6) and registers a new device
# with the team on first use. Output:
#   ios/App/build/device/Build/Products/Debug-iphoneos/App.app
set -euo pipefail
cd "$(dirname "$0")/.."

TEAM="${TEAM:-3DU8Y8MDM6}"
BUNDLE_ID=com.samiracubas.wesandliz
DERIVED=ios/App/build/device
APP="$DERIVED/Build/Products/Debug-iphoneos/App.app"

step() { printf '\n== %s\n' "$*"; }

step "device: ${DEVICE:-(only one)}"
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT
xcrun devicectl list devices --json-output "$LIST" >/dev/null
read -r UDID NAME < <(node -e '
  const want = (process.argv[2] || "").toLowerCase();
  const all = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result.devices
    .filter((d) => d.hardwareProperties?.reality === "physical")
    .map((d) => ({ udid: d.hardwareProperties.udid, name: d.deviceProperties?.name ?? "?",
                   type: d.hardwareProperties.deviceType ?? "", os: d.deviceProperties?.osVersionNumber ?? "?" }));
  const hits = want ? all.filter((d) => [d.udid, d.name, d.type].some((v) => v.toLowerCase() === want)) : all;
  if (hits.length !== 1) {
    console.error(`need exactly one device${want ? ` matching "${want}"` : ""}, found ${hits.length}:`);
    for (const d of all) console.error(`  ${d.type} "${d.name}" ${d.udid} (iOS ${d.os})`);
    process.exit(1);
  }
  console.log(hits[0].udid, hits[0].name);' "$LIST" "${DEVICE:-}")
echo "$NAME ($UDID)"

step "vite build"
npx vite build

step "cap sync ios"
npx cap sync ios

step "xcodebuild"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS,id=$UDID" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$TEAM" \
  CODE_SIGN_STYLE=Automatic \
  -quiet \
  build
echo "built $APP"

step "install"
xcrun devicectl device install app --device "$UDID" "$APP"

step "launch"
if ! OUT="$(xcrun devicectl device process launch --device "$UDID" --terminate-existing "$BUNDLE_ID" 2>&1)"; then
  echo "$OUT" >&2
  if grep -q "Locked" <<<"$OUT"; then
    echo $'\nThe app is installed but the device is locked: unlock it and tap the Wes & Liz icon.' >&2
  else
    cat >&2 <<'EOF'

The app is installed but didn't launch. If this is the first install from this Apple ID,
on the device open Settings > General > VPN & Device Management, tap the developer app
entry, Trust it, then tap the Wes & Liz icon.
EOF
  fi
  exit 1
fi
echo "$OUT"
