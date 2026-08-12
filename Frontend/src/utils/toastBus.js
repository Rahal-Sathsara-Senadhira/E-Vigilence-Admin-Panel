// src/utils/toastBus.js
//
// Tiny pub-sub so any module (notably services/api.js) can trigger a toast
// without needing React context. Frontend/src/components/Toast.jsx is the
// only subscriber.
let listeners = [];
let idCounter = 0;

export function showToast(message, type = "error") {
  const toast = { id: ++idCounter, message, type };
  listeners.forEach((fn) => fn(toast));
}

export function subscribeToToasts(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
