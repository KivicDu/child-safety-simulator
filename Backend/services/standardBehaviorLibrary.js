/**
 * ============================================================================
 * STANDARD BEHAVIOR LIBRARY
 * Research-based behavior templates for child safety simulation
 * ============================================================================
 * 
 * Data sources:
 * - CDC Child Development Research (2023)
 * - CPSC Injury Pattern Studies
 * - Developmental Psychology Literature
 * - Pediatric Emergency Medicine Data
 * 
 * @version 1.0.0
 */

/**
 * Core behavior template structure
 * @typedef {Object} BehaviorTemplate
 * @property {string} behaviorId - Unique identifier
 * @property {string} description - Human-readable description
 * @property {string[]} targetTypes - Object types this behavior targets
 * @property {number} probability - Base probability (0-1)
 * @property {string} movementPattern - Movement type
 * @property {number} priority - Execution priority (1-10)
 * @property {Object} parameters - Additional parameters
 */

class StandardBehaviorLibrary {
  constructor() {
    this.version = '1.0.0';
    this.lastUpdated = '2025-02-08';
    
    // Initialize behavior database
    this.behaviors = this.initializeBehaviors();
  }

  /**
   * ========================================================================
   * INFANT BEHAVIORS (0-12 months)
   * ========================================================================
   * Research findings:
   * - Limited mobility (crawling primary mode)
   * - High curiosity for colorful/shiny objects
   * - Mouth exploration (choking hazard focus)
   * - Cannot climb or reach high objects
   */
  getInfantBehaviors() {
    return {
      ageGroup: 'infant',
      ageRange: '0-12 months',
      characteristics: {
        mobility: 'crawling',
        reachHeight: 0.2,
        explorationMode: 'mouth-first',
        riskAwareness: 0.1
      },
      
      behaviors: [
        {
          behaviorId: 'infant_crawl_to_small_object',
          description: 'Crawl toward small colorful objects (choking hazard)',
          targetTypes: ['toy', 'small_object', 'dropped_item'],
          probability: 0.85,
          movementPattern: 'crawl_direct',
          priority: 9,
          parameters: {
            speedMultiplier: 0.3,
            targetSizeMax: 0.05, // 5cm - choking hazard size
            preferredColors: ['red', 'yellow', 'blue'],
            approachDistance: 0.1,
            interactionType: 'grab_mouth'
          },
          sequence: [
            { action: 'crawl', duration: 3.0, target: 'object' },
            { action: 'reach', duration: 1.5, height: 0.2 },
            { action: 'grab', duration: 1.0 }
          ]
        },
        
        {
          behaviorId: 'infant_explore_floor',
          description: 'Random floor exploration (looking for objects)',
          targetTypes: ['floor', 'carpet'],
          probability: 0.70,
          movementPattern: 'crawl_wandering',
          priority: 5,
          parameters: {
            speedMultiplier: 0.2,
            changeDirectionInterval: 2.0,
            maxWanderDistance: 2.0
          },
          sequence: [
            { action: 'crawl', duration: 5.0, target: 'random' },
            { action: 'pause', duration: 1.0 },
            { action: 'look_around', duration: 0.5 }
          ]
        },
        
        {
          behaviorId: 'infant_reach_low_furniture',
          description: 'Pull on low furniture edges to stand',
          targetTypes: ['table_leg', 'chair', 'low_shelf'],
          probability: 0.45,
          movementPattern: 'crawl_direct',
          priority: 7,
          parameters: {
            maxHeight: 0.6,
            pullForce: 10, // Newtons
            stabilityCheck: true
          },
          sequence: [
            { action: 'crawl', duration: 2.0, target: 'furniture' },
            { action: 'pull_to_stand', duration: 2.0, force: 10 },
            { action: 'lose_balance', duration: 0.5, probability: 0.3 }
          ]
        },
        
        {
          behaviorId: 'infant_cord_attraction',
          description: 'Attracted to dangling cords (strangulation risk)',
          targetTypes: ['electrical_cord', 'window_blind_cord', 'cable'],
          probability: 0.65,
          movementPattern: 'crawl_direct',
          priority: 8,
          parameters: {
            maxDistance: 3.0,
            pullStrength: 5
          },
          sequence: [
            { action: 'crawl', duration: 3.0, target: 'cord' },
            { action: 'pull', duration: 2.0, continuous: true }
          ]
        }
      ],
      
      // Rare high-risk events (based on ER data)
      rareEvents: [
        {
          eventId: 'infant_outlet_exploration',
          description: 'Attempt to insert object into electrical outlet',
          triggerConditions: ['outlet_uncovered', 'small_object_in_hand'],
          probability: 0.001, // 0.1% per simulation
          severity: 10,
          chain: [
            { action: 'crawl', target: 'outlet', duration: 2.0 },
            { action: 'insert_object', duration: 1.0, risk: 'electrocution' }
          ]
        }
      ]
    };
  }

  /**
   * ========================================================================
   * TODDLER BEHAVIORS (1-3 years)
   * ========================================================================
   * Research findings:
   * - Newly walking (unstable gait)
   * - Maximum curiosity phase
   * - Can climb low furniture
   * - Limited understanding of danger
   * - Impulsive behavior
   */
  getToddlerBehaviors() {
    return {
      ageGroup: 'toddler',
      ageRange: '1-3 years',
      characteristics: {
        mobility: 'walking_unstable',
        reachHeight: 0.5,
        explorationMode: 'touch-everything',
        riskAwareness: 0.2
      },
      
      behaviors: [
        {
          behaviorId: 'toddler_climb_furniture',
          description: 'Climb chairs and tables to reach high objects',
          targetTypes: ['chair', 'table', 'low_shelf', 'drawer'],
          probability: 0.75,
          movementPattern: 'walk_then_climb',
          priority: 9,
          parameters: {
            maxClimbHeight: 1.0,
            climbSpeed: 0.3,
            fallRisk: 0.35, // 35% chance of falling
            targetHeight: 0.8
          },
          sequence: [
            { action: 'walk_to', duration: 2.0, target: 'furniture' },
            { action: 'climb_on', duration: 3.0, height: 0.6 },
            { action: 'reach_up', duration: 1.5, height: 0.5 },
            { action: 'lose_balance', duration: 0.5, probability: 0.35 }
          ]
        },
        
        {
          behaviorId: 'toddler_drawer_pull',
          description: 'Pull drawers creating tip-over hazard',
          targetTypes: ['drawer', 'cabinet', 'dresser'],
          probability: 0.68,
          movementPattern: 'walk_direct',
          priority: 8,
          parameters: {
            pullForce: 50, // Newtons
            tippingRiskMultiplier: 1.5,
            openAttempts: 3
          },
          sequence: [
            { action: 'walk_to', duration: 1.5, target: 'drawer' },
            { action: 'pull', duration: 2.0, force: 50, repetitions: 3 },
            { action: 'climb_drawer', duration: 2.0, probability: 0.4 }
          ]
        },
        
        {
          behaviorId: 'toddler_run_with_object',
          description: 'Run while holding sharp/hard objects (fall risk)',
          targetTypes: ['toy', 'utensil', 'tool'],
          probability: 0.55,
          movementPattern: 'run_zigzag',
          priority: 7,
          parameters: {
            speedMultiplier: 1.2,
            directionChangeInterval: 1.5,
            tripProbability: 0.25,
            objectType: ['sharp', 'hard']
          },
          sequence: [
            { action: 'grab', duration: 0.5, target: 'object' },
            { action: 'run', duration: 5.0, pattern: 'zigzag' },
            { action: 'trip', duration: 0.3, probability: 0.25 },
            { action: 'fall_forward', duration: 0.5, object_in_hand: true }
          ]
        },
        
        {
          behaviorId: 'toddler_door_slam',
          description: 'Open and slam doors (finger pinch risk)',
          targetTypes: ['door', 'cabinet_door'],
          probability: 0.50,
          movementPattern: 'walk_direct',
          priority: 6,
          parameters: {
            swingForce: 30,
            repetitions: 5,
            fingerPlacement: 'edge'
          },
          sequence: [
            { action: 'walk_to', duration: 1.0, target: 'door' },
            { action: 'swing_open', duration: 1.0, force: 30 },
            { action: 'swing_close', duration: 0.8, force: 30 },
            { action: 'repeat', count: 3 }
          ]
        },
        
        {
          behaviorId: 'toddler_window_blind_cord',
          description: 'Play with window blind cords (strangulation)',
          targetTypes: ['window_blind', 'curtain_cord'],
          probability: 0.42,
          movementPattern: 'walk_direct',
          priority: 9,
          parameters: {
            pullDuration: 10.0,
            wrapAroundNeck: 0.05 // 5% chance
          },
          sequence: [
            { action: 'walk_to', duration: 1.5, target: 'cord' },
            { action: 'pull', duration: 5.0, continuous: true },
            { action: 'wrap', duration: 2.0, bodyPart: 'neck', probability: 0.05 }
          ]
        },
        
        {
          behaviorId: 'toddler_explore_shelves',
          description: 'Pull items off shelves causing cascade falls',
          targetTypes: ['shelf', 'bookcase'],
          probability: 0.60,
          movementPattern: 'walk_direct',
          priority: 7,
          parameters: {
            pullForce: 20,
            itemsToRemove: 5
          },
          sequence: [
            { action: 'walk_to', duration: 1.0, target: 'shelf' },
            { action: 'reach_up', duration: 1.0, height: 0.5 },
            { action: 'pull_item', duration: 1.0, repetitions: 5 }
          ]
        }
      ],
      
      rareEvents: [
        {
          eventId: 'toddler_furniture_tip',
          description: 'Tip over unstable furniture by climbing',
          triggerConditions: ['tall_furniture', 'unstable_base'],
          probability: 0.005, // 0.5%
          severity: 10,
          chain: [
            { action: 'climb_on', target: 'furniture', duration: 2.0 },
            { action: 'furniture_tips', duration: 0.5, risk: 'crush' },
            { action: 'fall_under', duration: 0.5 }
          ]
        },
        
        {
          eventId: 'toddler_chemical_ingestion',
          description: 'Open and drink from cleaning product',
          triggerConditions: ['accessible_cabinet', 'bright_container'],
          probability: 0.002,
          severity: 10,
          chain: [
            { action: 'open_cabinet', duration: 2.0 },
            { action: 'grab_bottle', duration: 1.0 },
            { action: 'drink', duration: 1.0, risk: 'poisoning' }
          ]
        }
      ]
    };
  }

  /**
   * ========================================================================
   * PRESCHOOL BEHAVIORS (3-5 years)
   * ========================================================================
   * Research findings:
   * - Better motor control but overconfident
   * - Imaginative play scenarios
   * - Can open complex latches
   * - Understands "no" but tests boundaries
   * - Climbs higher surfaces
   */
  getPreschoolBehaviors() {
    return {
      ageGroup: 'preschool',
      ageRange: '3-5 years',
      characteristics: {
        mobility: 'walking_running',
        reachHeight: 0.8,
        explorationMode: 'imaginative-play',
        riskAwareness: 0.3
      },
      
      behaviors: [
        {
          behaviorId: 'preschool_counter_climb',
          description: 'Climb kitchen counters to reach forbidden items',
          targetTypes: ['counter', 'high_shelf', 'appliance'],
          probability: 0.65,
          movementPattern: 'strategic_climb',
          priority: 8,
          parameters: {
            useChair: true,
            maxHeight: 1.5,
            targetItems: ['cookies', 'candy', 'toys'],
            fallRisk: 0.25
          },
          sequence: [
            { action: 'move_chair', duration: 2.0, target: 'counter' },
            { action: 'climb_chair', duration: 1.5 },
            { action: 'climb_counter', duration: 2.0 },
            { action: 'reach_up', duration: 1.0, height: 0.8 }
          ]
        },
        
        {
          behaviorId: 'preschool_imaginative_jump',
          description: 'Jump from furniture pretending to fly/be superhero',
          targetTypes: ['bed', 'couch', 'chair', 'table'],
          probability: 0.58,
          movementPattern: 'climb_and_jump',
          priority: 7,
          parameters: {
            jumpHeight: 0.6,
            landingControl: 0.6, // 40% chance of bad landing
            impactForce: 'high'
          },
          sequence: [
            { action: 'climb_on', duration: 2.0, target: 'furniture' },
            { action: 'stand_up', duration: 1.0 },
            { action: 'jump', duration: 0.5, height: 0.6 },
            { action: 'land', duration: 0.3, control: 0.6 }
          ]
        },
        
        {
          behaviorId: 'preschool_hide_seek',
          description: 'Climb into tight/dangerous spaces (hide and seek)',
          targetTypes: ['cabinet', 'closet', 'dryer', 'toy_chest'],
          probability: 0.52,
          movementPattern: 'walk_direct',
          priority: 8,
          parameters: {
            entrapmentRisk: 0.15,
            suffocationRisk: 0.08,
            duration: 300 // 5 minutes
          },
          sequence: [
            { action: 'walk_to', duration: 1.0, target: 'hiding_spot' },
            { action: 'open', duration: 1.0 },
            { action: 'climb_in', duration: 2.0 },
            { action: 'stay_hidden', duration: 120.0 }
          ]
        },
        
        {
          behaviorId: 'preschool_run_obstacle',
          description: 'Run at high speed around furniture',
          targetTypes: ['open_space', 'hallway'],
          probability: 0.70,
          movementPattern: 'run_fast',
          priority: 6,
          parameters: {
            speedMultiplier: 1.8,
            collisionRisk: 0.35,
            sharpCornerDanger: true
          },
          sequence: [
            { action: 'run', duration: 8.0, speed: 1.8 },
            { action: 'collision', probability: 0.35, target: 'furniture_edge' }
          ]
        },
        
        {
          behaviorId: 'preschool_tool_use',
          description: 'Attempt to use adult tools (scissors, knife, etc)',
          targetTypes: ['drawer', 'toolbox', 'kitchen_drawer'],
          probability: 0.45,
          movementPattern: 'walk_direct',
          priority: 9,
          parameters: {
            toolTypes: ['scissors', 'knife', 'screwdriver'],
            lacerationRisk: 0.40
          },
          sequence: [
            { action: 'open_drawer', duration: 1.5 },
            { action: 'grab_tool', duration: 0.5 },
            { action: 'use_incorrectly', duration: 5.0, injury_probability: 0.4 }
          ]
        }
      ],
      
      rareEvents: [
        {
          eventId: 'preschool_window_fall',
          description: 'Climb to window and fall out',
          triggerConditions: ['low_window', 'no_guard'],
          probability: 0.001,
          severity: 10,
          chain: [
            { action: 'climb_to_window', duration: 3.0 },
            { action: 'lean_out', duration: 1.0 },
            { action: 'fall_out', duration: 0.5, risk: 'fatal' }
          ]
        }
      ]
    };
  }

  /**
   * ========================================================================
   * WEIGHTED RANDOM SELECTION
   * ========================================================================
   */

  /**
   * Select behavior using weighted random based on probabilities
   * @param {Array} behaviors - Array of behavior templates
   * @param {Object} context - Current simulation context
   * @returns {Object} Selected behavior
   */
  selectBehaviorWeighted(behaviors, context = {}) {
    // Filter behaviors based on context
    let eligible = behaviors.filter(b => {
      // Check if required objects exist in scene
      if (context.availableObjects) {
        const hasTarget = b.targetTypes.some(type => 
          context.availableObjects.includes(type)
        );
        if (!hasTarget) return false;
      }
      
      return true;
    });

    if (eligible.length === 0) {
      // Return default wander behavior
      return this.getDefaultWanderBehavior(context.ageGroup);
    }

    // Apply priority weighting
    eligible = eligible.map(b => ({
      ...b,
      adjustedProbability: b.probability * (b.priority / 5) // Normalize by priority
    }));

    // Calculate total weight
    const totalWeight = eligible.reduce((sum, b) => sum + b.adjustedProbability, 0);

    // Random selection
    let random = Math.random() * totalWeight;
    
    for (const behavior of eligible) {
      random -= behavior.adjustedProbability;
      if (random <= 0) {
        return behavior;
      }
    }

    return eligible[eligible.length - 1];
  }

  /**
   * Select multiple behaviors for an agent
   * @param {string} ageGroup - Age group ID
   * @param {number} count - Number of behaviors to select
   * @param {Object} context - Simulation context
   * @returns {Array} Array of selected behaviors
   */
  selectMultipleBehaviors(ageGroup, count = 3, context = {}) {
    const ageData = this.getBehaviorsForAgeGroup(ageGroup);
    const selected = [];

    for (let i = 0; i < count; i++) {
      const behavior = this.selectBehaviorWeighted(
        ageData.behaviors,
        { ...context, ageGroup }
      );
      
      // Avoid duplicates
      if (!selected.find(b => b.behaviorId === behavior.behaviorId)) {
        selected.push(behavior);
      }
    }

    return selected;
  }

  /**
   * ========================================================================
   * HELPER METHODS
   * ========================================================================
   */

  getBehaviorsForAgeGroup(ageGroupId) {
    switch (ageGroupId) {
      case 'infant':
        return this.getInfantBehaviors();
      case 'toddler':
        return this.getToddlerBehaviors();
      case 'preschool':
        return this.getPreschoolBehaviors();
      default:
        return this.getToddlerBehaviors(); // Default to toddler
    }
  }

  getDefaultWanderBehavior(ageGroup) {
    const canWalk = ageGroup !== 'infant';
    
    return {
      behaviorId: 'default_wander',
      description: 'Random exploration',
      targetTypes: ['floor'],
      probability: 1.0,
      movementPattern: canWalk ? 'walk_random' : 'crawl_random',
      priority: 1,
      parameters: {
        speedMultiplier: canWalk ? 0.8 : 0.3,
        changeDirectionInterval: 3.0
      },
      sequence: [
        { action: canWalk ? 'walk' : 'crawl', duration: 10.0, target: 'random' }
      ]
    };
  }

  getAllBehaviors() {
    return {
      infant: this.getInfantBehaviors(),
      toddler: this.getToddlerBehaviors(),
      preschool: this.getPreschoolBehaviors()
    };
  }

  getStats() {
    const allBehaviors = this.getAllBehaviors();
    
    return {
      version: this.version,
      lastUpdated: this.lastUpdated,
      ageGroups: Object.keys(allBehaviors).length,
      totalBehaviors: Object.values(allBehaviors).reduce(
        (sum, age) => sum + age.behaviors.length, 0
      ),
      totalRareEvents: Object.values(allBehaviors).reduce(
        (sum, age) => sum + (age.rareEvents?.length || 0), 0
      ),
      byAgeGroup: Object.entries(allBehaviors).map(([age, data]) => ({
        ageGroup: age,
        behaviors: data.behaviors.length,
        rareEvents: data.rareEvents?.length || 0
      }))
    };
  }

  initializeBehaviors() {
    // Cache behaviors on initialization
    return {
      infant: this.getInfantBehaviors(),
      toddler: this.getToddlerBehaviors(),
      preschool: this.getPreschoolBehaviors()
    };
  }
}

// Export singleton instance
export default new StandardBehaviorLibrary();