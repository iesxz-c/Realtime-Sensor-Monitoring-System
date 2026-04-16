# Realtime Sensor Monitoring System

Next.js + Tailwind dashboard for a Supabase-backed realtime sensor monitor. The hardware payload is expected to come from an ESP32 later, but the current software flow is designed to be developed and tested without the device.

## Stack

- Next.js App Router
- Tailwind CSS v4
- Supabase REST + Realtime
- Supervisor process config for deployment
- Node-based simulator for API testing

## 1. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

On PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env.local
```

## 2. Supabase setup

Create a Supabase project and copy the values into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_DEVICE_ID=esp32_01
NEXT_PUBLIC_OFFLINE_THRESHOLD_SECONDS=30
```

For local simulation, also set:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SIMULATOR_DEVICE_ID=esp32_01
SIMULATOR_INTERVAL_MS=3000
```

Then run the SQL from `supabase/schema.sql` in the Supabase SQL editor.

## 3. Database design

The `device_state` table stores the latest state for each device. If you only have one device for now, keep using `esp32_01` and upsert the same row repeatedly.

Columns:

- `id` primary key
- `device_id` unique device identifier
- `temperature` latest temperature
- `humidity` latest humidity
- `water_level` latest water level percentage
- `ph` latest water pH value
- `air_quality` latest air quality index
- `noise_level` latest noise level in dB
- `motion_detected` latest motion status
- `updated_at` last mutation timestamp

Realtime should be enabled for the `device_state` table in Supabase.

## 4. API simulation without ESP32

### Curl

```bash
curl -X POST "$SUPABASE_URL/rest/v1/device_state?on_conflict=device_id" \
	-H "apikey: $SUPABASE_ANON_KEY" \
	-H "Authorization: Bearer $SUPABASE_ANON_KEY" \
	-H "Content-Type: application/json" \
	-H "Prefer: resolution=merge-duplicates,return=representation" \
	-d '{
		"device_id": "esp32_01",
		"temperature": 30,
		"humidity": 70,
		"water_level": 54,
		"ph": 7.2,
		"air_quality": 67,
		"noise_level": 48,
		"motion_detected": false
	}'
```

### Postman

Send a `POST` request to:

```text
SUPABASE_URL/rest/v1/device_state?on_conflict=device_id
```

Headers:

- `apikey: <anon-or-service-role-key>`
- `Authorization: Bearer <anon-or-service-role-key>`
- `Content-Type: application/json`
- `Prefer: resolution=merge-duplicates,return=representation`

Body:

```json
{
	"device_id": "esp32_01",
	"temperature": 29.5,
	"humidity": 64,
	"water_level": 61,
	"ph": 7.0,
	"air_quality": 58,
	"noise_level": 46,
	"motion_detected": true
}
```

### Built-in simulator

```bash
npm run simulate
```

That script sends an upsert every few seconds to mimic the ESP32.

## 5. Dashboard behavior

- Reads the latest `device_state` row for the configured device
- Subscribes to `INSERT` and `UPDATE` events via Supabase Realtime
- Marks the device offline when `updated_at` is older than the threshold
- Keeps a small in-memory trend history for the current browser session

## 6. Supervisor deployment

An example Supervisor config is included at `supervisor/dashboard.conf`.

Typical deployment flow:

```bash
npm run build
npm run start
```

Use Supervisor to keep the process alive and restart it on failure.

## 7. Validation checklist

- Create Supabase project
- Apply `supabase/schema.sql`
- Enable Realtime on `device_state`
- Set `.env.local`
- Run `npm run dev`
- Send updates with curl, Postman, or `npm run simulate`
- Confirm the dashboard updates without refresh
- Confirm the online/offline badge flips after the threshold expires
