// Dock Buddies 3D — Barry the plush bear and Nom the alien having coffee on top of your Mac's Dock.
//
// Keep buddies.html in the same folder as this file. It holds the 3D scene with both characters
// already sculpted and stored inside, so it opens instantly.
//
// Quick try:   swiftc -parse-as-library DockBuddies3D.swift -o DockBuddies3D && ./DockBuddies3D
// Proper app:  bash build.sh   (creates "Dock Buddies 3D.app")
//
// Needs macOS 12+ and Xcode or the Command Line Tools (xcode-select --install).

import AppKit
import WebKit
import SwiftUI
import ServiceManagement

/// The scene is drawn for a 460 × 340 frame; the window keeps that shape at every size.
let aspect: CGFloat = 340.0 / 460.0
/// Empty space below their feet in the scene, as a fraction of the window height (so they sit right on the Dock).
let footGap: CGFloat = 0.085

func sceneURL() -> URL {
    var candidates: [URL] = []
    if let url = Bundle.main.url(forResource: "buddies", withExtension: "html") { candidates.append(url) }
    candidates.append(URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("buddies.html"))
    candidates.append(URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("buddies.html"))
    for url in candidates where FileManager.default.fileExists(atPath: url.path) { return url }
    fatalError("Couldn't find buddies.html — keep it in the same folder as DockBuddies3D.swift.")
}

/// A web view that never takes clicks, so everything passes through to the Dock.
final class PassThroughWebView: WKWebView {
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override var acceptsFirstResponder: Bool { false }
}

/// Holds the scene. In "Move with Mouse" mode it lets you drag the buddies along the Dock.
final class DragView: NSView {
    var onDrag: ((CGFloat) -> Void)?      // horizontal distance moved so far
    var onDrop: (() -> Void)?
    private var startMouseX: CGFloat = 0
    var moving = false {
        didSet {
            layer?.borderWidth = moving ? 2 : 0
            window?.invalidateCursorRects(for: self)
        }
    }
    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.cornerRadius = 14
        layer?.borderColor = NSColor.controlAccentColor.withAlphaComponent(0.7).cgColor
    }
    required init?(coder: NSCoder) { fatalError() }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() { if moving { addCursorRect(bounds, cursor: .openHand) } }
    override func mouseDown(with event: NSEvent) {
        startMouseX = NSEvent.mouseLocation.x
        NSCursor.closedHand.push()
    }
    override func mouseDragged(with event: NSEvent) { onDrag?(NSEvent.mouseLocation.x - startMouseX) }
    override func mouseUp(with event: NSEvent) {
        NSCursor.pop()
        onDrop?()
    }
}

struct BirthdaySettings {
    var days: [(month: Int, day: Int)] = []
    var title = ""
    var message = ""
}

/// The birthday message is kept in this Mac's settings (Settings… in the ☕ menu), never inside the app,
/// so the app can be shared or published without it.
enum Birthday {
    static let remindEvery: TimeInterval = 60 * 60     // comes back once an hour until "Thank you" is pressed

    static let onKey = "DockBuddiesBirthdayOn", monthKey = "DockBuddiesBirthdayMonth", dayKey = "DockBuddiesBirthdayDay"
    static let lengthKey = "DockBuddiesBirthdayLength", titleKey = "DockBuddiesBirthdayTitle"
    static let messageKey = "DockBuddiesBirthdayMessage", setUpKey = "DockBuddiesBirthdaySetUp"
    static let defaultTitle = "Happy birthday! 🎂"
    static let defaultMessage = "Barry and Nom saved you the best cup of coffee today.\nLove, Barry & Nom 💛"

    static var thanksKey: String { "DockBuddiesBirthdayThanks-\(Calendar.current.component(.year, from: Date()))" }

    /// The current birthday settings, or nil when the birthday is switched off.
    static func load() -> BirthdaySettings? {
        let d = UserDefaults.standard
        guard d.bool(forKey: onKey) else { return nil }
        let month = d.integer(forKey: monthKey), day = d.integer(forKey: dayKey)
        guard (1...12).contains(month), (1...31).contains(day) else { return nil }
        let length = max(1, d.integer(forKey: lengthKey))
        var b = BirthdaySettings()
        // consecutive days from the start date (a leap year, so 29 Feb works)
        let cal = Calendar(identifier: .gregorian)
        if let start = cal.date(from: DateComponents(year: 2028, month: month, day: day)) {
            for i in 0..<length {
                if let dt = cal.date(byAdding: .day, value: i, to: start) {
                    let c = cal.dateComponents([.month, .day], from: dt)
                    b.days.append((c.month ?? month, c.day ?? day))
                }
            }
        }
        b.title = d.string(forKey: titleKey) ?? defaultTitle
        b.message = d.string(forKey: messageKey) ?? defaultMessage
        return b
    }
}

/// Where new versions are published. The app checks here and updates itself.
enum Updates {
    static let repo = "jochapam/dock-buddies"
    static let assetName = "Dock-Buddies-3D.zip"
    static let checkEvery: TimeInterval = 6 * 60 * 60

    static var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }

    /// true when version a is newer than b ("2.10" > "2.9").
    static func isNewer(_ a: String, than b: String) -> Bool {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }, pb = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0, y = i < pb.count ? pb[i] : 0
            if x != y { return x > y }
        }
        return false
    }
}

struct ScreenChoice: Identifiable, Hashable {
    let id: Int
    let name: String
}

/// Everything the Settings window edits. Changes are saved straight away and applied live.
@MainActor
final class SettingsModel: ObservableObject {
    weak var app: AppDelegate?
    let d = UserDefaults.standard

    @Published var size: Double { didSet { app?.setWidth(CGFloat(size)) } }
    @Published var birthdayOn: Bool { didSet { save() } }
    @Published var birthdayDate: Date { didSet { save() } }
    @Published var birthdayLength: Int { didSet { save() } }
    @Published var title: String { didSet { save() } }
    @Published var message: String { didSet { save() } }
    @Published var thanked: Bool
    @Published var openAtLogin: Bool { didSet { if openAtLogin != oldValue { setOpenAtLogin(openAtLogin) } } }
    @Published var loginNote = ""
    @Published var screenID: Int { didSet { if screenID != oldValue && !syncing { app?.moveToScreen(screenID) } } }
    var syncing = false
    @Published var onDock: Bool { didSet { d.set(onDock, forKey: AppDelegate.onDockKey); app?.reposition() } }
    @Published var screens: [ScreenChoice] = []

    func refreshScreens() {
        screens = NSScreen.screens.enumerated().map { i, sc in
            ScreenChoice(id: AppDelegate.displayID(sc), name: AppDelegate.screenName(sc, index: i))
        }
        if let app {                              // show where they actually are, without moving them
            syncing = true
            screenID = AppDelegate.displayID(app.targetScreen())
            syncing = false
        }
    }

    /// Login items need macOS 13 or later; on macOS 12 the switch is hidden.
    static var canOpenAtLogin: Bool { if #available(macOS 13.0, *) { return true } else { return false } }

    init(app: AppDelegate) {
        let d = UserDefaults.standard
        self.app = app
        size = Double(app.width)
        birthdayOn = d.bool(forKey: Birthday.onKey)
        let m = d.integer(forKey: Birthday.monthKey), dd = d.integer(forKey: Birthday.dayKey)
        let year = Calendar.current.component(.year, from: Date())
        birthdayDate = Calendar.current.date(from: DateComponents(year: year, month: m > 0 ? m : 1, day: dd > 0 ? dd : 1)) ?? Date()
        birthdayLength = max(1, d.integer(forKey: Birthday.lengthKey))
        title = d.string(forKey: Birthday.titleKey) ?? Birthday.defaultTitle
        message = d.string(forKey: Birthday.messageKey) ?? Birthday.defaultMessage
        thanked = d.bool(forKey: Birthday.thanksKey)
        if #available(macOS 13.0, *) { openAtLogin = SMAppService.mainApp.status == .enabled } else { openAtLogin = false }
        screenID = AppDelegate.displayID(app.targetScreen())
        onDock = d.bool(forKey: AppDelegate.onDockKey)
        refreshScreens()
    }

    func save() {
        let c = Calendar.current.dateComponents([.month, .day], from: birthdayDate)
        d.set(birthdayOn, forKey: Birthday.onKey)
        d.set(c.month ?? 1, forKey: Birthday.monthKey)
        d.set(c.day ?? 1, forKey: Birthday.dayKey)
        d.set(birthdayLength, forKey: Birthday.lengthKey)
        d.set(title, forKey: Birthday.titleKey)
        d.set(message, forKey: Birthday.messageKey)
        d.set(true, forKey: Birthday.setUpKey)
        app?.checkBirthday()
    }

    func setOpenAtLogin(_ on: Bool) {
        guard #available(macOS 13.0, *) else { return }
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            loginNote = SMAppService.mainApp.status == .requiresApproval
                ? "Allow Dock Buddies in System Settings → General → Login Items." : ""
        } catch {
            loginNote = "Couldn't change this: \(error.localizedDescription)"
            let actual = SMAppService.mainApp.status == .enabled
            if actual != openAtLogin { openAtLogin = actual }
        }
    }

    func showAgainThisYear() {
        d.removeObject(forKey: Birthday.thanksKey)
        thanked = false
    }
}

struct SettingsView: View {
    @ObservedObject var model: SettingsModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if SettingsModel.canOpenAtLogin {
                GroupBox(label: Text("General").font(.headline)) {
                    VStack(alignment: .leading, spacing: 6) {
                        Toggle("Open at login", isOn: $model.openAtLogin)
                        if !model.loginNote.isEmpty {
                            Text(model.loginNote).font(.caption).foregroundColor(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                }
            }

            GroupBox(label: Text("Size").font(.headline)) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "tortoise").foregroundColor(.secondary)
                        Slider(value: $model.size, in: AppDelegate.minWidth...AppDelegate.maxWidth)
                        Image(systemName: "hare").foregroundColor(.secondary)
                    }
                    HStack {
                        Text("Small").font(.caption).foregroundColor(.secondary)
                        Spacer()
                        Button("Reset") { model.size = AppDelegate.defaultWidth }
                        Spacer()
                        Text("Large").font(.caption).foregroundColor(.secondary)
                    }
                }
                .padding(8)
            }

            GroupBox(label: Text("Position").font(.headline)) {
                VStack(alignment: .leading, spacing: 10) {
                    if model.screens.count > 1 {
                        Picker("Screen", selection: $model.screenID) {
                            ForEach(model.screens) { sc in Text(sc.name).tag(sc.id) }
                        }
                    }
                    HStack {
                        Button("◀ Nudge left") { model.app?.nudgeLeft() }
                        Button("Back to corner") { model.app?.recentre() }
                        Button("Nudge right ▶") { model.app?.nudgeRight() }
                    }
                    .frame(maxWidth: .infinity)
                    Toggle("Sit at Dock height (when they're over the Dock)", isOn: $model.onDock)
                    Text("They start in the bottom-right corner. You can also drag them along, or onto another screen, with ☕ > Move with Mouse.")
                        .font(.caption).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(8)
            }

            GroupBox(label: Text("Birthday message").font(.headline)) {
                VStack(alignment: .leading, spacing: 10) {
                    Toggle("Celebrate a birthday", isOn: $model.birthdayOn)
                    Group {
                        HStack {
                            DatePicker("Starts on", selection: $model.birthdayDate, displayedComponents: .date)
                                .datePickerStyle(.field)
                                .fixedSize()
                            Text("(every year)").font(.caption).foregroundColor(.secondary)
                        }
                        Stepper("Lasts \(model.birthdayLength) day\(model.birthdayLength == 1 ? "" : "s")",
                                value: $model.birthdayLength, in: 1...7)
                        HStack {
                            Text("Title")
                            TextField("Happy birthday! 🎂", text: $model.title)
                        }
                        Text("Message")
                        TextEditor(text: $model.message)
                            .font(.body)
                            .frame(height: 64)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color.secondary.opacity(0.3)))
                        HStack {
                            Button("Preview now") { model.app?.playBirthday() }
                            Spacer()
                            if model.thanked {
                                Text("Thanked this year 💛").font(.caption).foregroundColor(.secondary)
                                Button("Show it again") { model.showAgainThisYear() }
                            }
                        }
                    }
                    .disabled(!model.birthdayOn)
                    Text("On these days they wear party hats, and the card comes back every hour until someone presses Thank you.")
                        .font(.caption).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(8)
            }
        }
        .padding(20)
        .frame(width: 440)
    }
}

/// A small floating card that can take clicks (for the birthday message).
final class CardPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var panel: NSPanel!
    var webView: PassThroughWebView!
    var statusItem: NSStatusItem!
    var toggleItem: NSMenuItem!
    var moveItem: NSMenuItem!
    var dragView: DragView!
    var dragStartX: CGFloat = 0
    var lastMouse = NSPoint(x: -1, y: -1)
    var birthdayItem: NSMenuItem!
    var settingsWindow: NSWindow?
    var settingsModel: SettingsModel?
    var nextScreenItem: NSMenuItem!
    var updating = false
    var card: CardPanel?
    var cardTimer: Timer?
    var lastBirthdayShown: Date?
    var hatsOn: Bool?
    var width: CGFloat = 300

    let fromRightKey = "DockBuddies3DFromRight"        // distance from the screen's bottom-right corner
    static let screenKey = "DockBuddies3DScreen", onDockKey = "DockBuddies3DOnDock"
    let cornerMargin: CGFloat = 12
    let widthKey = "DockBuddies3DWidth"
    static let minWidth: Double = 150, maxWidth: Double = 600, defaultWidth: Double = 300

    func applicationDidFinishLaunching(_ notification: Notification) {
        let saved = UserDefaults.standard.double(forKey: widthKey)
        if saved > 0 { width = CGFloat(min(max(saved, AppDelegate.minWidth), AppDelegate.maxWidth)) }

        panel = NSPanel(contentRect: NSRect(origin: .zero, size: panelSize()),
                        styleMask: [.borderless, .nonactivatingPanel],
                        backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true        // clicks pass straight through to the Dock
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.dockWindow)) + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]

        let config = WKWebViewConfiguration()
        config.suppressesIncrementalRendering = true
        webView = PassThroughWebView(frame: NSRect(origin: .zero, size: panelSize()), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")          // transparent behind the 3D scene
        if #available(macOS 12.0, *) { webView.underPageBackgroundColor = .clear }
        webView.autoresizingMask = [.width, .height]
        let url = sceneURL()
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        dragView = DragView(frame: NSRect(origin: .zero, size: panelSize()))
        dragView.autoresizingMask = [.width, .height]
        webView.frame = dragView.bounds
        dragView.addSubview(webView)
        dragView.onDrag = { [weak self] dx in
            guard let self else { return }
            if dx == 0 { return }
            // can be dragged across onto a screen beside this one
            let all = NSScreen.screens.reduce(NSRect.null) { $0.union($1.frame) }
            var f = self.panel.frame
            f.origin.x = min(max(self.dragStartX + dx, all.minX), all.maxX - f.width)
            if let here = NSScreen.screens.first(where: { $0.frame.minX <= f.midX && f.midX < $0.frame.maxX }) {
                f.origin.y = self.baseY(on: here, height: f.height)       // follow the bottom of whichever screen they're over
            }
            self.panel.setFrameOrigin(f.origin)
        }
        dragView.onDrop = { [weak self] in
            guard let self else { return }
            // remember which screen they were left on, and how far from its bottom-right corner
            let f = self.panel.frame
            let screen = NSScreen.screens.first(where: { $0.frame.minX <= f.midX && f.midX < $0.frame.maxX }) ?? self.targetScreen()
            UserDefaults.standard.set(AppDelegate.displayID(screen), forKey: AppDelegate.screenKey)
            UserDefaults.standard.set(Double(max(0, screen.frame.maxX - self.cornerMargin - f.maxX)), forKey: self.fromRightKey)
            self.reposition()
            self.settingsModel?.refreshScreens()
        }
        panel.contentView = dragView

        reposition()
        panel.orderFrontRegardless()

        NotificationCenter.default.addObserver(self, selector: #selector(reposition),
                                               name: NSApplication.didChangeScreenParametersNotification,
                                               object: nil)
        setUpMenuBarItem()

        // Nom's eyes follow the mouse: send the pointer position to the scene about 20 times a second.
        Timer.scheduledTimer(timeInterval: 1.0 / 20, target: self, selector: #selector(sendMouse),
                             userInfo: nil, repeats: true)

        // Birthday: check shortly after start, then every 30 seconds.
        Timer.scheduledTimer(timeInterval: 4, target: self, selector: #selector(checkBirthday), userInfo: nil, repeats: false)
        Timer.scheduledTimer(timeInterval: 30, target: self, selector: #selector(checkBirthday), userInfo: nil, repeats: true)

        // Updates: a minute after start, then every few hours.
        Timer.scheduledTimer(timeInterval: 60, target: self, selector: #selector(autoCheckForUpdates), userInfo: nil, repeats: false)
        Timer.scheduledTimer(timeInterval: Updates.checkEvery, target: self, selector: #selector(autoCheckForUpdates),
                             userInfo: nil, repeats: true)
    }

    func panelSize() -> NSSize { NSSize(width: width, height: (width * aspect).rounded()) }

    // MARK: Where they sit

    static func displayID(_ screen: NSScreen) -> Int {
        (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.intValue ?? 0
    }

    static func screenName(_ screen: NSScreen, index: Int) -> String {
        var name = "Screen \(index + 1)"
        if #available(macOS 10.15, *) { name = screen.localizedName }
        return index == 0 ? name + " (main)" : name
    }

    /// The screen they live on: the one chosen in Settings, or the main screen if that one isn't connected.
    func targetScreen() -> NSScreen {
        let id = UserDefaults.standard.integer(forKey: AppDelegate.screenKey)
        return NSScreen.screens.first(where: { AppDelegate.displayID($0) == id }) ?? NSScreen.screens.first ?? NSScreen.main!
    }

    /// Feet on the bottom edge of the screen, or on top of the Dock if that's switched on and the Dock is at the bottom.
    func baseY(on screen: NSScreen, height: CGFloat) -> CGFloat {
        let dockAtBottom = screen.visibleFrame.minY > screen.frame.minY + 1
        let floor = UserDefaults.standard.bool(forKey: AppDelegate.onDockKey) && dockAtBottom ? screen.visibleFrame.minY + 4 : screen.frame.minY + 2
        return floor - height * footGap
    }

    /// Bottom-right corner of their screen (moved left by any nudges or dragging).
    @objc func reposition() {
        let screen = targetScreen()
        let size = panelSize()
        let fromRight = CGFloat(UserDefaults.standard.double(forKey: fromRightKey))
        var x = screen.frame.maxX - cornerMargin - size.width - fromRight
        x = min(max(x, screen.frame.minX), screen.frame.maxX - size.width)
        panel.setFrame(NSRect(x: x, y: baseY(on: screen, height: size.height), width: size.width, height: size.height), display: true)
        dragStartX = panel.frame.minX
        card?.setFrameOrigin(NSPoint(x: min(max(panel.frame.midX - (card?.frame.width ?? 0) / 2, screen.frame.minX + 8),
                                            screen.frame.maxX - (card?.frame.width ?? 0) - 8), y: panel.frame.maxY + 4))
    }

    func moveToScreen(_ id: Int) {
        UserDefaults.standard.set(id, forKey: AppDelegate.screenKey)
        UserDefaults.standard.set(0, forKey: fromRightKey)      // start in that screen's corner
        reposition()
    }

    @objc func nextScreen() {
        let screens = NSScreen.screens
        guard screens.count > 1, let i = screens.firstIndex(of: targetScreen()) else { return }
        moveToScreen(AppDelegate.displayID(screens[(i + 1) % screens.count]))
        settingsModel?.refreshScreens()
    }

    func setUpMenuBarItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "☕"

        let menu = NSMenu()
        menu.addItem(withTitle: "Nudge Left", action: #selector(nudgeLeft), keyEquivalent: "").target = self
        menu.addItem(withTitle: "Nudge Right", action: #selector(nudgeRight), keyEquivalent: "").target = self
        menu.addItem(withTitle: "Back to Corner", action: #selector(recentre), keyEquivalent: "").target = self
        nextScreenItem = menu.addItem(withTitle: "Move to Next Screen", action: #selector(nextScreen), keyEquivalent: "")
        nextScreenItem.target = self
        menu.addItem(.separator())
        moveItem = menu.addItem(withTitle: "Move with Mouse", action: #selector(toggleMoveMode), keyEquivalent: "")
        moveItem.target = self
        menu.addItem(.separator())
        // They do these by themselves now and then; this lets you ask for one.
        let doItem = menu.addItem(withTitle: "Ask Them To", action: nil, keyEquivalent: "")
        let doMenu = NSMenu()
        for (title, name) in [("Make a Toast 🥂", "toast"), ("Cuddle Greg 🐊", "croc"), ("Have a Stretch", "stretch")] {
            let item = doMenu.addItem(withTitle: title, action: #selector(doActivity(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = name
        }
        doItem.submenu = doMenu
        birthdayItem = menu.addItem(withTitle: "🎂 Play Birthday Message", action: #selector(playBirthday), keyEquivalent: "")
        birthdayItem.target = self
        birthdayItem.isHidden = true
        menu.addItem(.separator())
        menu.addItem(withTitle: "Settings…", action: #selector(openSettings), keyEquivalent: ",").target = self
        menu.addItem(withTitle: "Check for Updates…", action: #selector(manualCheckForUpdates), keyEquivalent: "").target = self
        toggleItem = menu.addItem(withTitle: "Hide Buddies", action: #selector(toggleVisible), keyEquivalent: "")
        toggleItem.target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Dock Buddies", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.delegate = self
        statusItem.menu = menu
    }

    /// The birthday item shows on the birthday dates (or any day if you hold Option while opening the menu, to preview it).
    func menuNeedsUpdate(_ menu: NSMenu) {
        let option = NSEvent.modifierFlags.contains(.option)
        birthdayItem.isHidden = !(isBirthdayToday() || (option && Birthday.load() != nil))
        nextScreenItem.isHidden = NSScreen.screens.count < 2
    }

    func setWidth(_ w: CGFloat) {
        width = min(max(w, CGFloat(AppDelegate.minWidth)), CGFloat(AppDelegate.maxWidth)).rounded()
        UserDefaults.standard.set(Double(width), forKey: widthKey)
        reposition()
    }

    @objc func openSettings() {
        if settingsWindow == nil {
            let model = SettingsModel(app: self)
            settingsModel = model
            let host = NSHostingController(rootView: SettingsView(model: model))
            let w = NSWindow(contentViewController: host)
            w.title = "Dock Buddies Settings"
            w.styleMask = [.titled, .closable]
            w.isReleasedWhenClosed = false
            w.center()
            settingsWindow = w
        }
        settingsModel?.refreshScreens()
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow?.makeKeyAndOrderFront(nil)
    }

    func shift(by dx: Double) {
        let d = UserDefaults.standard
        let maxShift = Double(targetScreen().frame.width - panelSize().width - cornerMargin)
        d.set(min(max(0, d.double(forKey: fromRightKey) - dx), maxShift), forKey: fromRightKey)
        reposition()
    }

    @objc func nudgeLeft() { shift(by: -80) }
    @objc func nudgeRight() { shift(by: 80) }
    @objc func recentre() {                        // back to the bottom-right corner
        UserDefaults.standard.set(0, forKey: fromRightKey)
        reposition()
    }

    /// While on, the buddies can be grabbed and dragged along the Dock; while off, clicks pass straight through.
    @objc func toggleMoveMode() {
        let on = moveItem.state != .on
        moveItem.state = on ? .on : .off
        panel.ignoresMouseEvents = !on
        dragView.moving = on
        dragStartX = panel.frame.minX
    }

    @objc func sendMouse() {
        guard panel.isVisible else { return }
        let m = NSEvent.mouseLocation
        let f = panel.frame
        let p = NSPoint(x: m.x - f.minX, y: m.y - f.minY)   // relative to the window, from its bottom-left
        if p == lastMouse { return }
        lastMouse = p
        webView.evaluateJavaScript("window.setMouse && window.setMouse(\(p.x), \(p.y))", completionHandler: nil)
    }

    // MARK: Birthday

    func isBirthdayToday() -> Bool {
        guard let b = Birthday.load() else { return false }
        let c = Calendar.current.dateComponents([.month, .day], from: Date())
        return b.days.contains { $0.month == c.month && $0.day == c.day }
    }

    @objc func checkBirthday() {
        let today = isBirthdayToday()
        if today != hatsOn {                                   // party hats all day on the birthday dates
            hatsOn = today
            webView.evaluateJavaScript("window.setBirthdayDay && window.setBirthdayDay(\(today))", completionHandler: nil)
        }
        guard today, panel.isVisible, card == nil, !UserDefaults.standard.bool(forKey: Birthday.thanksKey) else { return }
        if let last = lastBirthdayShown, Date().timeIntervalSince(last) < Birthday.remindEvery { return }
        playBirthday()
    }

    /// Confetti and a toast from Barry and Nom, plus the message card.
    @objc func playBirthday() {
        guard Birthday.load() != nil else { openSettings(); return }   // nothing set up yet
        lastBirthdayShown = Date()
        if !panel.isVisible { panel.orderFrontRegardless(); toggleItem.title = "Hide Buddies" }
        webView.evaluateJavaScript("window.playBirthday && window.playBirthday()", completionHandler: nil)
        showCard()
    }

    @objc func acknowledgeBirthday() {
        UserDefaults.standard.set(true, forKey: Birthday.thanksKey)
        settingsModel?.thanked = true
        webView.evaluateJavaScript("window.birthdayThanks && window.birthdayThanks()", completionHandler: nil)
        closeCard()
    }

    @objc func replayBirthday() {
        lastBirthdayShown = Date()
        webView.evaluateJavaScript("window.playBirthday && window.playBirthday()", completionHandler: nil)
    }

    @objc func closeCard() {
        cardTimer?.invalidate(); cardTimer = nil
        card?.orderOut(nil); card = nil
    }

    func showCard() {
        if let card { card.orderFrontRegardless(); return }
        guard let b = Birthday.load() else { return }
        let w: CGFloat = 340, h: CGFloat = 168
        let c = CardPanel(contentRect: NSRect(x: 0, y: 0, width: w, height: h),
                          styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        c.isOpaque = false
        c.backgroundColor = .clear
        c.hasShadow = true
        c.level = panel.level
        c.collectionBehavior = panel.collectionBehavior

        let bg = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: w, height: h))
        bg.material = .popover
        bg.state = .active
        bg.wantsLayer = true
        bg.layer?.cornerRadius = 16
        bg.layer?.masksToBounds = true

        let title = NSTextField(labelWithString: b.title)
        title.font = .systemFont(ofSize: 18, weight: .semibold)
        title.alignment = .center
        let body = NSTextField(wrappingLabelWithString: b.message)
        body.font = .systemFont(ofSize: 13)
        body.alignment = .center
        body.preferredMaxLayoutWidth = w - 40

        let thanks = NSButton(title: "Thank you 💛", target: self, action: #selector(acknowledgeBirthday))
        thanks.bezelStyle = .rounded
        thanks.keyEquivalent = "\r"
        let again = NSButton(title: "Play again", target: self, action: #selector(replayBirthday))
        again.bezelStyle = .rounded
        let later = NSButton(title: "Later", target: self, action: #selector(closeCard))
        later.bezelStyle = .rounded
        let buttons = NSStackView(views: [later, again, thanks])
        buttons.orientation = .horizontal
        buttons.spacing = 8

        let stack = NSStackView(views: [title, body, buttons])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        bg.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: bg.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: bg.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: bg.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: bg.trailingAnchor, constant: -16),
        ])
        c.contentView = bg
        bg.layoutSubtreeIfNeeded()
        c.setContentSize(NSSize(width: w, height: max(h, stack.fittingSize.height + 40)))

        // just above the buddies, kept on screen
        let screen = panel.screen ?? NSScreen.main
        var x = panel.frame.midX - w / 2
        if let s = screen?.visibleFrame { x = min(max(x, s.minX + 8), s.maxX - w - 8) }
        c.setFrameOrigin(NSPoint(x: x, y: panel.frame.maxY + 4))
        c.orderFrontRegardless()
        card = c
        // tidy away after a minute if nobody answers; it comes back an hour later
        cardTimer = Timer.scheduledTimer(timeInterval: 60, target: self, selector: #selector(closeCard), userInfo: nil, repeats: false)
    }

    // MARK: Updates

    @objc func autoCheckForUpdates() { Task { await checkForUpdates(manual: false) } }
    @objc func manualCheckForUpdates() { Task { await checkForUpdates(manual: true) } }

    /// Looks at the latest GitHub release; if it's newer, downloads it, swaps it in and relaunches.
    func checkForUpdates(manual: Bool) async {
        if updating { return }
        updating = true
        defer { updating = false }
        do {
            var req = URLRequest(url: URL(string: "https://api.github.com/repos/\(Updates.repo)/releases/latest")!)
            req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            req.cachePolicy = .reloadIgnoringLocalCacheData
            let (data, _) = try await URLSession.shared.data(for: req)
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag = json["tag_name"] as? String else { throw URLError(.badServerResponse) }
            let latest = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
            guard Updates.isNewer(latest, than: Updates.currentVersion) else {
                if manual { tell("You're up to date", "Dock Buddies \(Updates.currentVersion) is the latest version.") }
                return
            }
            let assets = json["assets"] as? [[String: Any]] ?? []
            guard let asset = assets.first(where: { ($0["name"] as? String) == Updates.assetName }),
                  let link = asset["browser_download_url"] as? String, let url = URL(string: link)
            else { throw URLError(.fileDoesNotExist) }

            let (zip, _) = try await URLSession.shared.download(from: url)
            let work = FileManager.default.temporaryDirectory.appendingPathComponent("DockBuddiesUpdate-\(UUID().uuidString)")
            try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
            let zipPath = work.appendingPathComponent("update.zip")
            try FileManager.default.moveItem(at: zip, to: zipPath)
            try run("/usr/bin/ditto", ["-x", "-k", zipPath.path, work.path])
            guard let newApp = try FileManager.default.contentsOfDirectory(at: work, includingPropertiesForKeys: nil)
                    .first(where: { $0.pathExtension == "app" }) else { throw URLError(.cannotDecodeContentData) }

            let current = Bundle.main.bundleURL
            guard FileManager.default.isWritableFile(atPath: current.deletingLastPathComponent().path) else {
                if manual { tell("Can't update here", "Dock Buddies can't replace itself in \(current.deletingLastPathComponent().path). Move it to Applications and try again.") }
                return
            }
            if manual { tell("Updating to \(latest)", "Dock Buddies will restart in a moment.") }
            // A tiny helper swaps the app once this copy has quit, then opens the new one.
            let script = """
            while kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do sleep 0.3; done
            rm -rf "\(current.path)"
            mv "\(newApp.path)" "\(current.path)"
            xattr -dr com.apple.quarantine "\(current.path)" 2>/dev/null
            open "\(current.path)"
            rm -rf "\(work.path)"
            """
            let helper = Process()
            helper.executableURL = URL(fileURLWithPath: "/bin/bash")
            helper.arguments = ["-c", script]
            try helper.run()
            NSApp.terminate(nil)
        } catch {
            if manual { tell("Couldn't check for updates", "Please check the internet connection and try again.\n(\(error.localizedDescription))") }
        }
    }

    func run(_ tool: String, _ args: [String]) throws {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        try p.run()
        p.waitUntilExit()
        if p.terminationStatus != 0 { throw URLError(.cannotDecodeContentData) }
    }

    func tell(_ title: String, _ text: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        NSApp.activate(ignoringOtherApps: true)
        a.runModal()
    }

    @objc func doActivity(_ sender: NSMenuItem) {
        guard let name = sender.representedObject as? String else { return }
        if !panel.isVisible { toggleVisible() }
        webView.evaluateJavaScript("window.doActivity && window.doActivity('\(name)')", completionHandler: nil)
    }

    @objc func toggleVisible() {
        if panel.isVisible {
            panel.orderOut(nil)
            toggleItem.title = "Show Buddies"
        } else {
            panel.orderFrontRegardless()
            toggleItem.title = "Hide Buddies"
        }
    }
}

@main
struct DockBuddiesApp {
    // Keeps the delegate alive for the life of the app.
    @MainActor static var delegate: AppDelegate?

    @MainActor static func main() {
        let app = NSApplication.shared
        let d = AppDelegate()
        delegate = d
        app.delegate = d
        // An (invisible) Edit menu, so ⌘C / ⌘V / ⌘Z work in the Settings text boxes.
        let mainMenu = NSMenu()
        let editHolder = mainMenu.addItem(withTitle: "Edit", action: nil, keyEquivalent: "")
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editHolder.submenu = edit
        app.mainMenu = mainMenu
        app.setActivationPolicy(.accessory)   // no Dock icon of its own; lives in the menu bar
        app.run()
    }
}
