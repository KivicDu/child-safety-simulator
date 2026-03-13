/**
 * ============================================================================
 * HYBRID BEHAVIOR ENGINE
 * Automatic fallback between AI (Gemini) and Research-based behaviors
 * ============================================================================
 */

import StandardBehaviorLibrary from './standardBehaviorLibrary.js';
import geminiAPI from './geminiAPI.js';
import { getAgeGroup } from '../config/ageGroups.js';

class HybridBehaviorEngine {
  constructor() {
    this.mode = 'AUTO'; // AUTO, AI_ONLY, FALLBACK_ONLY
    this.statistics = {
      aiSuccesses: 0,
      aiFallbacks: 0,
      fallbackReasons: {},
      totalRequests: 0
    };
    
    // Configuration
    this.config = {
      aiTimeout: 15000, // 15 seconds (fast fallback to research-based behaviors)
      maxRetries: 2,
      fallbackOnRateLimit: true,
      fallbackOnTimeout: true,
      fallbackOnError: true,
      cacheEnabled: true
    };

    // Cache for AI responses
    this.cache = new Map();
  }

  /**
   * ========================================================================
   * MAIN API: Get behaviors with automatic fallback
   * ========================================================================
   */

  /**
   * Get behaviors for a scene and age group
   * Tries AI first, falls back to research-based on failure
   * 
   * @param {Object} sceneData - Parsed scene data
   * @param {string} ageGroupId - Age group identifier
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Behavior policy and rare events
   */
  async getBehaviorWithFallback(sceneData, ageGroupId, options = {}) {
    this.statistics.totalRequests++;

    const cacheKey = this.getCacheKey(sceneData.id, ageGroupId);
    
    // Check cache first
    if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
      console.log(`📦 Using cached behaviors for ${ageGroupId}`);
      return this.cache.get(cacheKey);
    }

    // Mode-specific routing
    if (this.mode === 'FALLBACK_ONLY') {
      return this.getFallbackBehaviors(sceneData, ageGroupId, 'MODE_OVERRIDE');
    }

    if (this.mode === 'AI_ONLY') {
      return this.getAIBehaviors(sceneData, ageGroupId, options);
    }

    // AUTO mode: Try AI first, fallback on failure
    try {
      console.log(`🤖 Attempting AI behavior generation for ${ageGroupId}...`);
      
      const result = await this.getAIBehaviors(sceneData, ageGroupId, options);
      
      // Validate AI response
      if (this.validateBehaviorResponse(result)) {
        this.statistics.aiSuccesses++;
        
        // Cache successful response
        if (this.config.cacheEnabled) {
          this.cache.set(cacheKey, result);
        }
        
        console.log(`✅ AI behavior generation successful`);
        return result;
      } else {
        console.warn(`⚠️  AI response validation failed, using fallback`);
        return this.getFallbackBehaviors(sceneData, ageGroupId, 'VALIDATION_FAILED');
      }

    } catch (error) {
      return this.handleAIError(error, sceneData, ageGroupId);
    }
  }

  /**
   * ========================================================================
   * AI BEHAVIOR GENERATION
   * ========================================================================
   */

  async getAIBehaviors(sceneData, ageGroupId, options = {}) {
    const startTime = Date.now();
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('AI_TIMEOUT'));
      }, this.config.aiTimeout);
    });

    // Race between AI call and timeout
    const aiPromise = this.callGeminiAPI(sceneData, ageGroupId, options);
    
    try {
      const result = await Promise.race([aiPromise, timeoutPromise]);
      const elapsed = Date.now() - startTime;
      
      console.log(`⏱️  AI response time: ${elapsed}ms`);
      
      return result;

    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`⏱️  AI failed after: ${elapsed}ms`);
      throw error;
    }
  }

  async callGeminiAPI(sceneData, ageGroupId, options = {}) {
    // Ensure Gemini is initialized — fast-fail if init already attempted
    if (!geminiAPI.isAvailable()) {
      await geminiAPI.init();
      // If still not available after init, throw immediately instead of wasting time
      if (!geminiAPI.isAvailable()) {
        throw new Error('Gemini API not available after init attempt');
      }
    }

    // Age group CONFIG (from ageGroups.js) has .name, .height, .canClimb, .ageRange
    // used by Gemini prompts to generate contextually accurate behaviors
    const ageGroupConfig = getAgeGroup(ageGroupId);
    // Behavior library data has .behaviors, .rareEvents for validation/normalization
    const ageGroupBehaviors = StandardBehaviorLibrary.getBehaviorsForAgeGroup(ageGroupId);

    // Generate behavior policy
    let behaviors = [];
    let retries = 0;

    while (retries < this.config.maxRetries) {
      try {
        behaviors = await geminiAPI.generateBehaviorPolicy(sceneData, ageGroupConfig);
        break; // Success
      } catch (error) {
        retries++;
        
        if (retries >= this.config.maxRetries) {
          throw error;
        }
        
        console.log(`⚠️  AI retry ${retries}/${this.config.maxRetries}`);
        await this.delay(1000 * retries); // Exponential backoff
      }
    }

    // Generate rare events
    let rareEvents = [];
    try {
      rareEvents = await geminiAPI.generateRareEventChains(sceneData, ageGroupConfig);
    } catch (error) {
      console.warn(`⚠️  Rare events generation failed, using defaults`);
      rareEvents = ageGroupBehaviors.rareEvents || [];
    }

    return {
      source: 'AI',
      ageGroupId,
      behaviors: this.validateAndNormalizeBehaviors(behaviors, ageGroupBehaviors),
      rareEvents: this.validateRareEvents(rareEvents, ageGroupBehaviors),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * ========================================================================
   * FALLBACK BEHAVIOR GENERATION
   * ========================================================================
   */

  getFallbackBehaviors(sceneData, ageGroupId, reason = 'UNKNOWN') {
    console.log(`📚 Using fallback behaviors for ${ageGroupId}`);
    console.log(`   Reason: ${reason}`);
    
    this.statistics.aiFallbacks++;
    this.recordFallbackReason(reason);

    // Get research-based behaviors
    const ageData = StandardBehaviorLibrary.getBehaviorsForAgeGroup(ageGroupId);

    // Extract object types from scene
    const availableObjects = this.extractObjectTypes(sceneData);

    // Select behaviors using weighted random
    const selectedBehaviors = this.selectContextualBehaviors(
      ageData.behaviors,
      availableObjects,
      sceneData,
      ageGroupId
    );

    // Select rare events
    const selectedRareEvents = this.selectRareEvents(
      ageData.rareEvents || [],
      availableObjects,
      sceneData
    );

    return {
      source: 'FALLBACK',
      reason,
      ageGroupId,
      behaviors: selectedBehaviors,
      rareEvents: selectedRareEvents,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Select behaviors relevant to current scene
   */
  selectContextualBehaviors(behaviors, availableObjects, sceneData, ageGroupId) {
    const selected = [];
    const minBehaviors = 3;
    const maxBehaviors = 8;

    // Filter behaviors that can be executed in this scene
    const eligible = behaviors.filter(behavior => {
      return behavior.targetTypes.some(type => 
        this.matchesObjectType(type, availableObjects)
      );
    });

    if (eligible.length === 0) {
      console.warn('⚠️  No eligible behaviors found, using default wander');
      return [StandardBehaviorLibrary.getDefaultWanderBehavior(ageGroupId)];
    }

    // Weighted random selection
    const targetCount = Math.min(
      Math.max(minBehaviors, Math.floor(eligible.length * 0.6)),
      maxBehaviors
    );

    for (let i = 0; i < targetCount; i++) {
      const behavior = StandardBehaviorLibrary.selectBehaviorWeighted(
        eligible,
        { availableObjects, sceneData }
      );

      // Avoid duplicates
      if (!selected.find(b => b.behaviorId === behavior.behaviorId)) {
        selected.push(behavior);
      }
    }

    console.log(`   Selected ${selected.length} behaviors from ${eligible.length} eligible`);
    
    return selected;
  }

  /**
   * Select rare events based on scene context
   */
  selectRareEvents(rareEvents, availableObjects, sceneData) {
    if (!rareEvents || rareEvents.length === 0) {
      return [];
    }

    // Filter rare events that can occur in this scene
    const eligible = rareEvents.filter(event => {
      if (!event.triggerConditions) return false;
      
      // Check if trigger conditions can be met
      return event.triggerConditions.some(condition =>
        this.matchesObjectType(condition, availableObjects)
      );
    });

    // Return all eligible rare events (they have low probability already)
    console.log(`   Selected ${eligible.length} rare events from ${rareEvents.length} total`);
    
    return eligible;
  }

  /**
   * ========================================================================
   * ERROR HANDLING
   * ========================================================================
   */

  handleAIError(error, sceneData, ageGroupId) {
    const errorType = this.classifyError(error);
    
    console.error(`❌ AI Error: ${errorType}`);
    console.error(`   Message: ${error.message}`);

    // Determine if we should fallback
    const shouldFallback = (
      (errorType === 'RATE_LIMIT' && this.config.fallbackOnRateLimit) ||
      (errorType === 'TIMEOUT' && this.config.fallbackOnTimeout) ||
      (errorType === 'ERROR' && this.config.fallbackOnError)
    );

    if (shouldFallback) {
      return this.getFallbackBehaviors(sceneData, ageGroupId, errorType);
    } else {
      throw error; // Re-throw if fallback disabled
    }
  }

  classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('429') || message.includes('rate limit')) {
      return 'RATE_LIMIT';
    }
    
    if (message.includes('timeout') || message.includes('ai_timeout')) {
      return 'TIMEOUT';
    }
    
    if (message.includes('network') || message.includes('fetch')) {
      return 'NETWORK';
    }
    
    if (message.includes('quota') || message.includes('exceeded')) {
      return 'QUOTA_EXCEEDED';
    }
    
    return 'ERROR';
  }

  /**
   * ========================================================================
   * VALIDATION
   * ========================================================================
   */

  validateBehaviorResponse(response) {
    if (!response) return false;
    
    // Check structure
    if (!response.behaviors || !Array.isArray(response.behaviors)) {
      return false;
    }

    // Must have at least one behavior
    if (response.behaviors.length === 0) {
      return false;
    }

    // [BUG-02 FIX] Validate each behavior has required fields.
    // A behavior is valid if it has EITHER:
    //   (a) a non-empty sequence array (compound behavior), OR
    //   (b) a direct action field (leaf behavior — touch_object, mouth_object, climb_attempt, etc.)
    // Previously, only (a) was accepted → all flat/leaf behaviors were silently rejected,
    // reducing injury event count by 30–50% and causing agents to never mouth/climb objects.
    for (const behavior of response.behaviors) {
      const hasSequence = behavior.sequence && Array.isArray(behavior.sequence) && behavior.sequence.length > 0;
      const isLeaf = !!behavior.action;
      if (!hasSequence && !isLeaf) {
        return false;
      }
      if (!behavior.behaviorId || !behavior.probability) {
        return false;
      }
    }

    return true;
  }

  validateAndNormalizeBehaviors(behaviors, ageGroup) {
    if (!behaviors || !Array.isArray(behaviors)) {
      return [];
    }

    // [BUG-02 FIX] Leaf behaviors have a direct `action` field but no `sequence`.
    // Previously, `.filter(b => b.sequence.length > 0)` removed ALL leaf behaviors
    // (touch_object, mouth_object, climb_attempt, etc.) — dropping 30-50% of
    // interaction behaviors. Leaf behaviors are now passed through as-is.
    return behaviors.map(behavior => {
      const isLeaf = !behavior.sequence && !!behavior.action;

      const normalized = {
        behaviorId: behavior.behaviorId || `ai_behavior_${Date.now()}`,
        description: behavior.description || 'AI-generated behavior',
        probability: Math.max(0, Math.min(1, behavior.probability || 0.5)),
        ...behavior,
      };

      if (!isLeaf) {
        normalized.sequence = (behavior.sequence || []).map(step => {
          let action = step.action || 'walk';
          if (ageGroup.ageGroup === 'infant' && (action === 'walk' || action === 'run' || action === 'sprint' || action === 'walk_to' || action === 'walk_random')) {
            action = 'crawl';
          }
          return { ...step, action };
        });
      } else {
        if (ageGroup.ageGroup === 'infant') {
          const a = normalized.action;
          if (a === 'walk' || a === 'run' || a === 'sprint' || a === 'walk_to' || a === 'walk_random') {
            normalized.action = 'crawl';
          }
        }
      }

      return normalized;
    }).filter(b => {
      const hasSequence = b.sequence && Array.isArray(b.sequence) && b.sequence.length > 0;
      const isLeaf = !b.sequence && !!b.action;
      return hasSequence || isLeaf;
    });
  }

  validateRareEvents(events, ageGroup) {
    if (!events || !Array.isArray(events)) {
      return [];
    }

    return events.filter(event => {
      return event.chain && Array.isArray(event.chain) && event.chain.length > 0;
    }).map(event => ({
      ...event,
      chain: event.chain.map(step => {
        let action = step.action || 'walk';
        if (ageGroup.ageGroup === 'infant' && (action === 'walk' || action === 'run' || action === 'sprint' || action === 'walk_to' || action === 'walk_random')) {
          action = 'crawl';
        }
        return { ...step, action };
      })
    }));
  }

  /**
   * ========================================================================
   * UTILITY METHODS
   * ========================================================================
   */

  extractObjectTypes(sceneData) {
    const types = new Set();

    if (sceneData.objects) {
      sceneData.objects.forEach(obj => {
        // Add classified category
        if (obj.classification?.category) {
          types.add(obj.classification.category);
        }
        
        // Add subcategory
        if (obj.classification?.subcategory) {
          types.add(obj.classification.subcategory);
        }

        // Add from name
        if (obj.name) {
          const name = obj.name.toLowerCase();
          
          // Common furniture types
          const furnitureTypes = ['table', 'chair', 'shelf', 'drawer', 'cabinet', 'door', 'bed', 'couch'];
          furnitureTypes.forEach(type => {
            if (name.includes(type)) types.add(type);
          });
        }
      });
    }

    // Add generic types
    types.add('floor');
    types.add('wall');

    return Array.from(types);
  }

  matchesObjectType(behaviorType, availableObjects) {
    // Direct match
    if (availableObjects.includes(behaviorType)) {
      return true;
    }

    // Fuzzy match
    const normalized = behaviorType.toLowerCase().replace(/_/g, ' ');
    
    return availableObjects.some(obj => {
      const objNormalized = obj.toLowerCase().replace(/_/g, ' ');
      return objNormalized.includes(normalized) || normalized.includes(objNormalized);
    });
  }

  getCacheKey(sceneId, ageGroupId) {
    return `${sceneId}_${ageGroupId}`;
  }

  recordFallbackReason(reason) {
    if (!this.statistics.fallbackReasons[reason]) {
      this.statistics.fallbackReasons[reason] = 0;
    }
    this.statistics.fallbackReasons[reason]++;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ========================================================================
   * CONFIGURATION & STATS
   * ========================================================================
   */

  setMode(mode) {
    const validModes = ['AUTO', 'AI_ONLY', 'FALLBACK_ONLY'];
    
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
    }

    this.mode = mode;
    console.log(`🔧 Behavior engine mode set to: ${mode}`);
  }

  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️  Hybrid engine config updated:', this.config);
  }

  getStatistics() {
    const successRate = this.statistics.totalRequests > 0
      ? (this.statistics.aiSuccesses / this.statistics.totalRequests * 100).toFixed(1)
      : 0;

    const fallbackRate = this.statistics.totalRequests > 0
      ? (this.statistics.aiFallbacks / this.statistics.totalRequests * 100).toFixed(1)
      : 0;

    return {
      mode: this.mode,
      totalRequests: this.statistics.totalRequests,
      aiSuccesses: this.statistics.aiSuccesses,
      aiFallbacks: this.statistics.aiFallbacks,
      successRate: successRate + '%',
      fallbackRate: fallbackRate + '%',
      fallbackReasons: this.statistics.fallbackReasons,
      cacheSize: this.cache.size
    };
  }

  clearCache() {
    this.cache.clear();
    console.log('🗑️  Behavior cache cleared');
  }

  clearStatistics() {
    this.statistics = {
      aiSuccesses: 0,
      aiFallbacks: 0,
      fallbackReasons: {},
      totalRequests: 0
    };
    console.log('🗑️  Statistics cleared');
  }
}

// Export singleton instance
export default new HybridBehaviorEngine();