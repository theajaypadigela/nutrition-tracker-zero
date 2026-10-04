import Foundation

/// Durable hand-off between CallKit callbacks and React Native.
///
/// CallKit actions may occur while JS is paused or before it has registered event listeners. The
/// event stream is therefore only a wake-up/fast path; these values are the authoritative result
/// and mirror Android's SharedPreferences-backed `IncomingCallStore` contract.
final class IncomingCallStore {
  static let shared = IncomingCallStore()

  private enum Key {
    static let pendingAnswer = "ios_incoming_call_pending_answer"
    static let pendingHangup = "ios_incoming_call_pending_hangup"
    static let markers = "ios_incoming_call_markers"
    static let pendingMissedAction = "ios_incoming_call_pending_missed_action"
    static let recentResults = "ios_incoming_call_recent_results"
    static let voipToken = "ios_voip_push_token"
  }

  private let defaults: UserDefaults
  private let lock = NSLock()
  private let recentResultLifetime: TimeInterval = 10 * 60
  private let maximumMarkerCount = 50

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  func setPendingAnswer(_ payloadJson: String) {
    withLock {
      defaults.set(payloadJson, forKey: Key.pendingAnswer)
    }
  }

  func consumePendingAnswer() -> String? {
    withLock {
      let value = defaults.string(forKey: Key.pendingAnswer)
      defaults.removeObject(forKey: Key.pendingAnswer)
      return value
    }
  }

  func setPendingHangup(_ payloadJson: String) {
    withLock {
      defaults.set(payloadJson, forKey: Key.pendingHangup)
    }
  }

  func consumePendingHangup() -> String? {
    withLock {
      let value = defaults.string(forKey: Key.pendingHangup)
      defaults.removeObject(forKey: Key.pendingHangup)
      return value
    }
  }

  func appendMarker(payload: IncomingCallPayload, result: String) {
    guard let marker = payload.marker(result: result) else {
      return
    }

    withLock {
      var markers = readMarkersLocked()

      // CallKit can deliver a timeout/reset immediately after a terminal action. Do not enqueue the
      // same terminal occurrence twice; JS treats one marker as one server-side lifecycle update.
      let isDuplicate = markers.contains { existing in
        let existingResult = existing["result"] as? String
        let existingCallId = Self.stringValue(existing["callId"])
          ?? Self.stringValue(existing["notificationId"])
        let existingFireAt = Self.doubleValue(existing["intendedFireAt"])
        return existingResult == result
          && existingCallId == payload.callId
          && existingFireAt == payload.intendedFireAtMilliseconds
      }
      if isDuplicate {
        return
      }

      markers.append(marker)
      if markers.count > maximumMarkerCount {
        markers = Array(markers.suffix(maximumMarkerCount))
      }
      writeMarkersLocked(markers)
    }
  }

  /// Returns a JSON-array string and atomically clears it, matching Android's bridge API.
  func drainMarkers() -> String {
    withLock {
      let markers = readMarkersLocked()
      defaults.removeObject(forKey: Key.markers)
      guard
        JSONSerialization.isValidJSONObject(markers),
        let data = try? JSONSerialization.data(withJSONObject: markers),
        let json = String(data: data, encoding: .utf8)
      else {
        return "[]"
      }
      return json
    }
  }

  func consumePendingMissedAction() -> String? {
    withLock {
      let value = defaults.string(forKey: Key.pendingMissedAction)
      defaults.removeObject(forKey: Key.pendingMissedAction)
      return value
    }
  }

  func setVoipToken(_ token: String?) {
    withLock {
      if let token, !token.isEmpty {
        defaults.set(token, forKey: Key.voipToken)
      } else {
        defaults.removeObject(forKey: Key.voipToken)
      }
    }
  }

  func voipToken() -> String? {
    withLock {
      defaults.string(forKey: Key.voipToken)
    }
  }

  /// Returns true when this exact occurrence was terminal recently. Entries expire so a recurring
  /// notification id can ring again on its next scheduled occurrence.
  func wasRecentlyFinished(_ dedupeKey: String, now: Date = Date()) -> Bool {
    withLock {
      let recent = readRecentResultsLocked(now: now)
      let finishedAt = recent[dedupeKey]
      writeRecentResultsLocked(recent)
      return finishedAt != nil
    }
  }

  func markRecentlyFinished(_ dedupeKey: String, now: Date = Date()) {
    withLock {
      var recent = readRecentResultsLocked(now: now)
      recent[dedupeKey] = now.timeIntervalSince1970
      writeRecentResultsLocked(recent)
    }
  }

  private func readMarkersLocked() -> [[String: Any]] {
    guard
      let json = defaults.string(forKey: Key.markers),
      let data = json.data(using: .utf8),
      let value = try? JSONSerialization.jsonObject(with: data),
      let markers = value as? [[String: Any]]
    else {
      return []
    }
    return markers
  }

  private func writeMarkersLocked(_ markers: [[String: Any]]) {
    guard
      JSONSerialization.isValidJSONObject(markers),
      let data = try? JSONSerialization.data(withJSONObject: markers),
      let json = String(data: data, encoding: .utf8)
    else {
      return
    }
    defaults.set(json, forKey: Key.markers)
  }

  private func readRecentResultsLocked(now: Date) -> [String: TimeInterval] {
    let cutoff = now.timeIntervalSince1970 - recentResultLifetime
    guard let stored = defaults.dictionary(forKey: Key.recentResults) else {
      return [:]
    }

    var recent: [String: TimeInterval] = [:]
    for (key, value) in stored {
      let timestamp = Self.doubleValue(value) ?? 0
      if timestamp >= cutoff {
        recent[key] = timestamp
      }
    }
    return recent
  }

  private func writeRecentResultsLocked(_ recent: [String: TimeInterval]) {
    defaults.set(recent, forKey: Key.recentResults)
  }

  private func withLock<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  private static func stringValue(_ value: Any?) -> String? {
    if let string = value as? String {
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
}
