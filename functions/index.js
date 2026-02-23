const functions = require('firebase-functions/v1');
const { MetricServiceClient } = require('@google-cloud/monitoring');

const monitoring = new MetricServiceClient();

/**
 * Validate admin code on the server.
 * Set ADMIN_CODE in Firebase Console: Project → Functions → Environment variables (1st Gen).
 * Or: firebase functions:config:set admin.code="YOUR_CODE" then redeploy.
 */
exports.validateAdminToken = functions.region('us-central1').https.onCall(async (data, context) => {
  const code = data?.code;
  if (typeof code !== 'string' || !code.trim()) {
    return { valid: false, error: 'كود مطلوب' };
  }
  const expected = process.env.ADMIN_CODE || (functions.config().admin && functions.config().admin.code);
  if (!expected || typeof expected !== 'string') {
    return { valid: false, error: 'لم يُضبط كود الأدمن على السيرفر (ADMIN_CODE)' };
  }
  const valid = code.trim() === String(expected).trim();
  return { valid };
});

/** Firestore free tier daily limits (approximate) */
const DAILY_READ_LIMIT = 50000;
const DAILY_WRITE_LIMIT = 20000;

/**
 * Get total Firestore reads/writes for the project in the last 24h from Monitoring API.
 */
exports.getFirestoreUsage = functions.region('us-central1').https.onCall(async (data, context) => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) {
    return { ok: false, error: 'المشروع غير معروف' };
  }

  const now = Date.now() / 1000;
  const startSec = now - 24 * 3600;
  const interval = {
    startTime: { seconds: Math.floor(startSec) },
    endTime: { seconds: Math.floor(now) },
  };

  const projectPath = monitoring.projectPath(projectId);

  function sumPoints(timeSeriesList) {
    let total = 0;
    for (const ts of timeSeriesList || []) {
      for (const point of ts.points || []) {
        const v = point.value?.int64Value || point.value?.doubleValue || 0;
        total += Number(v);
      }
    }
    return total;
  }

  try {
    const [readSeries] = await monitoring.listTimeSeries({
      name: projectPath,
      filter: 'metric.type="firestore.googleapis.com/document/read_count"',
      interval,
      view: 'FULL',
    });
    const [writeSeries] = await monitoring.listTimeSeries({
      name: projectPath,
      filter: 'metric.type="firestore.googleapis.com/document/write_count"',
      interval,
      view: 'FULL',
    });

    const reads = sumPoints(readSeries);
    const writes = sumPoints(writeSeries);

    return {
      ok: true,
      projectId,
      reads,
      writes,
      limitReads: DAILY_READ_LIMIT,
      limitWrites: DAILY_WRITE_LIMIT,
      readPercent: Math.min(100, Math.round((reads / DAILY_READ_LIMIT) * 100)),
      writePercent: Math.min(100, Math.round((writes / DAILY_WRITE_LIMIT) * 100)),
      period: '24h',
    };
  } catch (e) {
    console.error('getFirestoreUsage error', e.message);
    return {
      ok: false,
      error: e.message || 'فشل جلب الاستخدام',
      reads: 0,
      writes: 0,
      limitReads: DAILY_READ_LIMIT,
      limitWrites: DAILY_WRITE_LIMIT,
    };
  }
});
