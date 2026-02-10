/**
 * ============================================================================
 * BEHAVIOR MANAGER (Updated with Hybrid Engine)
 * ============================================================================
 */

import HybridBehaviorEngine from './hybridBehaviorEngine.js';
import StandardBehaviorLibrary from './standardBehaviorLibrary.js';

class BehaviorManager {
  constructor() {
    this.initialized = false;
  }

  /**
   * ========================================================================
   * MAIN API: Generate behaviors using Hybrid Engine
   * ========================================================================
   */

  /**
   * Generate behaviors for a scene and age group
   * Uses AI with automatic fallback to research-based behaviors
   * 
   * @param {Object} sceneData - Parsed scene data
   * @param {string} ageGroupId - Age group identifier
   * @returns {Promise<Object>} Behavior policy and rare events
   */
  async generateBehaviorsForScene(sceneData, ageGroupId) {
    console.log(`🤖 Generating behaviors for ${ageGroupId}...`);

    try {
      // Use Hybrid Engine (AI + Fallback)
      const result = await HybridBehaviorEngine.getBehaviorWithFallback(
        sceneData,
        ageGroupId
      );

      const { behaviors, rareEvents, source } = result;

      console.log(`✅ Behavior generation complete`);
      console.log(`   Source: ${source}`);
      console.log(`   Behaviors: ${behaviors.length}`);
      console.log(`   Rare events: ${rareEvents.length}`);

      return { behaviors, rareEvents };

    } catch (error) {
      console.error('❌ Behavior generation failed:', error.message);
      
      // Ultimate fallback: return default wander behavior
      console.log('🆘 Using emergency fallback behavior');
      
      return {
        behaviors: [StandardBehaviorLibrary.getDefaultWanderBehavior(ageGroupId)],
        rareEvents: []
      };
    }
  }

  /**
   * ========================================================================
   * AGENT DISTRIBUTION
   * ========================================================================
   */

  /**
   * Distribute behaviors to agents
   * Each agent gets a subset of available behaviors
   * 
   * @param {Array} agents - Array of Agent instances
   * @param {Array} behaviors - Available behaviors
   * @param {Array} rareEvents - Rare event chains
   */
  distributeBehaviors(agents, behaviors, rareEvents = []) {
    if (agents.length === 0) {
      console.warn('⚠️  No agents to distribute behaviors to');
      return;
    }

    if (behaviors.length === 0) {
      console.warn('⚠️  No behaviors to distribute');
      return;
    }

    console.log(`📤 Distributing ${behaviors.length} behaviors to ${agents.length} agents`);

    // Give each agent a subset of behaviors
    agents.forEach((agent, index) => {
      // Select random subset of behaviors (2-4 behaviors per agent)
      const behaviorCount = Math.min(
        behaviors.length,
        2 + Math.floor(Math.random() * 3)
      );
      
      const agentBehaviors = this.shuffleArray([...behaviors])
        .slice(0, behaviorCount);
      
      agent.loadBehaviorPolicy(agentBehaviors);
    });

    // Assign rare events to specific agents (low probability)
    if (rareEvents.length > 0) {
      this.distributeRareEvents(agents, rareEvents);
    }

    console.log(`✅ Behaviors distributed`);
  }

  /**
   * Distribute rare events to agents
   */
  distributeRareEvents(agents, rareEvents) {
    rareEvents.forEach(event => {
      const probability = event.probability || 0.001;
      
      // Probabilistically assign to an agent
      // Boost probability slightly for demo purposes (10x)
      if (Math.random() < probability * 10) {
        const randomAgent = agents[Math.floor(Math.random() * agents.length)];
        randomAgent.startRareEventChain(event);
        
        console.log(`⚠️  Rare event "${event.eventId}" assigned to agent ${randomAgent.id}`);
      }
    });
  }

  /**
   * ========================================================================
   * CONFIGURATION
   * ========================================================================
   */

  /**
   * Set engine mode
   * @param {string} mode - 'AUTO', 'AI_ONLY', or 'FALLBACK_ONLY'
   */
  setMode(mode) {
    HybridBehaviorEngine.setMode(mode);
  }

  /**
   * Configure hybrid engine
   */
  setConfig(config) {
    HybridBehaviorEngine.setConfig(config);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      hybridEngine: HybridBehaviorEngine.getStatistics(),
      behaviorLibrary: StandardBehaviorLibrary.getStats()
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    HybridBehaviorEngine.clearCache();
    console.log('🗑️  Behavior cache cleared');
  }

  /**
   * ========================================================================
   * UTILITY
   * ========================================================================
   */

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

export default new BehaviorManager();