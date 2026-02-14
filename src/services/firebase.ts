/**
 * Firebase — التأسيس (المرحلة ١)
 * التهيئة وربط Firestore و Storage. المفاتيح من .env فقط (ممنوع وضعها في الكود).
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

function getFirebaseConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined

  if (!apiKey || !projectId) return null

  return {
    apiKey,
    authDomain: authDomain ?? undefined,
    projectId,
    storageBucket: storageBucket ?? undefined,
    messagingSenderId: messagingSenderId ?? undefined,
    appId: appId ?? undefined,
  }
}

let app: FirebaseApp | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

function initFirebase(): FirebaseApp | null {
  if (app) return app
  const config = getFirebaseConfig()
  if (!config) return null
  const existing = getApps()
  if (existing.length > 0) {
    app = existing[0] as FirebaseApp
  } else {
    app = initializeApp(config)
  }
  return app
}

function getDb(): Firestore | null {
  if (db) return db
  const firebaseApp = initFirebase()
  if (!firebaseApp) return null
  db = getFirestore(firebaseApp)
  return db
}

function getStorageInstance(): FirebaseStorage | null {
  if (storage) return storage
  const firebaseApp = initFirebase()
  if (!firebaseApp) return null
  storage = getStorage(firebaseApp)
  return storage
}

/** نسخة Firestore — استخدمها في كل العمليات. لو null معناه Firebase غير مُعدّ. */
export const firestoreDb = getDb()

/** نسخة Storage — للرفع/التخزين. لو null معناه Firebase غير مُعدّ. */
export const firebaseStorage = getStorageInstance()

/** التطبيق المُهيّأ (للاستخدام المتقدم مثل Auth، Functions). */
export const firebaseApp = app

/** للحصول على التطبيق بعد التهيئة (مثلاً لـ Cloud Functions). */
export function getFirebaseApp(): FirebaseApp | null {
  return initFirebase()
}
