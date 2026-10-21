/**
 * Dashboard figures and header notifications computed from the user's real data
 * (they used to be fixed sample values, docs/PHASE6_COMMERCIAL_READINESS.md P6-6).
 */

const DAY = 24 * 60 * 60 * 1000;

interface CourseLike { progress?: number; estimatedHours?: number }
interface ActivityLike { title?: string; description?: string; timestamp?: number }
interface ExamLike { id?: string; title?: string; date?: string; time?: string }
interface SubscriptionLike { status?: string; type?: string; planName?: string; subscriptionEndDate?: any; trialStartDate?: any }

export interface StudyNotification {
  id: string;
  kind: 'exam' | 'plan' | 'activity';
  title: string;
  message: string;
  time: string;
}

const TRIAL_DAYS = 7;
const DEFAULT_COURSE_HOURS = 10;

/** Hours studied, estimated as each course's planned hours × its progress. One decimal. */
export function estimateStudyHours(courses: CourseLike[]): number {
  const hours = courses.reduce((sum, course) => {
    const progress = Math.min(100, Math.max(0, Number(course.progress) || 0));
    const planned = Number(course.estimatedHours) > 0 ? Number(course.estimatedHours) : DEFAULT_COURSE_HOURS;
    return sum + (planned * progress) / 100;
  }, 0);
  return Math.round(hours * 10) / 10;
}

const localDay = (ms: number) => {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/** Consecutive days (ending today or yesterday) with at least one recorded activity. */
export function activityStreak(activities: ActivityLike[], now = Date.now()): number {
  const days = new Set(activities.filter((a) => Number.isFinite(a.timestamp)).map((a) => localDay(a.timestamp as number)));
  let day = localDay(now);
  if (!days.has(day)) day -= DAY; // the streak is not broken until today ends
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = localDay(day - DAY / 2);
  }
  return streak;
}

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** "Hace 5 min", "Hace 3 h", "Hace 2 d". */
export const timeAgo = (ms: number, now = Date.now()) => {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 1440) return `Hace ${Math.round(minutes / 60)} h`;
  return `Hace ${Math.round(minutes / 1440)} d`;
};

const inDays = (target: number, now: number) => {
  const days = Math.round((localDay(target) - localDay(now)) / DAY);
  return days <= 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
};

export function buildNotifications(input: { exams: ExamLike[]; subscription?: SubscriptionLike | null; activities: ActivityLike[]; now?: number }): StudyNotification[] {
  const now = input.now ?? Date.now();
  const notifications: StudyNotification[] = [];

  // Exams in the next 3 days (dates are YYYY-MM-DD in the user's calendar)
  for (const exam of input.exams) {
    if (!exam.date) continue;
    const when = Date.parse(`${exam.date}T${exam.time || '00:00'}`);
    if (!Number.isFinite(when) || localDay(when) < localDay(now) || when - now > 3 * DAY) continue;
    notifications.push({
      id: `exam-${exam.id || exam.date}`, kind: 'exam', title: 'Examen próximo',
      message: `${exam.title || 'Examen'} ${inDays(when, now)}${exam.time ? ` a las ${exam.time}` : ''}.`, time: exam.date,
    });
  }

  // Paid plan or free trial ending within 7 days
  const sub = input.subscription;
  if (sub?.status === 'active') {
    const end = toMillis(sub.subscriptionEndDate);
    if (end && end > now && end - now <= 7 * DAY) {
      notifications.push({ id: 'plan-ending', kind: 'plan', title: 'Tu plan termina pronto', message: `${sub.planName || 'Tu plan'} termina ${inDays(end, now)}. Es un pago único: no se renueva solo.`, time: '' });
    }
  } else if (sub?.status === 'trial') {
    const start = toMillis(sub.trialStartDate);
    const end = start ? start + TRIAL_DAYS * DAY : null;
    if (end && end > now && end - now <= 2 * DAY) {
      notifications.push({ id: 'trial-ending', kind: 'plan', title: 'Prueba gratuita', message: `Tu período de prueba termina ${inDays(end, now)}.`, time: '' });
    }
  }

  // Latest AI activity
  const latest = [...input.activities].filter((a) => Number.isFinite(a.timestamp)).sort((a, b) => (b.timestamp as number) - (a.timestamp as number))[0];
  if (latest && now - (latest.timestamp as number) < 2 * DAY) {
    notifications.push({ id: `activity-${latest.timestamp}`, kind: 'activity', title: latest.title || 'Nueva actividad', message: latest.description || '', time: timeAgo(latest.timestamp as number, now) });
  }
  return notifications;
}
