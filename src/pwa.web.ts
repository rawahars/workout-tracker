export async function initializePwa() {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
    await navigator.serviceWorker.ready;
    if (window.matchMedia('(display-mode: standalone)').matches) await protectStorage();
    return true;
  }
  return false;
}
export async function protectStorage() {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}
export async function storageProtected() {
  return navigator.storage?.persisted ? navigator.storage.persisted() : false;
}
