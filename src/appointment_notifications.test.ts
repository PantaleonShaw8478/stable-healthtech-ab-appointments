import test from "node:test";
import assert from "node:assert/strict";
import { planNotification, InfraiClient } from "./appointment_notifications.ts";

test("the stable bucket selects the new reminder for the same patient", async () => {
  const client = new InfraiClient("test-key");
  client.getValue = async () => ({ value: "new-reminder" });
  client.getUser = async () => ({ id: "patient-17", email: "patient@example.com" });
  const result = await planNotification({ appointmentId: "appt-7", patientId: "patient-17", patientEmail: "patient@example.com", startsAt: "2026-11-05T09:30:00.000Z", channel: "email" }, client);
  assert.equal(result.bucket, "new-reminder");
  assert.match(result.message, /confirm your appointment/);
});
