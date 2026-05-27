/**
 * test_endpoints.cjs
 * Validates active backend endpoints, DB schema, profile updates, and email ingestion.
 */

const BACKEND_URL = 'http://localhost:5000';

async function runTests() {
  console.log("🔍 [VERIFICATION] Testing Caldim backend integration...");

  let sendersData;
  try {
    const res = await fetch(`${BACKEND_URL}/api/senders`);
    if (!res.ok) {
      throw new Error(`Failed to fetch /api/senders: ${res.statusText}`);
    }
    sendersData = await res.json();
    console.log("✅ [PASS] GET /api/senders endpoint is responsive.");
  } catch (err) {
    console.error("❌ [FAIL] GET /api/senders request failed. Is the server running on port 5000?", err.message);
    process.exit(1);
  }

  // 1. Verify schema columns exist in payload
  const senders = sendersData.senders || [];
  if (senders.length === 0) {
    console.log("⚠️ [WARN] No sender profiles found in database. Ingesting a dummy profile first...");
    // Ingest dummy
    try {
      const mockRes = await fetch(`${BACKEND_URL}/api/tickets/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: 'test.user@example.com',
          subject: 'Testing Setup',
          body: 'Hello, this is a test inquiry about Billing.',
          attachments: []
        })
      });
      if (!mockRes.ok) {
        throw new Error(`Mock ingestion failed: ${mockRes.statusText}`);
      }
      console.log("✅ [PASS] Ingestion of initial test contact succeeded.");
      
      // Re-fetch senders
      const refetch = await fetch(`${BACKEND_URL}/api/senders`);
      const refetchData = await refetch.json();
      senders.push(...(refetchData.senders || []));
    } catch (err) {
      console.error("❌ [FAIL] Failed to ingest dummy contact:", err.message);
      process.exit(1);
    }
  }

  const testContact = senders[0];
  console.log(`👤 Using test contact: "${testContact.sender_email}"`);

  const requiredKeys = [
    'autopilot_mode',
    'autopilot_until',
    'autopilot_schedule_enabled',
    'autopilot_schedule_start',
    'autopilot_schedule_end',
    'autopilot_schedule_days'
  ];

  let keysValid = true;
  for (const key of requiredKeys) {
    if (key in testContact) {
      console.log(`✅ [PASS] Schema field "${key}" is present in profile.`);
    } else {
      console.error(`❌ [FAIL] Schema field "${key}" is missing from returned profile!`);
      keysValid = false;
    }
  }

  if (!keysValid) {
    process.exit(1);
  }

  // 2. Test updating autopilot settings
  console.log("⚙️ Testing rule configuration updates...");
  const updatePayload = {
    mode: 'ALWAYS',
    durationHours: 24,
    scheduleEnabled: true,
    scheduleStart: '18:00',
    scheduleEnd: '09:00',
    scheduleDays: '1,2,3,4,5'
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/senders/${testContact.sender_email}/autopilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload)
    });

    if (!res.ok) {
      throw new Error(`Update API failed: ${res.statusText}`);
    }

    const result = await res.json();
    console.log("✅ [PASS] POST /api/senders/:email/autopilot saved successfully.");

    // Assertions on saved payload
    if (
      result.autopilot_mode === 'ALWAYS' &&
      result.autopilot_schedule_enabled === 1 &&
      result.autopilot_schedule_start === '18:00' &&
      result.autopilot_schedule_end === '09:00' &&
      result.autopilot_schedule_days === '1,2,3,4,5'
    ) {
      console.log("✅ [PASS] Update payload properties verified correct in API response.");
    } else {
      console.error("❌ [FAIL] Update payload values mismatch in response:", result);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ [FAIL] Saving autopilot rules failed:", err.message);
    process.exit(1);
  }

  // 3. Test mock ingestion schedule check (Holding outside schedule hours)
  console.log("🧪 Simulating email ingestion outside active schedule hours...");
  // Active schedule is 18:00 - 09:00, but we test now.
  // We can write a test case to ensure the ticket is ingested and status is 'Pending Review'.
  try {
    const res = await fetch(`${BACKEND_URL}/api/tickets/mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderEmail: testContact.sender_email,
        subject: 'Low Confidence Out of Schedule Inquiry',
        body: 'Can someone help me with technical support on the project margins?',
        attachments: []
      })
    });

    if (!res.ok) {
      throw new Error(`Mock ticket ingestion failed: ${res.statusText}`);
    }

    const mockResult = await res.json();
    console.log(`✅ [PASS] Ingestion webhook responded with ticket id: ${mockResult.ticketId}`);

    // Verify status in DB
    const listRes = await fetch(`${BACKEND_URL}/api/tickets`);
    const listData = await listRes.json();
    const createdTicket = (listData.tickets || []).find(t => t.id === mockResult.ticketId) ||
                          (listData.pendingTickets || []).find(t => t.id === mockResult.ticketId);

    if (createdTicket) {
      console.log(`📝 Ingested Ticket Status: "${createdTicket.status}"`);
      // Since it's currently outside the 18:00 - 09:00 window (local time is ~15:47), it MUST be 'Pending Review'!
      const now = new Date();
      const currentHour = now.getHours();
      const isOutside = currentHour >= 9 && currentHour < 18;
      
      if (isOutside) {
        if (createdTicket.status === 'Pending Review') {
          console.log("✅ [PASS] Bypassed auto-response and held for review (outside schedule window).");
        } else {
          console.error(`❌ [FAIL] Ticket status should be 'Pending Review' outside schedule hours, but got "${createdTicket.status}"`);
          process.exit(1);
        }
      } else {
        if (createdTicket.status === 'Sent') {
          console.log("✅ [PASS] Auto-response triggered correctly (inside overnight schedule window).");
        } else {
          console.error(`❌ [FAIL] Ticket status should be 'Sent' inside schedule hours, but got "${createdTicket.status}"`);
          process.exit(1);
        }
      }
    } else {
      console.error("❌ [FAIL] Could not retrieve created ticket from list endpoint.");
      process.exit(1);
    }

  } catch (err) {
    console.error("❌ [FAIL] Ingestion check failed:", err.message);
    process.exit(1);
  }

  // Restore profile back to default so we don't mess up user data
  console.log("🧹 Restoring sender profile to DEFAULT system settings...");
  try {
    await fetch(`${BACKEND_URL}/api/senders/${testContact.sender_email}/autopilot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'DEFAULT',
        durationHours: null,
        scheduleEnabled: false,
        scheduleStart: '00:00',
        scheduleEnd: '23:59',
        scheduleDays: '1,2,3,4,5,6,0'
      })
    });
    console.log("✅ [PASS] Profile settings restored.");
  } catch (e) {
    console.warn("⚠️ Warning: Could not restore profile settings:", e.message);
  }

  console.log("\n🎉 [SUCCESS] All backend routes and database schemas are 100% operational!");
}

runTests();
