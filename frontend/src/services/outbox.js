import { outboxStore, newIdempotencyKey } from '../storage/outboxStore';
import { outboxRunner } from './outboxRunner';
import { connectivityStore } from '../connectivity/connectivityStore';
import { outcomeFromError } from './outboxUploaders';
import { formatApiError } from './apiClient';

/**
 * Entry point for features that must not lose a request when the network is down.
 *
 * sendOrQueue(): try the request now (unless the phone is OFFLINE); if it could not be delivered for a transient
 * reason (no network, timeout, 5xx, 429) store it in the outbox under THE SAME idempotency key, so the later
 * upload cannot create a second record even if the first attempt actually reached the server. A 4xx answer
 * (validation, not found, ...) is final: it is returned to the caller and never queued.
 *
 * @param {{type:string, payload:Object, send:(idempotencyKey:string)=>Promise<any>, key?:string, createdAt?:number}} p
 * @returns {Promise<{success:boolean, queued:boolean, response?:any, error?:Object, key:string}>}
 */
export async function sendOrQueue({ type, payload, send, key = newIdempotencyKey(), createdAt = Date.now() }) {
  if (!connectivityStore.getState().isOffline) {
    try {
      const response = await send(key);
      return { success: true, queued: false, response, key };
    } catch (error) {
      const outcome = outcomeFromError(error);
      if (outcome.kind === 'dead') return { success: false, queued: false, error: formatApiError(error), key };
      // transient (or signed out): fall through to the queue
    }
  }
  const queued = await outboxStore.enqueue({ type, payload, idempotencyKey: key, createdAt });
  if (!queued.ok) {
    return {
      success: false,
      queued: false,
      key,
      error: { message: queued.reason === 'queue_full' ? 'The offline queue is full. Reconnect so it can upload, then try again.' : 'Could not save this for later.', status: 0 },
    };
  }
  await outboxRunner.refresh();
  outboxRunner.kick();
  return { success: false, queued: true, key };
}

export const outbox = {
  newKey: newIdempotencyKey,
  sendOrQueue,
  enqueue: async (item) => {
    const res = await outboxStore.enqueue(item);
    if (res.ok) {
      await outboxRunner.refresh();
      outboxRunner.kick();
    }
    return res;
  },
};
