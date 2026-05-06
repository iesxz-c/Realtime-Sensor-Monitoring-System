Simulator schedule

- This project exposes a serverless endpoint at `/api/simulate` that is intended to be invoked by Vercel Cron.
- `vercel.json` is configured to call the route every minute; the route itself gates execution based on `SIMULATOR_TIMEZONE`.

Behavior implemented:
- If the local date (in `SIMULATOR_TIMEZONE`) is 2026-05-06: the route runs only on minute ticks where `minute % 5 === 0` (every 5 minutes).
- If the local date is 2026-05-07: the route runs only between 09:00 and 11:59 and only when `minute % 2 === 0` (every 2 minutes).

Environment variables (add these in Vercel):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`
- `SIMULATOR_CRON_ENABLED=true`
- `SIMULATOR_TIMEZONE=Asia/Kolkata` (adjust as needed)
- `CRON_SECRET` (optional - required to authorize manual calls)

Quick test (local or from any host):

curl example:

```bash
curl -H "x-vercel-cron: 1" "https://<your-deploy>/api/simulate"
# or with CRON_SECRET (if set):
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-deploy>/api/simulate"
```
