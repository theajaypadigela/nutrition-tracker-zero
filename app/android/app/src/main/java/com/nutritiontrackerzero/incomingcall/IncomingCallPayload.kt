package com.nutritiontrackerzero.incomingcall

import org.json.JSONObject

/**
 * The display fields the native call surface needs, parsed from the JSON payload JS sends to
 * IncomingCallModule.presentIncomingCall. The original JSON string (`raw`) is preserved and
 * handed back to JS verbatim on answer/decline, so the native side never has to understand the
 * occurrence-specific fields (habitId, slotKey, intendedFireAt, …) — it just relays them.
 */
data class IncomingCallPayload(
  val callId: String,
  val assistantName: String,
  val subtitle: String,
  val verifiedLabel: String,
  /** Reminder kind ("meal-call" / "habit-call"); drives meal-vs-habit copy on the missed notice. */
  val kind: String,
  val raw: String,
) {
  /** True when this is a meal-logging call (vs a habit call). */
  val isMeal: Boolean
    get() = kind == "meal-call"

  companion object {
    fun fromJson(json: String?): IncomingCallPayload? {
      if (json.isNullOrBlank()) return null
      return try {
        val o = JSONObject(json)
        val type = o.optString("type", "")
        val kind =
          o.optString("kind").ifBlank {
            o.optString("reminderKind").ifBlank {
              if (type == "meal") "meal-call" else "habit-call"
            }
          }
        IncomingCallPayload(
          callId = o.optString("callId").ifBlank { o.optString("notificationId", "call") },
          assistantName = o.optString("assistantName", "AI Assistant"),
          subtitle = o.optString("subtitle", ""),
          verifiedLabel = o.optString("verifiedLabel", "AI • Verified"),
          kind = kind,
          raw = json,
        )
      } catch (e: Exception) {
        null
      }
    }
  }
}
