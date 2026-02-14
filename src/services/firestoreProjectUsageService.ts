/**
 * استدعاء Cloud Function لجلب استهلاك المشروع الحقيقي (قراءة/كتابة) من Monitoring API.
 */
import { getFirebaseApp } from '@/services/firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'

export interface ProjectUsageResult {
  ok: boolean
  projectId?: string
  reads: number
  writes: number
  limitReads: number
  limitWrites: number
  readPercent: number
  writePercent: number
  period?: string
  error?: string
}

export async function getProjectUsageAsync(): Promise<ProjectUsageResult> {
  const app = getFirebaseApp()
  if (!app) {
    return {
      ok: false,
      reads: 0,
      writes: 0,
      limitReads: 50000,
      limitWrites: 20000,
      readPercent: 0,
      writePercent: 0,
      error: 'Firebase غير متصل',
    }
  }
  try {
    const functions = getFunctions(app, 'us-central1')
    const fn = httpsCallable<unknown, ProjectUsageResult>(functions, 'getFirestoreUsage')
    const { data } = await fn({})
    return data
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      reads: 0,
      writes: 0,
      limitReads: 50000,
      limitWrites: 20000,
      readPercent: 0,
      writePercent: 0,
      error: message,
    }
  }
}
