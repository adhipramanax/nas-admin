import { prisma } from './prisma.js';

export async function logActivity({ actor = 'user', action, target = null, detail = null, success = true }) {
  try {
    await prisma.activityLog.create({
      data: { actor, action, target, detail: detail ? String(detail).slice(0, 2000) : null, success },
    });
  } catch (e) {
    console.error('[activity]', e.message);
  }
}
