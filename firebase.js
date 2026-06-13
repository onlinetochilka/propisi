/**
 * Firebase / Auth / Analytics — заглушка.
 * Логика БД и аутентификации отделена от UI.
 */

const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

let initialized = false;

export function initFirebase() {
  if (initialized) return;
  // TODO: firebase.initializeApp(FIREBASE_CONFIG);
  initialized = true;
}

export function getStoredUTM() {
  return {
    utm_source: sessionStorage.getItem('utm_source') || null,
    utm_medium: sessionStorage.getItem('utm_medium') || null,
    utm_campaign: sessionStorage.getItem('utm_campaign') || null,
  };
}

export function trackEvent(eventName, params = {}) {
  const utm = getStoredUTM();
  const payload = { ...params, ...utm, timestamp: Date.now() };

  if (typeof window !== 'undefined' && window.dataLayer) {
    window.dataLayer.push({ event: eventName, ...payload });
  }

  // TODO: firebase.analytics().logEvent(eventName, payload);
}

export function saveWorksheet(_data) {
  // TODO: Firestore save
  return Promise.resolve({ id: null });
}

export function getCurrentUser() {
  // TODO: firebase.auth().currentUser
  return null;
}

export { FIREBASE_CONFIG };
