import Foundation
import UserNotifications

/// The system delivers repeating calendar reminders even when the app has been swiped away.
/// This is the free local-notification path: there is no APNs token, server job, or VoIP push.
/// The delegate is installed before React Native; answers are durable while the bundle loads.
final class NativeCallScheduler: NSObject, UNUserNotificationCenterDelegate {
  static let shared = NativeCallScheduler()
  private let center = UNUserNotificationCenter.current()
  private let defaults = UserDefaults.standard
  private let ids = ["call-daily", "call-test"]
  private let prefix = "native-"
  private let category = "food-check-in"

  func install() {
    // Notifee retains/forwards to this original delegate for notifications it does not own.
    center.delegate = self
    center.getNotificationCategories { [weak self] existing in
      guard let self else { return }
      let answer = UNNotificationAction(identifier: "answer", title: "Answer", options: [.foreground])
      let reminder = UNNotificationCategory(identifier: self.category, actions: [answer],
        intentIdentifiers: [], options: [.customDismissAction])
      self.center.setNotificationCategories(existing.union([reminder]))
    }
  }

  func schedule(_ json: String, completion: @escaping (Result<Double, Error>) -> Void) {
    do {
      guard let data = json.data(using: .utf8),
        let options = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let id = options["id"] as? String, ids.contains(id),
        let repeating = options["repeatDaily"] as? Bool,
        var payload = options["payload"] as? [String: Any],
        let fireAt = options["fireAt"] as? Double, fireAt.isFinite
      else { throw failure("Invalid reminder") }

      let trigger: UNCalendarNotificationTrigger
      if repeating {
        guard id == "call-daily", let time = options["callTime"] as? String,
          time.range(of: "^([01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil,
          let zoneName = options["timezone"] as? String, let zone = TimeZone(identifier: zoneName)
        else { throw failure("Invalid reminder time or time zone") }
        let parts = time.split(separator: ":").compactMap { Int($0) }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        var matching = DateComponents()
        matching.calendar = calendar
        matching.timeZone = zone
        matching.hour = parts[0]
        matching.minute = parts[1]
        matching.second = 0
        trigger = UNCalendarNotificationTrigger(dateMatching: matching, repeats: true)
        // A repeating content payload must not contain day one's epoch. The response delegate
        // stamps the actual delivered occurrence (UNNotification.date), including after DST.
        payload.removeValue(forKey: "intendedFireAt")
      } else {
        let date = Date(timeIntervalSince1970: fireAt / 1_000)
        guard date > Date() else { throw failure("Reminder time must be in the future") }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        var matching = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        matching.calendar = calendar
        matching.timeZone = calendar.timeZone
        trigger = UNCalendarNotificationTrigger(dateMatching: matching, repeats: false)
      }
      guard let next = trigger.nextTriggerDate() else { throw failure("No next reminder occurrence") }
      let revision = UUID().uuidString
      let content = UNMutableNotificationContent()
      content.title = "Food check-in"
      content.body = "What did you eat today? Tap to start your voice log."
      content.sound = .default
      content.categoryIdentifier = category
      // Normal local sound notifications work with free signing. Time Sensitive / Critical
      // Alert entitlements are not required; Focus and the user's notification settings apply.
      content.interruptionLevel = .active
      content.userInfo = ["payload": payload, "scheduleId": id, "revision": revision]
      if repeating {
        content.userInfo["callTime"] = options["callTime"]
        content.userInfo["timezone"] = options["timezone"]
      }
      let request = UNNotificationRequest(identifier: prefix + id, content: content, trigger: trigger)
      center.getPendingNotificationRequests { [self] pending in
        if repeating, let existing = pending.first(where: { $0.identifier == request.identifier }),
          existing.content.userInfo["callTime"] as? String == options["callTime"] as? String,
          existing.content.userInfo["timezone"] as? String == options["timezone"] as? String,
          existing.content.userInfo["revision"] as? String == defaults.string(forKey: "reminder-revision-" + id),
          let calendarTrigger = existing.trigger as? UNCalendarNotificationTrigger,
          let next = calendarTrigger.nextTriggerDate() {
          // Resuming/cold launching from a tap must not invalidate that notification's revision
          // or cancel an occurrence at the current minute. An unchanged daily request is kept.
          completion(.success(next.timeIntervalSince1970 * 1_000))
          return
        }
        center.add(request) { [self] error in
          if let error { completion(.failure(error)); return }
          defaults.set(revision, forKey: "reminder-revision-" + id)
          center.removeDeliveredNotifications(withIdentifiers: [prefix + id])
          completion(.success(next.timeIntervalSince1970 * 1_000))
        }
      }
    } catch { completion(.failure(error)) }
  }

  func cancel(_ id: String) throws {
    guard ids.contains(id) else { throw failure("Unknown reminder id") }
    defaults.removeObject(forKey: "reminder-revision-" + id)
    center.removePendingNotificationRequests(withIdentifiers: [prefix + id])
    center.removeDeliveredNotifications(withIdentifiers: [prefix + id])
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler(notification.request.identifier.hasPrefix(prefix + "call-") ? [.banner, .list, .sound] : [])
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    defer { completionHandler() }
    let notification = response.notification
    let info = notification.request.content.userInfo
    guard notification.request.identifier.hasPrefix(prefix + "call-"),
      let id = info["scheduleId"] as? String,
      let revision = info["revision"] as? String,
      defaults.string(forKey: "reminder-revision-" + id) == revision,
      var payload = info["payload"] as? [String: Any]
    else { return }
    payload["intendedFireAt"] = notification.date.timeIntervalSince1970 * 1_000
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
      let json = String(data: data, encoding: .utf8)
    else { return }
    if response.actionIdentifier == UNNotificationDefaultActionIdentifier || response.actionIdentifier == "answer" {
      IncomingCallBootstrap.answerLocalReminder(json)
    } else if response.actionIdentifier == UNNotificationDismissActionIdentifier,
      let descriptor = IncomingCallPayload(json: json) {
      IncomingCallStore.shared.appendMarker(payload: descriptor, result: "declined")
    }
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "FoodReminder", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
