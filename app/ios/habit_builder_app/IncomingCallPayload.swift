import Foundation

/// The subset of the JS call descriptor that CallKit needs to render an incoming call.
///
/// `raw` is deliberately retained verbatim. Answer/decline/missed hand-offs return that same JSON
/// to React Native, so native code never needs to understand occurrence-specific fields such as
/// `habitId`, `slotKey`, or `isRescheduled`.
struct IncomingCallPayload {
  let callId: String
  let callUUID: UUID?
  let assistantName: String
  let subtitle: String
  let kind: String
  let slotKey: String?
  let intendedFireAtMilliseconds: Double?
  let raw: String

  /// A notification id is reused for recurring reminders, so include the occurrence epoch when it
  /// is available. This prevents duplicate foreground/background delivery for one occurrence while
  /// still allowing tomorrow's call to use the same notification id.
  var dedupeKey: String {
    if let slotKey, let intendedFireAtMilliseconds {
      return "\(kind)|\(slotKey)|\(Int64(intendedFireAtMilliseconds))"
    }
    guard let intendedFireAtMilliseconds else {
      return callId
    }
    return "\(callId)|\(Int64(intendedFireAtMilliseconds))"
  }

  init?(json: String) {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data),
      let dictionary = object as? [String: Any]
    else {
      return nil
    }

    let type = Self.stringValue(dictionary["type"])
    let reminderKind = Self.stringValue(dictionary["kind"])
      ?? Self.stringValue(dictionary["reminderKind"])
    let resolvedKind = reminderKind ?? (type == "meal" ? "meal-call" : "habit-call")
    let rawCallUUID = Self.stringValue(dictionary["callUUID"])
    let fallbackCallId = Self.stringValue(dictionary["notificationId"])
      ?? rawCallUUID
      ?? "\(type ?? "incoming")-call"

    callId = Self.stringValue(dictionary["callId"]) ?? fallbackCallId
    callUUID = rawCallUUID.flatMap(UUID.init(uuidString:))
    assistantName = Self.stringValue(dictionary["assistantName"]) ?? "AI Assistant"
    subtitle = Self.stringValue(dictionary["subtitle"])
      ?? (resolvedKind == "meal-call" ? "Meal check-in" : "Habit check-in")
    kind = resolvedKind
    slotKey = Self.stringValue(dictionary["slotKey"])
    intendedFireAtMilliseconds = Self.doubleValue(dictionary["intendedFireAt"])
    raw = json
  }

  /// Defends against a delayed JS delivery presenting yesterday's reminder as a live CallKit call.
  /// JS performs the same five-minute freshness check; keeping it here makes the native boundary
  /// safe if a caller invokes the module directly or a duplicate lifecycle callback arrives late.
  func isStale(at date: Date, thresholdMilliseconds: Double) -> Bool {
    guard let intendedFireAtMilliseconds else {
      return false
    }
    let nowMilliseconds = date.timeIntervalSince1970 * 1_000
    return nowMilliseconds - intendedFireAtMilliseconds > thresholdMilliseconds
  }

  func marker(result: String) -> [String: Any]? {
    guard
      let data = raw.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data),
      var dictionary = object as? [String: Any]
    else {
      return nil
    }
    dictionary["result"] = result
    return dictionary
  }

  private static func stringValue(_ value: Any?) -> String? {
    guard let value else {
      return nil
    }
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
}
