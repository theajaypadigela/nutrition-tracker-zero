package com.nutritiontrackerzero.incomingcall

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Tiny SharedPreferences hand-off between the native call surface and JS. Survives process
 * death, so an answer/decline that happens while the app is killed is picked up when React
 * Native next runs (mirrors the pendingAnswer/missed store philosophy on the JS side):
 *  - pendingAnswer: the payload of a call the user ACCEPTED → JS navigates into the session.
 *  - markers: payloads of calls the user DECLINED or MISSED (rang out) → JS reports the terminal
 *    status to the server and (for misses) dedupes the follow-up notification.
 *  - pendingMissedAction: the payload of a missed-call follow-up the user tapped "Log now" on →
 *    JS routes into the voice log for that occurrence.
 */
object IncomingCallStore {
  private const val PREFS = "incoming_call_store"
  private const val KEY_PENDING_ANSWER = "pending_answer"
  private const val KEY_MARKERS = "markers"
  private const val KEY_PENDING_MISSED_ACTION = "pending_missed_action"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun setPendingAnswer(context: Context, payloadJson: String) {
    prefs(context).edit().putString(KEY_PENDING_ANSWER, payloadJson).apply()
  }

  /** Returns the accepted-call payload JSON (and clears it), or null. */
  fun consumePendingAnswer(context: Context): String? {
    val p = prefs(context)
    val value = p.getString(KEY_PENDING_ANSWER, null)
    if (value != null) {
      p.edit().remove(KEY_PENDING_ANSWER).apply()
    }
    return value
  }

  /** Appends a terminal marker (the call payload + a `result` field) for JS to drain. */
  fun addMarker(context: Context, payloadJson: String, result: String) {
    val p = prefs(context)
    val arr =
      try {
        JSONArray(p.getString(KEY_MARKERS, "[]"))
      } catch (e: Exception) {
        JSONArray()
      }
    val obj =
      try {
        JSONObject(payloadJson)
      } catch (e: Exception) {
        JSONObject()
      }
    obj.put("result", result)
    arr.put(obj)
    p.edit().putString(KEY_MARKERS, arr.toString()).apply()
  }

  /** Returns the JSON-array string of pending markers and clears the store. */
  fun drainMarkers(context: Context): String {
    val p = prefs(context)
    val markers = p.getString(KEY_MARKERS, "[]") ?: "[]"
    p.edit().remove(KEY_MARKERS).apply()
    return markers
  }

  /** The "Log now"/tapped missed-call follow-up the user wants to act on. */
  fun setPendingMissedAction(context: Context, payloadJson: String) {
    prefs(context).edit().putString(KEY_PENDING_MISSED_ACTION, payloadJson).apply()
  }

  /** Returns the pending missed-action payload JSON (and clears it), or null. */
  fun consumePendingMissedAction(context: Context): String? {
    val p = prefs(context)
    val value = p.getString(KEY_PENDING_MISSED_ACTION, null)
    if (value != null) {
      p.edit().remove(KEY_PENDING_MISSED_ACTION).apply()
    }
    return value
  }
}
