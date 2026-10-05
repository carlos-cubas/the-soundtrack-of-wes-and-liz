import UIKit
import Capacitor

/// The Capacitor web view, tuned for a full-screen landscape game. Orientation
/// comes from Info.plist and the hidden status bar / home indicator from the
/// SystemBars settings in capacitor.config.ts; this adds what only code can.
class GameViewController: CAPBridgeViewController {
    // On-screen controls sit near the bottom corners, so a thumb swipe there
    // should not send the player home on the first try.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        return .bottom
    }

    #if DEBUG
    // Simulator screenshots: open one of the web test entry points and pick the
    // landscape side, since a headless simulator can't be rotated. For example:
    //   xcrun simctl launch <udid> com.samiracubas.wesandliz -startQuery 'screen=map' -orientation left
    override func viewDidLoad() {
        super.viewDidLoad()
        guard let query = UserDefaults.standard.string(forKey: "startQuery"), !query.isEmpty,
              let base = bridge?.config.appStartServerURL,
              var url = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return }
        url.path = "/"
        url.query = query.hasPrefix("?") ? String(query.dropFirst()) : query
        if let start = url.url {
            webView?.load(URLRequest(url: start))
        }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard let side = UserDefaults.standard.string(forKey: "orientation"),
              let scene = view.window?.windowScene else { return }
        let mask: UIInterfaceOrientationMask = side == "left" ? .landscapeLeft : .landscapeRight
        scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
            print("GameViewController: orientation request refused: \(error)")
        }
    }
    #endif
}
