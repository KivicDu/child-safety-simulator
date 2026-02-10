class SimulationCacheManager {
  constructor() {
    // LRU cache with max 10 scenes
    this.MAX_SCENES = 10;
    this.cache = new Map();
    this.currentSceneId = null;
    this.TIMEOUT_MS = 600000; 
    this.activeRequests = new Map(); // Track abort controllers
  }

  /**
   * LRU eviction when cache is full
   */
  evictOldestIfNeeded() {
    if (this.cache.size >= this.MAX_SCENES) {
      const oldestKey = this.cache.keys().next().value;
      
      if (oldestKey && oldestKey !== this.currentSceneId) {
        console.log(`🗑️ LRU evicting scene: ${oldestKey}`);
        this.cache.delete(oldestKey);
        return true;
      }
    }
    return false;
  }

  /**
   * Touch to mark as recently used
   */
  touchScene(sceneId) {
    if (this.cache.has(sceneId)) {
      const sceneCache = this.cache.get(sceneId);
      this.cache.delete(sceneId);
      this.cache.set(sceneId, sceneCache);
    }
  }

  hasCachedBatch(sceneId) {
    if (!this.cache.has(sceneId)) return false;
    
    const sceneCache = this.cache.get(sceneId);
    const requiredAges = ['infant', 'toddler', 'preschool', 'school', 'preteen'];
    
    return requiredAges.every(age => sceneCache.has(age));
  }

  /**
   * ✅ ENHANCED: Generate batch cache with progress callback
   * @param {string} sceneId 
   * @param {number} agentCount 
   * @param {number} duration 
   * @param {Function} progressCallback - Optional (percent, message) => void
   */
  async generateBatchCache(sceneId, agentCount, duration, progressCallback = null) {
    console.log(`🔄 Generating cache for all age groups...`);
    console.log(`   Scene: ${sceneId}, Agents: ${agentCount}, Duration: ${duration}s`);
    
    // Helper to update progress
    const updateProgress = (percent, message) => {
      if (progressCallback) {
        progressCallback(percent, message);
      }
    };
    
    // Evict oldest if needed
    this.evictOldestIfNeeded();
    
    // Create abort controller
    const controller = new AbortController();
    const requestId = `batch_${Date.now()}`;
    this.activeRequests.set(requestId, controller);
    
    try {
      updateProgress(5, 'Starting batch simulation...');
      
      // Extended timeout for batch simulations (10 minutes)
      const timeoutId = setTimeout(() => {
        console.error('⚠️ Batch simulation timeout - aborting...');
        controller.abort();
      }, this.TIMEOUT_MS);

      updateProgress(10, 'Sending simulation request...');

      const response = await fetch('/api/simulate/batch-all-ages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, agentCount, duration }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Batch simulation failed');
      }

      updateProgress(30, 'Batch simulation completed, loading results...');
      console.log('✅ Batch simulation completed, loading results...');

      // Create cache structure with size limit
      if (!this.cache.has(sceneId)) {
        this.cache.set(sceneId, new Map());
      } else {
        // Touch to mark as recently used
        this.touchScene(sceneId);
      }

      const sceneCache = this.cache.get(sceneId);

      // Load each simulation
      const ageGroups = Object.keys(data.results);
      let successCount = 0;

      for (let i = 0; i < ageGroups.length; i++) {
        const ageGroupId = ageGroups[i];
        
        // Calculate progress (30% to 90% range)
        const baseProgress = 30;
        const progressRange = 60;
        const currentProgress = baseProgress + (progressRange * (i / ageGroups.length));
        
        updateProgress(currentProgress, `Loading ${ageGroupId} data (${i + 1}/${ageGroups.length})...`);
        
        // Check if aborted before each fetch
        if (controller.signal.aborted) {
          throw new Error('Request aborted by timeout or user');
        }

        try {
          const info = data.results[ageGroupId];
          
          if (info.error) {
            console.error(`   ❌ ${ageGroupId}: ${info.error}`);
            continue;
          }

          console.log(`   📥 Loading ${ageGroupId} data...`);
          
          const simController = new AbortController();
          const simTimeoutId = setTimeout(() => simController.abort(), 30000);

          // Add AbortSignal to fetch
          const simResponse = await fetch(`/api/simulate/${info.simulationId}/status`, {
            signal: simController.signal
          });
          
          clearTimeout(simTimeoutId);

          if (!simResponse.ok) {
            throw new Error(`Failed to load ${ageGroupId}: ${simResponse.status}`);
          }

          const simData = await simResponse.json();
          
          // Aggressive data compression
          const compactData = this.compressSimulationData(simData);
          
          sceneCache.set(ageGroupId, compactData);
          successCount++;
          
          console.log(`   ✅ ${ageGroupId} loaded (${successCount}/${ageGroups.length})`);
          
          // Log memory usage
          const memUsageMB = this.getApproximateCacheSizeMB();
          console.log(`   💾 Cache size: ${memUsageMB}MB`);

        } catch (error) {
          if (error.name === 'AbortError') {
            console.log(`   ⚠️ ${ageGroupId} load aborted`);
            break;
          }
          console.error(`   ❌ Failed to load ${ageGroupId}:`, error.message);
        }
      }

      this.currentSceneId = sceneId;
      
      updateProgress(95, 'Finalizing cache...');
      
      console.log(`✅ Cache ready: ${successCount}/${ageGroups.length} age groups loaded`);
      console.log(`   Cache size: ${this.cache.size}/${this.MAX_SCENES} scenes`);
      console.log(`   Total memory: ${this.getApproximateCacheSizeMB()}MB`);
      
      updateProgress(100, 'Cache generation complete!');
      
      return successCount > 0;

    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('❌ Cache generation timeout - server took too long');
        console.error('   Try reducing agent count or duration');
        console.error(`   Current settings: ${agentCount} agents, ${duration}s duration`);
      } else {
        console.error('❌ Cache generation failed:', error.message);
      }
      
      updateProgress(0, `Error: ${error.message}`);
      return false;
      
    } finally {
      // Cleanup abort controller
      this.activeRequests.delete(requestId);
    }
  }

  /**
   *  Compress simulation data to reduce memory usage
   */
  compressSimulationData(simData) {
    const compressed = {
      simulationId: simData.simulationId,
      sceneId: simData.sceneId,
      ageGroupId: simData.ageGroupId,
      timestamp: simData.timestamp,
      config: simData.config,
      
      //  Compress trajectories: sample every 10th point, round to 2 decimals
      trajectories: simData.trajectories?.map(t => ({
        agentId: t.agentId,
        positions: t.positions
          ?.filter((_, i) => i % 10 === 0) // Sample every 10th
          ?.map(p => p.map(v => Math.round(v * 100) / 100)) // Round to 2 decimals
          ?.slice(0, 30) || [], // Max 30 points
        finalState: t.finalState
      })) || [],
      
      //  Filter collision events: only significant injuries (score > 10)
      collisionEvents: simData.collisionEvents
        ?.filter(e => !e.injury || e.injury.injuryScore > 10)
        ?.slice(0, 200) // Max 200 events
        ?.map(e => ({
          time: Math.round(e.time * 10) / 10, // Round time
          agentId: e.agentId,
          objectId: e.objectId,
          objectName: e.objectName,
          position: e.position?.map(v => Math.round(v * 100) / 100),
          velocity: Math.round(e.velocity * 100) / 100,
          injury: e.injury ? {
            injuryScore: e.injury.injuryScore,
            riskTier: e.injury.riskTier,
            bodyPart: e.injury.bodyPart
          } : null
        })) || [],
      
      behaviorStats: simData.behaviorStats,
      summary: simData.summary
    };
    
    // Log compression ratio
    const originalSize = JSON.stringify(simData).length;
    const compressedSize = JSON.stringify(compressed).length;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    console.log(`   📦 Compressed: ${(originalSize/1024).toFixed(0)}KB → ${(compressedSize/1024).toFixed(0)}KB (${ratio}% reduction)`);
    
    return compressed;
  }

  /**
   * Abort active requests
   */
  abortActiveRequests() {
    console.log(`⚠️ Aborting ${this.activeRequests.size} active requests...`);
    
    for (const [requestId, controller] of this.activeRequests.entries()) {
      try {
        controller.abort();
        this.activeRequests.delete(requestId);
      } catch (err) {
        console.warn(`Failed to abort ${requestId}:`, err.message);
      }
    }
  }

  getCachedSimulation(sceneId, ageGroupId) {
    if (!this.cache.has(sceneId)) {
      console.warn(`⚠️ No cache found for scene: ${sceneId}`);
      return null;
    }
    
    // Touch to mark as recently used
    this.touchScene(sceneId);
    
    const sceneCache = this.cache.get(sceneId);
    const simulation = sceneCache.get(ageGroupId);
    
    if (!simulation) {
      console.warn(`⚠️ No cached simulation for age group: ${ageGroupId}`);
    }
    
    return simulation || null;
  }

  clearCache(sceneId) {
    if (sceneId) {
      this.cache.delete(sceneId);
      console.log(`🗑️ Cleared cache for scene: ${sceneId}`);
      
      if (this.currentSceneId === sceneId) {
        this.currentSceneId = null;
      }
    } else {
      // Clear all
      this.cache.clear();
      this.currentSceneId = null;
      console.log('🗑️ Cleared all cache');
    }
    
    // Also abort any active requests
    this.abortActiveRequests();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('🗑️ Garbage collection triggered');
    }
  }

  getStats() {
    const stats = {
      totalScenes: this.cache.size,
      maxScenes: this.MAX_SCENES,
      currentScene: this.currentSceneId,
      activeRequests: this.activeRequests.size,
      totalMemoryMB: this.getApproximateCacheSizeMB(),
      timeoutMinutes: this.TIMEOUT_MS / 60000,
      scenes: {}
    };

    for (const [sceneId, sceneCache] of this.cache.entries()) {
      const ageGroups = Array.from(sceneCache.keys());
      
      // Calculate approximate memory usage
      let approxMemoryMB = 0;
      sceneCache.forEach(simData => {
        const jsonStr = JSON.stringify(simData);
        approxMemoryMB += jsonStr.length / (1024 * 1024);
      });
      
      stats.scenes[sceneId] = {
        ageGroups,
        count: sceneCache.size,
        isCurrent: sceneId === this.currentSceneId,
        approxMemoryMB: approxMemoryMB.toFixed(2)
      };
    }

    return stats;
  }

  hasAgeGroupCached(sceneId, ageGroupId) {
    if (!this.cache.has(sceneId)) return false;
    return this.cache.get(sceneId).has(ageGroupId);
  }

  getCachedAgeGroups(sceneId) {
    if (!this.cache.has(sceneId)) return [];
    return Array.from(this.cache.get(sceneId).keys());
  }

  /**
   * Estimate total cache size
   */
  getApproximateCacheSizeMB() {
    let totalBytes = 0;
    
    for (const [sceneId, sceneCache] of this.cache.entries()) {
      sceneCache.forEach(simData => {
        const jsonStr = JSON.stringify(simData);
        totalBytes += jsonStr.length;
      });
    }
    
    return (totalBytes / (1024 * 1024)).toFixed(2);
  }

  /**
   *   Better memory management with warning thresholds
   */
  evictIfMemoryHigh(maxMemoryMB = 100) {
    const currentMemoryMB = parseFloat(this.getApproximateCacheSizeMB());
    
    if (currentMemoryMB > maxMemoryMB) {
      console.warn(`⚠️ Cache memory high: ${currentMemoryMB}MB > ${maxMemoryMB}MB`);
      
      // Evict oldest scenes until under limit
      let evictedCount = 0;
      while (parseFloat(this.getApproximateCacheSizeMB()) > maxMemoryMB && this.cache.size > 1) {
        const oldestKey = this.cache.keys().next().value;
        
        if (oldestKey && oldestKey !== this.currentSceneId) {
          console.log(`🗑️ Memory evicting scene: ${oldestKey}`);
          this.cache.delete(oldestKey);
          evictedCount++;
        } else {
          break;
        }
      }
      
      console.log(`✅ Evicted ${evictedCount} scenes`);
      console.log(`   Cache memory now: ${this.getApproximateCacheSizeMB()}MB`);
      
      // Force GC after eviction
      if (global.gc && evictedCount > 0) {
        global.gc();
        console.log('🗑️ Garbage collection triggered after eviction');
      }
    }
  }
}

// Export singleton instance
export default new SimulationCacheManager();