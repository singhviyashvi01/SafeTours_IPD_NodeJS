/**
 * connectivityBus: a tiny dependency-free hook point between the API client and the connectivity store
 * (the store imports the API client's base URL, so the client must not import the store back).
 *   apiClient interceptors  ->  reportRequest({ok, ms})  ->  store.recordRequest
 *   apiClient request guard ->  isForcedOffline()        <-  store (offline mode toggle)
 */
let requestListener = null;
let forcedOffline = false;

export const connectivityBus = {
  onRequest(fn) {
    requestListener = fn;
  },
  reportRequest(outcome) {
    try {
      requestListener && requestListener(outcome);
    } catch (e) {
      /* never let monitoring break a request */
    }
  },
  setForcedOffline(value) {
    forcedOffline = Boolean(value);
  },
  isForcedOffline: () => forcedOffline,
};
