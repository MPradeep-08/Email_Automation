/**
 * verify_scheduling.cjs
 * Automated test runner for Autopilot time-window scheduling logic.
 */

const assert = require('assert').strict;

// Copied helper from server.cjs to test isolation
function isWithinAutopilotSchedule(profile, timestamp) {
  if (!profile.autopilot_schedule_enabled) {
    return true;
  }
  
  const dateObj = new Date(timestamp);
  // Get day of week in local time: 0 (Sunday) to 6 (Saturday)
  const currentDay = dateObj.getDay(); 
  
  // Convert current time to HH:MM format (local time)
  const pad = (n) => String(n).padStart(2, '0');
  const currentTimeStr = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
  
  // Check if currentDay is in active days (comma-separated, e.g. "1,2,3,4,5")
  const activeDays = (profile.autopilot_schedule_days || '').split(',').map(d => d.trim());
  if (!activeDays.includes(String(currentDay))) {
    return false;
  }
  
  const start = profile.autopilot_schedule_start || '00:00';
  const end = profile.autopilot_schedule_end || '23:59';
  
  if (start <= end) {
    // Standard range: e.g. 09:00 to 17:00
    return currentTimeStr >= start && currentTimeStr <= end;
  } else {
    // Overnight range: e.g. 18:00 to 09:00 (crosses midnight boundary)
    return currentTimeStr >= start || currentTimeStr <= end;
  }
}

// Set up tests
console.log("🏃 [TEST RUNNER] Starting Autopilot Schedule Matcher Tests...");

const tests = [
  {
    name: "Disabled Schedule (Should always return true)",
    profile: { autopilot_schedule_enabled: 0 },
    timestamp: new Date("2026-05-27T12:00:00"), // Wednesday 12:00
    expected: true
  },
  {
    name: "Standard Schedule (Inside Range)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "09:00",
      autopilot_schedule_end: "17:00",
      autopilot_schedule_days: "1,2,3,4,5"
    },
    timestamp: new Date("2026-05-27T12:00:00"), // Wednesday 12:00
    expected: true
  },
  {
    name: "Standard Schedule (Outside Range - Too Early)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "09:00",
      autopilot_schedule_end: "17:00",
      autopilot_schedule_days: "1,2,3,4,5"
    },
    timestamp: new Date("2026-05-27T08:30:00"), // Wednesday 08:30
    expected: false
  },
  {
    name: "Standard Schedule (Outside Range - Too Late)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "09:00",
      autopilot_schedule_end: "17:00",
      autopilot_schedule_days: "1,2,3,4,5"
    },
    timestamp: new Date("2026-05-27T17:30:00"), // Wednesday 17:30
    expected: false
  },
  {
    name: "Standard Schedule (Excluded Day - Weekend)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "09:00",
      autopilot_schedule_end: "17:00",
      autopilot_schedule_days: "1,2,3,4,5" // Mon-Fri
    },
    timestamp: new Date("2026-05-24T12:00:00"), // Sunday 12:00
    expected: false
  },
  {
    name: "Overnight Schedule (Inside Range - Before Midnight)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "18:00",
      autopilot_schedule_end: "09:00",
      autopilot_schedule_days: "1,2,3,4,5" // Wednesday belongs here
    },
    timestamp: new Date("2026-05-27T20:00:00"), // Wednesday 20:00
    expected: true
  },
  {
    name: "Overnight Schedule (Inside Range - After Midnight)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "18:00",
      autopilot_schedule_end: "09:00",
      autopilot_schedule_days: "1,2,3,4,5"
    },
    timestamp: new Date("2026-05-27T04:00:00"), // Wednesday 04:00
    expected: true
  },
  {
    name: "Overnight Schedule (Outside Range - Midday)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "18:00",
      autopilot_schedule_end: "09:00",
      autopilot_schedule_days: "1,2,3,4,5"
    },
    timestamp: new Date("2026-05-27T12:00:00"), // Wednesday 12:00
    expected: false
  },
  {
    name: "Weekend Schedule (Inside Range - Sunday)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "00:00",
      autopilot_schedule_end: "23:59",
      autopilot_schedule_days: "0,6" // Sun, Sat
    },
    timestamp: new Date("2026-05-24T15:00:00"), // Sunday 15:00
    expected: true
  },
  {
    name: "Weekend Schedule (Outside Range - Monday)",
    profile: {
      autopilot_schedule_enabled: 1,
      autopilot_schedule_start: "00:00",
      autopilot_schedule_end: "23:59",
      autopilot_schedule_days: "0,6" // Sun, Sat
    },
    timestamp: new Date("2026-05-25T15:00:00"), // Monday 15:00
    expected: false
  }
];

let failed = 0;
for (const t of tests) {
  try {
    const result = isWithinAutopilotSchedule(t.profile, t.timestamp);
    assert.strictEqual(result, t.expected);
    console.log(`✅ [PASS] ${t.name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${t.name}`);
    console.error(`       Expected ${t.expected}, but got ${!t.expected}`);
    failed++;
  }
}

console.log("\n-------------------------------------------");
if (failed === 0) {
  console.log("🎉 [SUCCESS] All schedule validation tests passed!");
  process.exit(0);
} else {
  console.error(`🚨 [FAILURE] ${failed} schedule validation test(s) failed.`);
  process.exit(1);
}
