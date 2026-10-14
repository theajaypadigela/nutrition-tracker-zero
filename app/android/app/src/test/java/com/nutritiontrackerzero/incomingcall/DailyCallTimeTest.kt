package com.nutritiontrackerzero.incomingcall

import org.junit.Assert.assertEquals
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.TimeZone

class DailyCallTimeTest {
  private fun epoch(value: String) = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'").apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }.parse(value)!!.time

  @Test fun profileZoneIsIndependentOfDeviceZone() {
    val previous = TimeZone.getDefault()
    try {
      TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"))
      assertEquals(epoch("2026-10-04T14:30:00Z"),
        DailyCallTime.nextOccurrence("20:00", "Asia/Kolkata", epoch("2026-10-04T06:00:00Z")))
    } finally { TimeZone.setDefault(previous) }
  }

  @Test fun advancesAfterTodaysExactMinute() {
    assertEquals(epoch("2026-10-05T14:30:00Z"),
      DailyCallTime.nextOccurrence("20:00", "Asia/Kolkata", epoch("2026-10-04T14:30:00Z")))
  }

  @Test fun repeatsThroughSpringAndAutumnDstWithout24HourDrift() {
    val saturday = DailyCallTime.nextOccurrence("20:00", "America/New_York", epoch("2026-03-07T12:00:00Z"))
    assertEquals(epoch("2026-03-08T01:00:00Z"), saturday)
    assertEquals(epoch("2026-03-09T00:00:00Z"), DailyCallTime.nextOccurrence("20:00", "America/New_York", saturday))
    assertEquals(epoch("2026-11-02T01:00:00Z"),
      DailyCallTime.nextOccurrence("20:00", "America/New_York", epoch("2026-11-01T00:00:00Z")))
  }

  @Test(expected = IllegalArgumentException::class) fun rejectsInvalidZone() {
    DailyCallTime.nextOccurrence("20:00", "Not/AZone", 0)
  }
}
