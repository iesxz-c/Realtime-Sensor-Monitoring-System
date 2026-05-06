// Simple test harness for simulate schedule rules.
const timeZone = process.env.SIMULATOR_TIMEZONE || 'Asia/Kolkata';

function formatDateParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value ?? '00';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function ymdStringFrom(date, tz) {
  const p = formatDateParts(date, tz);
  return `${String(p.year).padStart(4,'0')}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}

function shouldRunFor(date) {
  const DAY_A = '2026-05-06';
  const DAY_B = '2026-05-07';
  const localDate = ymdStringFrom(date, timeZone);
  const parts = formatDateParts(date, timeZone);
  const hour = parts.hour; const minute = parts.minute;
  if (localDate === DAY_A) {
    return { run: minute % 5 === 0, reason: `${DAY_A} every 5 minutes` };
  }
  if (localDate === DAY_B) {
    if (hour >= 9 && hour < 12 && minute % 2 === 0) return { run: true, reason: `${DAY_B} 2-minute window` };
    return { run: false, reason: 'outside 9-11:59 or odd minute' };
  }
  return { run: false, reason: 'not scheduled date' };
}

// Sample local times (include timezone offset for Asia/Kolkata +05:30)
const samples = [
  '2026-05-06T00:05:00+05:30',
  '2026-05-06T00:06:00+05:30',
  '2026-05-06T12:10:00+05:30',
  '2026-05-07T08:59:00+05:30',
  '2026-05-07T09:00:00+05:30',
  '2026-05-07T09:01:00+05:30',
  '2026-05-07T11:58:00+05:30',
  '2026-05-07T11:59:00+05:30',
  '2026-05-08T10:00:00+05:30'
];

console.log('Testing schedule for timezone:', timeZone);
for (const s of samples) {
  const d = new Date(s);
  const local = `${ymdStringFrom(d,timeZone)} ${formatDateParts(d,timeZone).hour.toString().padStart(2,'0')}:${formatDateParts(d,timeZone).minute.toString().padStart(2,'0')}`;
  const res = shouldRunFor(d);
  console.log(s, '→ local:', local, '=> run:', res.run, '-', res.reason);
}
