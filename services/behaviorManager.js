import geminiAPI from './geminiAPI.js';

class BehaviorManager {
  constructor() {
    this.behaviorPolicies = new Map(); // sceneId_ageGroupId -> behaviors
    this.rareEventChains = new Map();  // sceneId_ageGroupId -> events
    this.initialized = false;
  }

  /**
   * Generate and cache behaviors for a scene + age group
   */
  async generateBehaviorsForScene(sceneData, ageGroupId) {
    const cacheKey = `${sceneData.id}_${ageGroupId}`;

    // Check cache first
    if (this.behaviorPolicies.has(cacheKey)) {
      console.log(`📦 Using cached behaviors for ${cacheKey}`);
      return {
        behaviors: this.behaviorPolicies.get(cacheKey),
        rareEvents: this.rareEventChains.get(cacheKey) || []
      };
    }

    console.log(`🤖 Generating AI behaviors for ${ageGroupId}...`);

    try {
      const ageGroup = this.getAgeGroupData(ageGroupId);

      // Generate behavior policy
      const behaviors = await this.generateBehaviorPolicy(sceneData, ageGroup);
      
      // Generate rare event chains
      const rareEvents = await this.generateRareEvents(sceneData, ageGroup);

      // Cache results
      this.behaviorPolicies.set(cacheKey, behaviors);
      this.rareEventChains.set(cacheKey, rareEvents);

      console.log(`✅ Generated ${behaviors.length} behaviors, ${rareEvents.length} rare events`);

      return { behaviors, rareEvents };

    } catch (error) {
      console.error('❌ Behavior generation failed:', error.message);
      
      // Return default behaviors
      return {
        behaviors: this.getDefaultBehaviors(ageGroupId),
        rareEvents: []
      };
    }
  }

  /**
   * Generate behavior policy using AI
   */
  async generateBehaviorPolicy(sceneData, ageGroup) {
    if (!geminiAPI.isAvailable()) {
      return this.getDefaultBehaviors(ageGroup.id);
    }

    try {
      const behaviors = await geminiAPI.generateBehaviorPolicy(sceneData, ageGroup);
      return this.validateBehaviors(behaviors, ageGroup);
    } catch (error) {
      console.warn('Behavior policy generation failed, using defaults');
      return this.getDefaultBehaviors(ageGroup.id);
    }
  }

  /**
   * Generate rare event chains using AI
   */
  async generateRareEvents(sceneData, ageGroup) {
    if (!geminiAPI.isAvailable()) {
      return [];
    }

    try {
      const events = await geminiAPI.generateRareEventChains(sceneData, ageGroup);
      return this.validateRareEvents(events, ageGroup);
    } catch (error) {
      console.warn('Rare events generation failed');
      return [];
    }
  }

  /**
   * Validate and filter behaviors based on age capabilities
   */
  validateBehaviors(behaviors, ageGroup) {
    if (!Array.isArray(behaviors)) return [];

    return behaviors.filter(behavior => {
      if (!behavior.sequence || !Array.isArray(behavior.sequence)) return false;

      // Check if all actions are age-appropriate
      for (const action of behavior.sequence) {
        if (action.action === 'climb' && !ageGroup.canClimb) return false;
        if (action.action === 'walk_to' && !ageGroup.canWalk) return false;
        if (action.height && action.height > ageGroup.reachHeight) return false;
      }

      return true;
    });
  }

  /**
   * Validate rare events
   */
  validateRareEvents(events, ageGroup) {
    if (!Array.isArray(events)) return [];

    return events.filter(event => {
      if (!event.chain || !Array.isArray(event.chain)) return false;
      
      // Filter out events that are impossible for this age group
      for (const step of event.chain) {
        if (step.action === 'climb_on' && !ageGroup.canClimb) return false;
      }

      return true;
    });
  }

  /**
   * Distribute behaviors to agents
   */
  distributeBehaviors(agents, behaviors, rareEvents = []) {
    if (agents.length === 0) return;

    console.log(`📤 Distributing ${behaviors.length} behaviors to ${agents.length} agents`);

    // Give each agent a subset of behaviors
    agents.forEach((agent, index) => {
      // Select random subset of behaviors (2-4 behaviors per agent)
      const behaviorCount = Math.min(behaviors.length, 2 + Math.floor(Math.random() * 3));
      const agentBehaviors = this.shuffleArray([...behaviors]).slice(0, behaviorCount);
      
      agent.loadBehaviorPolicy(agentBehaviors);
    });

    // Assign rare events to specific agents (low probability)
    if (rareEvents.length > 0) {
      rareEvents.forEach(event => {
        const probability = event.estimatedProbability || 0.001;
        
        // Probabilistically assign to an agent
        if (Math.random() < probability * 10) { // Boost probability for demo
          const randomAgent = agents[Math.floor(Math.random() * agents.length)];
          randomAgent.startRareEventChain(event);
          console.log(`⚠️  Rare event "${event.eventChainId}" assigned to agent ${randomAgent.id}`);
        }
      });
    }
  }

  /**
   * Get default behaviors for age group (fallback)
   */
  getDefaultBehaviors(ageGroupId) {
    const baseWalk = {
      behaviorId: 'random_walk',
      description: 'Random exploration movement',
      probability: 1.0,
      sequence: [
        { action: 'walk_random', duration: 10.0 }
      ]
    };

    const ageGroup = this.getAgeGroupData(ageGroupId);

    if (!ageGroup.canWalk) {
      return [{
        behaviorId: 'crawl_explore',
        description: 'Crawl around the room',
        probability: 1.0,
        sequence: [
          { action: 'crawl', duration: 10.0 }
        ]
      }];
    }

    // Add age-appropriate default behaviors
    const behaviors = [baseWalk];

    if (ageGroup.canClimb && ageGroup.curiosity > 0.7) {
      behaviors.push({
        behaviorId: 'explore_high',
        description: 'Try to reach high objects',
        probability: 0.5,
        sequence: [
          { action: 'walk_random', duration: 3.0 },
          { action: 'reach_up', height: ageGroup.reachHeight, duration: 2.0 }
        ]
      });
    }

    return behaviors;
  }

  /**
   * Get age group data helper
   */
  getAgeGroupData(ageGroupId) {
    const ageGroups = {
      infant: { id: 'infant', canWalk: false, canCrawl: true, canClimb: false, reachHeight: 0.2, curiosity: 0.8 },
      toddler: { id: 'toddler', canWalk: true, canCrawl: true, canClimb: true, reachHeight: 0.5, curiosity: 1.0 },
      preschool: { id: 'preschool', canWalk: true, canCrawl: false, canClimb: true, reachHeight: 0.8, curiosity: 0.95 },
      school: { id: 'school', canWalk: true, canCrawl: false, canClimb: true, reachHeight: 1.0, curiosity: 0.85 },
      preteen: { id: 'preteen', canWalk: true, canCrawl: false, canClimb: true, reachHeight: 1.2, curiosity: 0.7 }
    };

    return ageGroups[ageGroupId] || ageGroups.toddler;
  }

  /**
   * Utility: shuffle array
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.behaviorPolicies.clear();
    this.rareEventChains.clear();
    console.log('🗑️  Behavior cache cleared');
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      cachedPolicies: this.behaviorPolicies.size,
      cachedEvents: this.rareEventChains.size,
      keys: Array.from(this.behaviorPolicies.keys())
    };
  }
}

export default new BehaviorManager();