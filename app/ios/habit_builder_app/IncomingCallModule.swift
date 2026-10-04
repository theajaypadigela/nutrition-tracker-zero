import AVFAudio
import CallKit
import Foundation
import PushKit
import React
import UIKit

private enum IncomingCallEvent: String, CaseIterable {
  case answered = "IncomingCallAnswered"
  case declined = "IncomingCallDeclined"
  case missed = "IncomingCallMissed"
  case ended = "IncomingCallEnded"
}

private enum IncomingCallResult: String {
  case answered
  case declined
  case missed
  case ended
}

private enum ActiveCallPhase {
  case ringing
  case answered
}

private final class ActiveIncomingCall {
  let uuid: UUID
  let payload: IncomingCallPayload
  var phase: ActiveCallPhase = .ringing
  var timeoutWorkItem: DispatchWorkItem?

  init(uuid: UUID, payload: IncomingCallPayload) {
    self.uuid = uuid
    self.payload = payload
  }
}

private struct NormalizedVoipCall {
  let payload: IncomingCallPayload
  let isUsable: Bool
}

/// Owns the single CallKit provider independently of the React bridge lifetime.
///
/// Important delivery distinction: a local `UNNotificationRequest` cannot wake a terminated app to
/// execute `presentIncomingCall`. Foreground/resident local deliveries may use that bridge method;
/// terminated-app CallKit delivery uses the server's VoIP APNs path registered below. Every PushKit
/// VoIP callback reports a `CXProvider` call before its completion handler is released.
private final class IncomingCallCoordinator: NSObject, CXProviderDelegate, PKPushRegistryDelegate {
  static let shared = IncomingCallCoordinator()

  static let ringTimeout: TimeInterval = 60
  static let staleThresholdMilliseconds: Double = 5 * 60 * 1_000

  /// Called only on the main queue. Persistence always happens before this callback.
  var eventSink: ((IncomingCallEvent, IncomingCallPayload, IncomingCallResult) -> Void)?
  /// Token is persisted before this callback. Nil means PushKit invalidated the prior token.
  var tokenEventSink: ((String?) -> Void)?

  private let provider: CXProvider
  private let store = IncomingCallStore.shared
  private var activeCall: ActiveIncomingCall?
  private var pushRegistry: PKPushRegistry?

  override init() {
    let configuration = CXProviderConfiguration()
    configuration.supportsVideo = false
    configuration.maximumCallGroups = 1
    configuration.maximumCallsPerCallGroup = 1
    configuration.supportedHandleTypes = [.generic]
    configuration.includesCallsInRecents = false
    // A nil custom sound asks CallKit to use the user's system ringtone and system audio policy.
    configuration.ringtoneSound = nil

    provider = CXProvider(configuration: configuration)
    super.init()
    provider.setDelegate(self, queue: .main)
  }

  func startPushRegistry() {
    onMain { [weak self] in
      guard let self, self.pushRegistry == nil else {
        return
      }
      let registry = PKPushRegistry(queue: .main)
      self.pushRegistry = registry
      registry.delegate = self
      registry.desiredPushTypes = [.voIP]
    }
  }

  func present(payloadJson: String) {
    guard let payload = IncomingCallPayload(json: payloadJson) else {
      return
    }
    onMain { [weak self] in
      self?.presentOnMain(
        payload,
        mustReport: false,
        failAfterReport: false,
        reportCompletion: nil
      )
    }
  }

  func dismiss() {
    onMain { [weak self] in
      guard let self, let activeCall = self.activeCall else {
        return
      }
      self.store.markRecentlyFinished(activeCall.payload.dedupeKey)
      self.provider.reportCall(with: activeCall.uuid, endedAt: Date(), reason: .remoteEnded)
      self.clearActiveCall(activeCall)
    }
  }

  private func presentOnMain(
    _ payload: IncomingCallPayload,
    mustReport: Bool,
    failAfterReport: Bool,
    reportCompletion: (() -> Void)?
  ) {
    dispatchPrecondition(condition: .onQueue(.main))

    let isStale = payload.isStale(
      at: Date(),
      thresholdMilliseconds: Self.staleThresholdMilliseconds
    )
    if isStale && !mustReport {
      recordTerminal(payload: payload, result: .missed)
      reportCompletion?()
      return
    }

    if let activeCall, activeCall.payload.dedupeKey == payload.dedupeKey {
      if mustReport {
        // PushKit requires every VoIP push callback to call reportNewIncomingCall. A duplicate APNs
        // delivery therefore always repeats the report. A fallback local call can have a different
        // random UUID; replace it while ringing so the server-supplied UUID becomes authoritative.
        let reportedUUID = payload.callUUID ?? activeCall.uuid
        if reportedUUID != activeCall.uuid, activeCall.phase == .ringing {
          provider.reportCall(with: activeCall.uuid, endedAt: Date(), reason: .remoteEnded)
          clearActiveCall(activeCall)
          // Continue below and install/report the APNs-backed call without recording a false miss.
        } else {
          provider.reportNewIncomingCall(
            with: reportedUUID,
            update: callUpdate(for: payload)
          ) { [weak self] error in
            // If the occurrence was already answered under a local UUID, the APNs UUID still has to
            // be reported, but it must not create a second ringing call alongside the live session.
            if reportedUUID != activeCall.uuid, error == nil {
              self?.provider.reportCall(
                with: reportedUUID,
                endedAt: Date(),
                reason: .answeredElsewhere
              )
            }
            reportCompletion?()
          }
          return
        }
      } else {
        reportCompletion?()
        return
      }
    }
    if store.wasRecentlyFinished(payload.dedupeKey) {
      if mustReport {
        reportAlreadyFinishedVoipCall(
          payload,
          reason: failAfterReport ? .failed : .answeredElsewhere,
          completion: reportCompletion
        )
      } else {
        reportCompletion?()
      }
      return
    }

    // CallKit is configured for one call. Resolve a distinct prior occurrence before reporting the
    // new one so both JS/server lifecycles remain terminal and CallKit never receives two competing
    // incoming calls. An answered call must emit `ended` so JS also stops its Vapi session.
    if let previous = activeCall {
      let endedReason: CXCallEndedReason
      if previous.phase == .ringing {
        recordTerminal(payload: previous.payload, result: .missed)
        endedReason = .unanswered
      } else {
        recordTerminal(payload: previous.payload, result: .ended)
        endedReason = .remoteEnded
      }
      provider.reportCall(with: previous.uuid, endedAt: Date(), reason: endedReason)
      clearActiveCall(previous)
    }

    // A server VoIP push supplies a stable UUID; use it exactly so APNs retries and server-side
    // cancellation correlate with the same CallKit call. JS-only foreground calls may omit it.
    let uuid = payload.callUUID ?? UUID()
    let call = ActiveIncomingCall(uuid: uuid, payload: payload)
    activeCall = call

    provider.reportNewIncomingCall(
      with: uuid,
      update: callUpdate(for: payload)
    ) { [weak self, weak call] error in
      DispatchQueue.main.async {
        guard
          let self,
          let call,
          self.activeCall === call
        else {
          reportCompletion?()
          return
        }
        if error != nil {
          if failAfterReport {
            self.store.markRecentlyFinished(call.payload.dedupeKey)
          } else {
            self.recordTerminal(payload: call.payload, result: .missed)
          }
          self.clearActiveCall(call)
          reportCompletion?()
          return
        }
        if failAfterReport {
          // The OS contract still requires an incoming-call report for malformed VoIP pushes. Once
          // that succeeds, end it as failed without handing an unusable occurrence to JS.
          self.store.markRecentlyFinished(call.payload.dedupeKey)
          self.provider.reportCall(with: call.uuid, endedAt: Date(), reason: .failed)
          self.clearActiveCall(call)
          reportCompletion?()
          return
        }
        if isStale {
          // Even stale VoIP pushes must first be reported to CallKit. End immediately only after the
          // report succeeds, then persist the occurrence as missed.
          self.recordTerminal(payload: call.payload, result: .missed)
          self.provider.reportCall(with: call.uuid, endedAt: Date(), reason: .unanswered)
          self.clearActiveCall(call)
          reportCompletion?()
          return
        }
        self.armTimeout(for: call)
        reportCompletion?()
      }
    }
  }

  private func callUpdate(for payload: IncomingCallPayload) -> CXCallUpdate {
    let update = CXCallUpdate()
    update.localizedCallerName = payload.assistantName
    update.remoteHandle = CXHandle(
      type: .generic,
      value: payload.subtitle.isEmpty ? payload.assistantName : payload.subtitle
    )
    update.hasVideo = false
    update.supportsDTMF = false
    update.supportsHolding = false
    update.supportsGrouping = false
    update.supportsUngrouping = false
    return update
  }

  private func reportAlreadyFinishedVoipCall(
    _ payload: IncomingCallPayload,
    reason: CXCallEndedReason,
    completion: (() -> Void)?
  ) {
    let uuid = payload.callUUID ?? UUID()
    provider.reportNewIncomingCall(with: uuid, update: callUpdate(for: payload)) { [weak self] error in
      if error == nil {
        self?.provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
      }
      completion?()
    }
  }

  private func armTimeout(for call: ActiveIncomingCall) {
    call.timeoutWorkItem?.cancel()
    let item = DispatchWorkItem { [weak self, weak call] in
      guard
        let self,
        let call,
        self.activeCall === call,
        call.phase == .ringing
      else {
        return
      }
      self.recordTerminal(payload: call.payload, result: .missed)
      self.provider.reportCall(with: call.uuid, endedAt: Date(), reason: .unanswered)
      self.clearActiveCall(call)
    }
    call.timeoutWorkItem = item
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.ringTimeout, execute: item)
  }

  private func recordTerminal(payload: IncomingCallPayload, result: IncomingCallResult) {
    switch result {
    case .answered:
      store.setPendingAnswer(payload.raw)
    case .declined, .missed:
      store.appendMarker(payload: payload, result: result.rawValue)
    case .ended:
      store.setPendingHangup(payload.raw)
    }
    store.markRecentlyFinished(payload.dedupeKey)

    let event: IncomingCallEvent
    switch result {
    case .answered:
      event = .answered
    case .declined:
      event = .declined
    case .missed:
      event = .missed
    case .ended:
      event = .ended
    }
    eventSink?(event, payload, result)
  }

  private func clearActiveCall(_ call: ActiveIncomingCall) {
    call.timeoutWorkItem?.cancel()
    call.timeoutWorkItem = nil
    if activeCall === call {
      activeCall = nil
    }
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  // MARK: - PKPushRegistryDelegate

  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else {
      return
    }
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    guard !token.isEmpty else {
      return
    }
    let changed = store.voipToken() != token
    store.setVoipToken(token)
    if changed {
      // Never log the token. It is an authentication-adjacent device identifier and only flows
      // through the durable getter/event into the authenticated backend registration call.
      tokenEventSink?(token)
    }
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else {
      return
    }
    store.setVoipToken(nil)
    tokenEventSink?(nil)
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith pushPayload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }

    // Normalization always creates a valid descriptor and UUID, even for a partially malformed
    // payload. Apple requires every VoIP push to report a CallKit call promptly; validation must
    // never return early and release completion without reportNewIncomingCall.
    let normalized = normalizedVoipPayload(pushPayload)
    presentOnMain(
      normalized.payload,
      mustReport: true,
      failAfterReport: !normalized.isUsable,
      reportCompletion: completion
    )
  }

  private func normalizedVoipPayload(_ pushPayload: PKPushPayload) -> NormalizedVoipCall {
    let root = Self.stringKeyedDictionary(pushPayload.dictionaryPayload)
    let nested = Self.stringKeyedDictionary(root["data"])

    func value(_ key: String) -> Any? {
      root[key] ?? nested[key]
    }

    let suppliedUUID = Self.stringValue(value("callUUID")).flatMap(UUID.init(uuidString:))
    let uuid = suppliedUUID ?? UUID()
    let rawType = Self.stringValue(value("type"))
    let rawKind = Self.stringValue(value("kind"))
      ?? Self.stringValue(value("reminderKind"))
    let kind = rawKind ?? (rawType == "meal" ? "meal-call" : "habit-call")
    let type = rawType ?? (kind == "meal-call" ? "meal" : "habit")
    let habitName = Self.stringValue(value("habitName"))
    let assistantName = Self.stringValue(value("assistantName")) ?? "AI Assistant"
    let subtitle = Self.stringValue(value("subtitle"))
      ?? habitName
      ?? (type == "meal" ? "Meal check-in" : "Habit check-in")
    let intendedFireAt = Self.doubleValue(value("intendedFireAt"))
    let hasOccurrenceIdentity = Self.stringValue(value("habitId")) != nil
      || Self.stringValue(value("slotKey")) != nil
      || Self.stringValue(value("mealSlotId")) != nil
    let isUsable = suppliedUUID != nil
      && (type == "habit" || type == "meal")
      && (kind == "habit-call" || kind == "meal-call")
      && (intendedFireAt ?? 0) > 0
      && hasOccurrenceIdentity

    // Keep this list explicit: APNs' `aps` dictionary is not part of the JS occurrence contract,
    // and copying arbitrary payload objects can make JSONSerialization fail before CallKit report.
    var normalized: [String: Any] = [
      "callUUID": uuid.uuidString,
      "callId": Self.stringValue(value("callId")) ?? uuid.uuidString,
      "notificationId": Self.stringValue(value("notificationId")) ?? uuid.uuidString,
      "type": type,
      "kind": kind,
      "reminderKind": kind,
      "assistantName": assistantName,
      "subtitle": subtitle,
    ]
    for key in [
      "habitId",
      "habitName",
      "habitTime",
      "intendedFireAt",
      "slotKey",
      "mealSlotId",
      "isRescheduled",
    ] {
      if let candidate = value(key), Self.isJsonScalar(candidate) {
        normalized[key] = candidate
      }
    }

    // The dictionary above contains only JSON scalars and cannot fail. Keep a hard fallback anyway
    // so a future field change still honors PushKit's report-every-push requirement.
    let json: String
    if
      let data = try? JSONSerialization.data(withJSONObject: normalized),
      let encoded = String(data: data, encoding: .utf8)
    {
      json = encoded
    } else {
      json = "{\"callUUID\":\"\(uuid.uuidString)\",\"callId\":\"\(uuid.uuidString)\",\"notificationId\":\"\(uuid.uuidString)\",\"type\":\"habit\",\"kind\":\"habit-call\",\"reminderKind\":\"habit-call\",\"assistantName\":\"AI Assistant\",\"subtitle\":\"Habit check-in\"}"
    }
    // The generated fallback is valid by construction.
    return NormalizedVoipCall(payload: IncomingCallPayload(json: json)!, isUsable: isUsable)
  }

  private static func stringKeyedDictionary(_ value: Any?) -> [String: Any] {
    guard let dictionary = value as? [AnyHashable: Any] else {
      return [:]
    }
    var result: [String: Any] = [:]
    for (key, item) in dictionary {
      result[String(describing: key)] = item
    }
    return result
  }

  private static func stringValue(_ value: Any?) -> String? {
    if let string = value as? String, !string.isEmpty {
      return string
    }
    if let number = value as? NSNumber {
      return number.stringValue
    }
    return nil
  }

  private static func doubleValue(_ value: Any?) -> Double? {
    if let number = value as? NSNumber {
      return number.doubleValue
    }
    if let string = value as? String {
      return Double(string)
    }
    return nil
  }

  private static func isJsonScalar(_ value: Any) -> Bool {
    value is String || value is NSNumber
  }

  // MARK: - CXProviderDelegate

  func providerDidReset(_ provider: CXProvider) {
    guard let call = activeCall else {
      return
    }
    if call.phase == .ringing {
      recordTerminal(payload: call.payload, result: .missed)
    } else {
      recordTerminal(payload: call.payload, result: .ended)
    }
    clearActiveCall(call)
  }

  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    guard
      let call = activeCall,
      call.uuid == action.callUUID,
      call.phase == .ringing
    else {
      action.fail()
      return
    }

    call.phase = .answered
    call.timeoutWorkItem?.cancel()
    call.timeoutWorkItem = nil

    // Persist first, then emit. The JS event handler can safely consume the authoritative value,
    // and mount/AppState recovery still works if JS was suspended when the action arrived.
    recordTerminal(payload: call.payload, result: .answered)
    action.fulfill(withDateConnected: Date())
    // Keep the CallKit call active while Vapi runs. This preserves the OS VoIP/audio execution
    // grant in background. JS calls dismissIncomingCall when Vapi ends or fails to start.
  }

  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    guard let call = activeCall, call.uuid == action.callUUID else {
      // CallKit may race our immediate post-answer reportCall cleanup. The call is already ended.
      action.fulfill()
      return
    }

    if call.phase == .ringing {
      recordTerminal(payload: call.payload, result: .declined)
    } else {
      // The user hung up from the system CallKit surface after answering. This is not a decline:
      // persist + emit a distinct ended result so JS can stop the active Vapi session.
      recordTerminal(payload: call.payload, result: .ended)
    }
    clearActiveCall(call)
    action.fulfill()
  }

  func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
    guard
      let callAction = action as? CXCallAction,
      let call = activeCall,
      call.uuid == callAction.callUUID
    else {
      action.fail()
      return
    }

    if call.phase == .ringing {
      recordTerminal(payload: call.payload, result: .missed)
    } else {
      recordTerminal(payload: call.payload, result: .ended)
    }
    clearActiveCall(call)
    action.fail()
  }

  func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    // Vapi/Daily owns its WebRTC audio session. CallKit activation is intentionally not modified.
  }

  func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    // Vapi/Daily owns its WebRTC audio session. CallKit deactivation is intentionally not modified.
  }
}

/// AppDelegate entry point kept separate from the React module so PushKit registration starts at
/// process launch, including a terminated-app launch caused by a VoIP push.
enum IncomingCallBootstrap {
  static func startPushKit() {
    IncomingCallCoordinator.shared.startPushRegistry()
  }
}

/// React Native bridge. The method names and persisted return values intentionally match the
/// Android `IncomingCall` module so the TypeScript wrapper can be platform-neutral.
@objc(IncomingCall)
final class IncomingCallModule: RCTEventEmitter {
  private var hasListeners = false
  private let coordinator = IncomingCallCoordinator.shared
  private let store = IncomingCallStore.shared

  override init() {
    super.init()
    coordinator.eventSink = { [weak self] event, payload, result in
      guard let self, self.hasListeners else {
        return
      }
      self.sendEvent(
        withName: event.rawValue,
        body: [
          "callId": payload.callId,
          "payloadJson": payload.raw,
          "result": result.rawValue,
        ]
      )
    }
    coordinator.tokenEventSink = { [weak self] token in
      guard let self, self.hasListeners else {
        return
      }
      self.sendEvent(
        withName: "VoipTokenUpdated",
        body: ["token": (token as Any?) ?? NSNull()]
      )
    }
  }

  @objc override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    IncomingCallEvent.allCases.map(\.rawValue) + ["VoipTokenUpdated"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc(presentIncomingCall:)
  func presentIncomingCall(_ payloadJson: String) {
    coordinator.present(payloadJson: payloadJson)
  }

  @objc
  func dismissIncomingCall() {
    coordinator.dismiss()
  }

  @objc(consumePendingAnswer:rejecter:)
  func consumePendingAnswer(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(store.consumePendingAnswer())
  }

  @objc(consumePendingHangup:rejecter:)
  func consumePendingHangup(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(store.consumePendingHangup())
  }

  @objc(drainCallMarkers:rejecter:)
  func drainCallMarkers(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(store.drainMarkers())
  }

  @objc(consumePendingMissedAction:rejecter:)
  func consumePendingMissedAction(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(store.consumePendingMissedAction())
  }

  @objc(getVoipToken:rejecter:)
  func getVoipToken(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(store.voipToken())
  }

  /// Android 14's special full-screen-intent grant has no iOS equivalent. CallKit availability is
  /// governed by the OS and `reportNewIncomingCall`'s completion, so this parity API resolves true.
  @objc(canUseFullScreenIntent:rejecter:)
  func canUseFullScreenIntent(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(true)
  }

  /// No-op parity method: iOS has no per-app full-screen-intent settings page.
  @objc
  func openFullScreenIntentSettings() {}
}
