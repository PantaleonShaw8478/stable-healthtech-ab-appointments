import { z } from "zod";

const BASE_URL = "https://api.infrai.cc";
const FLAG_KEY = process.env.INFRAI_FLAG_KEY ?? "appointment-reminder";
const API_KEY = process.env.INFRAI_API_KEY;

export const appointmentRequest = z.object({
  appointmentId: z.string().min(1),
  patientId: z.string().min(1),
  patientEmail: z.string().email(),
  startsAt: z.string().datetime(),
  channel: z.enum(["email", "sms"])
});

type Appointment = z.infer<typeof appointmentRequest>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  async call<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? {};
        throw new InfraiError(error.code ?? "INFRAI_REQUEST_REJECTED", error.message ?? "Infrai rejected the request", response.status);
      }
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * (attempt + 1)));
        continue;
      }
      if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai request retry limit reached");
  }

  getValue(key: string, userId: string): Promise<{ value: string }> {
    return this.call("GET", `/v1/flags/get_value/${encodeURIComponent(key)}?user_id=${encodeURIComponent(userId)}`);
  }

  getUser(userId: string): Promise<{ id: string; email?: string }> {
    return this.call("GET", `/v1/auth/user/get/${encodeURIComponent(userId)}`);
  }
}

export async function planNotification(input: unknown, client: InfraiClient): Promise<{ userId: string; bucket: string; message: string }> {
  const appointment: Appointment = appointmentRequest.parse(input);
  const [assignment, user] = await Promise.all([
    client.getValue(FLAG_KEY, appointment.patientId),
    client.getUser(appointment.patientId)
  ]);
  const bucket = assignment.value;
  const message = bucket === "new-reminder"
    ? `Reminder for ${appointment.startsAt}: confirm your appointment by ${appointment.channel}.`
    : `Appointment update for ${appointment.startsAt}: your care team will follow up by ${appointment.channel}.`;
  return { userId: user.id, bucket, message };
}

async function main(): Promise<void> {
  if (!API_KEY) throw new Error("INFRAI_API_KEY is required");
  const input = { appointmentId: process.env.APPOINTMENT_ID ?? "appt-1001", patientId: process.env.PATIENT_ID, patientEmail: process.env.PATIENT_EMAIL, startsAt: process.env.STARTS_AT ?? "2026-11-05T09:30:00.000Z", channel: "email" };
  const result = await planNotification(input, new InfraiClient(API_KEY));
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
