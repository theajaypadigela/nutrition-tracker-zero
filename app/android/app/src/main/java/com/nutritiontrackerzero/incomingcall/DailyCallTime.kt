package com.nutritiontrackerzero.incomingcall

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone

/** Recompute the wall-clock occurrence each day rather than adding 24h (which drifts at DST). */
object DailyCallTime {
  fun nextOccurrence(callTime: String, timezone: String, after: Long): Long {
    require(Regex("^([01]\\d|2[0-3]):[0-5]\\d$").matches(callTime)) { "Invalid call time" }
    require(TimeZone.getAvailableIDs().contains(timezone)) { "Invalid time zone" }
    val parts = callTime.split(':').map(String::toInt)
    val zone = TimeZone.getTimeZone(timezone)
    val date = GregorianCalendar(zone).apply { timeInMillis = after }
    for (offset in 0..2) {
      val candidate = GregorianCalendar(zone).apply {
        clear()
        set(date.get(Calendar.YEAR), date.get(Calendar.MONTH), date.get(Calendar.DAY_OF_MONTH) + offset,
          parts[0], parts[1], 0)
      }.timeInMillis
      if (candidate > after) return candidate
    }
    error("No next daily occurrence")
  }
}
