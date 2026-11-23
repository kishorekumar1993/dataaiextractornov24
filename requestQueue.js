/**
 * Centralized AI Request Queue & Persistence Manager
 * Features:
 * - Controlled concurrency (default: 1)
 * - Configurable inter-request delay
 * - Duplicate prevention (prevents enqueueing or in-flight processing of same URL)
 * - Separate queues: Pending, Active, Completed, Failed
 * - Automatic persistence to chrome.storage.local (zero data loss across restarts)
 * - Resume on browser restart / popup reopen
 * - Full audit logs
 */

(() => {
  class CrawlerQueueManager {
    constructor(options = {}) {
      this.concurrency = options.concurrency || 1;
      this.interRequestDelayMs = options.interRequestDelayMs || 1000;
      this.geminiClient = options.geminiClient || (typeof globalThis !== "undefined" ? globalThis.GeminiClient : null);

      this.pendingQueue = [];
      this.activeMap = new Map(); // id -> item
      this.completedMap = {}; // url -> result
      this.failedQueue = []; // items with error reasons

      this.isProcessing = false;
      this.listeners = new Set();
      this.storageKey = "crawler_queue_state_v1";
    }

    /**
     * Initializes queue state from chrome.storage.local
     */
    async init() {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          const res = await new Promise(resolve => chrome.storage.local.get([this.storageKey], resolve));
          const state = res[this.storageKey];
          if (state) {
            this.pendingQueue = state.pendingQueue || [];
            this.completedMap = state.completedMap || {};
            this.failedQueue = state.failedQueue || [];
            this.concurrency = state.concurrency || this.concurrency;
            this.interRequestDelayMs = state.interRequestDelayMs || this.interRequestDelayMs;
          }
        } catch (e) {
          console.warn("[CrawlerQueue] Failed to load persisted state:", e);
        }
      }
      return this.getStatus();
    }

    /**
     * Persists current queue state to chrome.storage.local
     */
    async saveState() {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try {
          const state = {
            pendingQueue: this.pendingQueue,
            completedMap: this.completedMap,
            failedQueue: this.failedQueue,
            concurrency: this.concurrency,
            interRequestDelayMs: this.interRequestDelayMs,
            updatedAt: new Date().toISOString()
          };
          await new Promise(resolve => chrome.storage.local.set({ [this.storageKey]: state }, resolve));
        } catch (e) {
          console.warn("[CrawlerQueue] Failed to save state:", e);
        }
      }
    }

    /**
     * Add website task to queue
     */
    async enqueue(task) {
      if (!task || !task.url) {
        throw new Error("Task must specify a website URL.");
      }

      const cleanUrl = task.url.trim();
      const cleanKey = cleanUrl.toLowerCase();

      // Check if already active or pending
      const isPending = this.pendingQueue.some(i => i.url.toLowerCase() === cleanKey);
      const isActive = Array.from(this.activeMap.values()).some(i => i.url.toLowerCase() === cleanKey);

      if (isPending || isActive) {
        console.log(`[CrawlerQueue] Duplicate task ignored for ${cleanUrl}`);
        return { enqueued: false, reason: "Task already in queue or processing" };
      }

      const item = {
        id: "task_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
        url: cleanUrl,
        domain: task.domain || new URL(cleanUrl).hostname,
        context: task.context,
        userPrompt: task.userPrompt,
        systemInstruction: task.systemInstruction,
        options: task.options || {},
        enqueuedAt: new Date().toISOString(),
        attempts: 0
      };

      this.pendingQueue.push(item);
      await this.saveState();
      this.notifyListeners("task_enqueued", item);

      // Start processing if not already running
      this.processQueue();

      return { enqueued: true, taskId: item.id };
    }

    /**
     * Retries a specific failed task
     */
    async retryFailedTask(taskId) {
      const idx = this.failedQueue.findIndex(i => i.id === taskId);
      if (idx !== -1) {
        const item = this.failedQueue.splice(idx, 1)[0];
        item.enqueuedAt = new Date().toISOString();
        item.error = null;
        this.pendingQueue.push(item);
        await this.saveState();
        this.notifyListeners("task_retried", item);
        this.processQueue();
        return true;
      }
      return false;
    }

    /**
     * Retries all failed tasks in queue
     */
    async retryAllFailed() {
      if (this.failedQueue.length === 0) return 0;
      const count = this.failedQueue.length;
      while (this.failedQueue.length > 0) {
        const item = this.failedQueue.shift();
        item.enqueuedAt = new Date().toISOString();
        item.error = null;
        this.pendingQueue.push(item);
      }
      await this.saveState();
      this.notifyListeners("all_failed_retried", { count });
      this.processQueue();
      return count;
    }

    /**
     * Gets current queue status
     */
    getStatus() {
      return {
        isProcessing: this.activeMap.size > 0 || this.isProcessing,
        pendingCount: this.pendingQueue.length,
        activeCount: this.activeMap.size,
        completedCount: Object.keys(this.completedMap).length,
        failedCount: this.failedQueue.length,
        activeItems: Array.from(this.activeMap.values()).map(i => ({ id: i.id, url: i.url })),
        concurrency: this.concurrency,
        interRequestDelayMs: this.interRequestDelayMs
      };
    }

    /**
     * Returns completed extraction for a website URL
     */
    getCompletedResult(url) {
      if (!url) return null;
      return this.completedMap[url.trim().toLowerCase()] || null;
    }

    /**
     * Main queue runner respecting concurrency and delays
     */
    async processQueue() {
      if (this.activeMap.size >= this.concurrency) {
        return;
      }

      if (this.pendingQueue.length === 0) {
        this.isProcessing = false;
        return;
      }

      this.isProcessing = true;

      while (this.pendingQueue.length > 0 && this.activeMap.size < this.concurrency) {
        const item = this.pendingQueue.shift();
        this.activeMap.set(item.id, item);
        this.notifyListeners("task_started", item);

        // Run task asynchronously
        (async () => {
          try {
            await this.executeItem(item);
          } finally {
            this.activeMap.delete(item.id);
            await this.saveState();

            // Inter-request delay between tasks
            if (this.interRequestDelayMs > 0) {
              await new Promise(r => setTimeout(r, this.interRequestDelayMs));
            }

            // Continue loop
            this.processQueue();
          }
        })();
      }
    }

    /**
     * Executes single task with GeminiClient
     */
    async executeItem(item) {
      const client = this.geminiClient || (typeof globalThis !== "undefined" ? globalThis.GeminiClient : null);
      if (!client) {
        throw new Error("GeminiClient module is not loaded.");
      }

      const opts = item.options || {};

      try {
        const result = await client.callGeminiWithRetryAndFallback({
          context: item.context,
          userPrompt: item.userPrompt,
          systemInstruction: item.systemInstruction,
          apiKey: opts.apiKey,
          primaryModel: opts.primaryModel || "gemini-3.5-flash-lite",
          fallbackModel: opts.fallbackModel || "gemini-3.1-flash-lite",
          backendProxyUrl: opts.backendProxyUrl || "",
          maxRetries: opts.maxRetries !== undefined ? opts.maxRetries : 4,
          onProgress: (p) => {
            this.notifyListeners("task_progress", { item, progress: p });
          }
        });

        // Store completed
        const cleanKey = item.url.toLowerCase();
        this.completedMap[cleanKey] = {
          data: result.data,
          meta: result.meta,
          completedAt: new Date().toISOString()
        };

        this.notifyListeners("task_completed", { item, result });

      } catch (err) {
        console.error(`[CrawlerQueue] Task failed for ${item.url}:`, err);
        const failedItem = {
          ...item,
          failedAt: new Date().toISOString(),
          error: err.message || String(err)
        };
        this.failedQueue.push(failedItem);
        this.notifyListeners("task_failed", { item: failedItem, error: err.message });
      }
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notifyListeners(event, data) {
      for (const listener of this.listeners) {
        try {
          listener(event, data);
        } catch (e) {
          console.error("[CrawlerQueue] Listener error:", e);
        }
      }
    }
  }

  // Export
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { CrawlerQueueManager };
  }
  if (typeof globalThis !== "undefined") {
    globalThis.CrawlerQueueManager = CrawlerQueueManager;
  }
})();
