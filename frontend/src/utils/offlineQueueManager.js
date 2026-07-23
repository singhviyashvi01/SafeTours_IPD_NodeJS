/**
 * Offline Queue Manager for Location Sync
 * Queues location updates when network requests fail or offline state is detected.
 */
class OfflineQueueManager {
  constructor() {
    this.queue = [];
    this.isFlushing = false;
  }

  /**
   * Enqueue a location update payload
   */
  enqueue(locationPayload) {
    if (!locationPayload || !locationPayload.latitude || !locationPayload.longitude) {
      return;
    }

    // Check if duplicate timestamp already exists in queue to avoid redundancy
    const exists = this.queue.some(
      item => item.timestamp === locationPayload.timestamp &&
              item.latitude === locationPayload.latitude &&
              item.longitude === locationPayload.longitude
    );

    if (!exists) {
      this.queue.push({
        ...locationPayload,
        queuedAt: new Date().toISOString(),
      });
      // Keep queue bounded to last 50 updates max
      if (this.queue.length > 50) {
        this.queue.shift();
      }
    }
  }

  /**
   * Get size of pending queue
   */
  getQueueSize() {
    return this.queue.length;
  }

  /**
   * Get all items in queue
   */
  getQueue() {
    return [...this.queue];
  }

  /**
   * Clear queue
   */
  clear() {
    this.queue = [];
  }

  /**
   * Flush queue using provided sync function
   */
  async flushQueue(syncFn) {
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }

    this.isFlushing = true;

    try {
      const pendingItems = [...this.queue];
      for (const item of pendingItems) {
        try {
          const res = await syncFn(item);
          if (res && res.success) {
            // Remove item from queue on success
            this.queue = this.queue.filter(q => q.queuedAt !== item.queuedAt);
          } else {
            // Stop flushing on error
            break;
          }
        } catch (err) {
          console.warn('[OfflineQueueManager] Flush failed for item:', err);
          break;
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }
}

export const offlineQueueManager = new OfflineQueueManager();
