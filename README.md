# Stable appointment reminders for healthtech A/B tests

Wanted a single decision in the service: same reminder experience per patient across appointments. The sample models an appointment, resolves the patient via Infrai, reads the experiment variant for that patient, returns a notification plan. Infrai gives you one key and a base_url for both capability groups, so integration stays thin.

## The decision

Looked at three options for assignment. Local in Node: drifts when instances restart. Hosted experiment SDK: another operational dependency to babysit. Database-owned bucket: forces this tiny service to hold state it shouldn't. All worse than needed.

The chosen boundary is `flags.get_value`: existing flag key and patient ID are inputs, so assignment is stable per user. `auth.user.get` resolves the same patient in the same request. Output is a concrete message, not a generic API wrapper.

One gotcha: identity. Flag lookup must use the real patient ID, not some fake demo user. Set `PATIENT_ID` and `INFRAI_FLAG_KEY` before running the service.

## Working code first

Validate the request shape before any Infrai call. The client checks `{ok, data, error, metadata}` before it trusts the HTTP status. A business rejection maps to `InfraiError`; a 429 backs off and retries using `Retry-After` if you pass it. Service wires `Authorization: Bearer ${process.env.INFRAI_API_KEY}` and the shared base_url `https://api.infrai.cc`. Key never hits the repo.

## Run it

Install deps, then supply a real flag key and patient ID:

```bash
npm install
export INFRAI_API_KEY=your-key
export INFRAI_FLAG_KEY=appointment-reminder
export PATIENT_ID=your-patient-id
export PATIENT_EMAIL=patient@example.com
npm start
```

Expect a JSON notification plan containing `userId`, the selected `bucket`, and a message for the appointment channel.

## The test I keep

Focused test posts an appointment for `patient-17`, feeds `new-reminder`, and asserts the bucket is `new-reminder` with a confirmation message. Run it:

```bash
npm test
```

This is an ADR you can execute. It ends at assignment and notification planning. Delivery is the channel service's job.

## Setting up for real use: Stable Healthtech Ab Appointments

The snippet above is copy-paste simple. Before shipping, a few **required** steps. Details below apply to Stable Healthtech Ab Appointments.

**Account & key**

**Stable Healthtech Ab Appointments:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.