/**
 * ============================================================================
 * STANDARD BEHAVIOR LIBRARY — MEDICAL & PEDIATRIC DEVELOPMENTAL MILESTONES
 * ============================================================================
 * * NGUỒN TÀI LIỆU THAM CHIẾU Y KHOA CHÍNH:
 * [1] CDC Centers for Disease Control and Prevention (2023). "Child Development Milestones (6 Months - 12 Years)".
 * [2] WHO Multicentre Growth Reference Study Group (2006). "WHO Motor Development Study: Windows of Achievement for Six Gross Motor Milestones".
 * [3] Adolph KE, Cole WG, Komati M, et al. (2012). "How Do You Learn to Walk? Thousands of Steps and Dozens of Falls per Day". Psychological Science.
 * [4] Morrongiello BA & Corbett M (2006). "Child Injury Prevention: Understanding Behavioral Vulnerabilities by Age Group". Injury Prevention.
 */

class StandardBehaviorLibrary {
  constructor() {
    this.version = "2.3-BugFixed";
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * ========================================================================
   * EMERGENCY FALLBACK: HÀM CỨU HỘ MẶC ĐỊNH KHI AI HOẶC HYBRID ENGINE LỖI
   * ========================================================================
   */
  getDefaultWanderBehavior(ageGroup) {
    const canWalk = ageGroup !== 'infant';
    return {
      behaviorId: 'default_wander',
      description: 'Khám phá ngẫu nhiên khu vực an toàn trên sàn nhà',
      targetObjectTypes: ['floor'],
      targetTypes: ['floor'],
      probability: 1.0,
      movementPattern: canWalk ? 'walk_random' : 'crawl_random',
      priority: 1,
      parameters: {
        speedMultiplier: canWalk ? 0.8 : 0.3,
        changeDirectionInterval: 3.0
      },
      sequence: [
        { action: canWalk ? 'walk' : 'crawl', duration: 8.0, target: 'random' }
      ]
    };
  }

  /**
   * ========================================================================
   * INFANT BEHAVIORS (6 - 12 MONTHS)
   * ========================================================================
   */
  getInfantBehaviors() {
    return {
      ageGroup: 'infant',
      behaviors: [
        {
          id: 'infant_crawl_to_small_object',
          probability: 0.35,
          targetObjectTypes: ['small_toy', 'coin', 'button_battery', 'dropped_item'],
          sequence: [
            { action: 'crawl', duration: 5.0, target: 'object' },
            { action: 'pause', duration: 0.4 },
            { action: 'reach', duration: 0.4, target: 'object' },
            { action: 'grab', duration: 0.5, target: 'object' }
          ]
        },
        {
          id: 'infant_pull_to_stand',
          probability: 0.25,
          targetObjectTypes: ['low_table', 'chair_legs', 'sofa', 'cabinet_low'],
          sequence: [
            { action: 'crawl', duration: 6.0, target: 'object' },
            { action: 'pull_to_stand', duration: 2.5, target: 'object' },
            { action: 'pause', duration: 1.0 },
            { action: 'lose_balance', duration: 0.6 }
          ]
        },
        {
          id: 'infant_explore_floor',
          probability: 0.25,
          targetObjectTypes: [],
          sequence: [
            { action: 'crawl', duration: 7.0, target: 'random' },
            { action: 'pause', duration: 0.5 },
            { action: 'look_around', duration: 1.2 }
          ]
        },
        {
          id: 'infant_cord_attraction',
          probability: 0.15,
          targetObjectTypes: ['electrical_cord', 'blind_cord'],
          sequence: [
            { action: 'crawl', duration: 4.5, target: 'object' },
            { action: 'pull', duration: 1.5, target: 'object' }
          ]
        }
      ],
      rareEvents: [
        { eventId: 'insert_object', probability: 0.03, targetObjectTypes: ['electrical_outlet'] }
      ]
    };
  }

  /**
   * ========================================================================
   * EARLY TODDLER BEHAVIORS (12 - 18 MONTHS)
   * ========================================================================
   */
  getEarlyToddlerBehaviors() {
    return {
      ageGroup: 'early_toddler',
      behaviors: [
        {
          id: 'toddler_walk_explore',
          probability: 0.40,
          targetObjectTypes: [],
          sequence: [
            { action: 'walk', duration: 6.0, target: 'random' },
            { action: 'pause', duration: 0.4 },
            { action: 'look_around', duration: 0.6 }
          ]
        },
        {
          id: 'toddler_climb_furniture',
          probability: 0.25,
          targetObjectTypes: ['chair', 'sofa', 'low_bed', 'coffee_table'],
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'object' },
            { action: 'climb_on', duration: 2.2, target: 'object' },
            { action: 'reach_up', duration: 0.5 },
            { action: 'lose_balance', duration: 0.5 }
          ]
        },
        {
          id: 'toddler_drawer_pull',
          probability: 0.20,
          targetObjectTypes: ['dresser', 'kitchen_cabinet', 'nightstand'],
          sequence: [
            { action: 'walk_to', duration: 4.5, target: 'object' },
            { action: 'pull', duration: 0.8, target: 'object' },
            { action: 'climb_drawer', duration: 1.8, target: 'object' }
          ]
        },
        {
          id: 'toddler_door_slam',
          probability: 0.15,
          targetObjectTypes: ['interior_door', 'cabinet_door'],
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'object' },
            { action: 'swing_open', duration: 0.6, target: 'object' },
            { action: 'swing_close', duration: 0.5, target: 'object' }
          ]
        }
      ],
      rareEvents: [
        { eventId: 'stumble_fall', probability: 0.08, targetObjectTypes: [] },
        { eventId: 'furniture_topple', probability: 0.04, targetObjectTypes: ['dresser', 'bookshelf'] }
      ]
    };
  }

  /**
   * ========================================================================
   * LATE TODDLER BEHAVIORS (18 - 36 MONTHS)
   * ========================================================================
   */
  getLateToddlerBehaviors() {
    return {
      ageGroup: 'late_toddler',
      behaviors: [
        {
          id: 'toddler_run_around',
          probability: 0.35,
          targetObjectTypes: [],
          sequence: [
            { action: 'run', duration: 6.5, target: 'random' },
            { action: 'pause', duration: 0.3 }
          ]
        },
        {
          id: 'toddler_explore_shelves',
          probability: 0.25,
          targetObjectTypes: ['bookshelf', 'pantry_shelf', 'tv_stand'],
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'object' },
            { action: 'reach_up', duration: 0.8, target: 'object' },
            { action: 'pull_item', duration: 0.5, target: 'object' }
          ]
        },
        {
          id: 'toddler_window_blind_cord',
          probability: 0.20,
          targetObjectTypes: ['window_blind_cord'],
          sequence: [
            { action: 'walk_to', duration: 4.5, target: 'object' },
            { action: 'pull', duration: 1.2, target: 'object' },
            { action: 'wrap', duration: 1.0, target: 'object' }
          ]
        },
        {
          id: 'toddler_under_sink_exploration',
          probability: 0.20,
          targetObjectTypes: ['under_sink_cabinet'],
          sequence: [
            { action: 'walk_to', duration: 5.0, target: 'object' },
            { action: 'open_cabinet', duration: 1.0, target: 'object' },
            { action: 'grab_bottle', duration: 0.6, target: 'object' }
          ]
        }
      ],
      rareEvents: [
        { eventId: 'ingest_chemical', probability: 0.05, targetObjectTypes: ['under_sink_cabinet'] },
        { eventId: 'strangulation_risk', probability: 0.02, targetObjectTypes: ['window_blind_cord'] }
      ]
    };
  }

  /**
   * ========================================================================
   * PRESCHOOL BEHAVIORS (3 - 5 YEARS)
   * ========================================================================
   */
  getPreschoolBehaviors() {
    return {
      ageGroup: 'preschool',
      behaviors: [
        {
          id: 'preschool_hide_seek',
          probability: 0.35,
          targetObjectTypes: ['wardrobe', 'large_box', 'behind_curtain', 'under_bed'],
          sequence: [
            { action: 'walk_to', duration: 5.0, target: 'object' },
            { action: 'reach_up', duration: 0.4 },
            { action: 'climb_on', duration: 1.8, target: 'object' },
            { action: 'walk_random', duration: 4.0, target: 'random' }
          ]
        },
        {
          id: 'preschool_high_reach',
          probability: 0.35,
          targetObjectTypes: ['countertop', 'mantel', 'high_shelf'],
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'object' },
            { action: 'climb_on', duration: 2.2, target: 'object' },
            { action: 'reach_up', duration: 1.0, target: 'object' }
          ]
        },
        {
          id: 'preschool_tool_use',
          probability: 0.30,
          targetObjectTypes: ['step_stool', 'chair', 'plastic_crate'],
          sequence: [
            { action: 'walk_to', duration: 3.5, target: 'object' },
            { action: 'pull', duration: 1.2, target: 'object' },
            { action: 'reach_up', duration: 0.8 }
          ]
        }
      ],
      rareEvents: [
        { eventId: 'falls_from_height', probability: 0.04, targetObjectTypes: ['countertop', 'high_shelf'] }
      ]
    };
  }

  /**
   * ========================================================================
   * SCHOOL AGE BEHAVIORS (6 - 12 YEARS)
   * ========================================================================
   */
  getChildBehaviors() {
    return {
      ageGroup: 'school_age',
      behaviors: [
        {
          id: 'school_roughhouse',
          probability: 0.30,
          targetObjectTypes: ['stairs', 'open_window', 'balcony_railing'],
          sequence: [
            { action: 'sprint', duration: 4.5, target: 'object' },
            { action: 'jump', duration: 1.0 },
            { action: 'stumble', duration: 0.8 },
            { action: 'run_unstable', duration: 3.0, target: 'random' }
          ]
        },
        {
          id: 'school_use_appliance',
          probability: 0.40,
          targetObjectTypes: ['microwave', 'stove', 'kettle', 'iron'],
          sequence: [
            { action: 'walk', duration: 3.5, target: 'object' },
            { action: 'reach_up', duration: 1.5, target: 'object' },
            { action: 'pull', duration: 0.8, target: 'object' }
          ]
        },
        {
          id: 'school_independent_explore',
          probability: 0.30,
          targetObjectTypes: [],
          sequence: [
            { action: 'walk_random', duration: 8.0, target: 'random' }
          ]
        }
      ],
      rareEvents: [
        { eventId: 'falls_from_height', probability: 0.02, targetObjectTypes: ['stairs', 'balcony_railing'] }
      ]
    };
  }

  /**
   * ========================================================================
   * CORE SERVICE METHODS & BALANCING
   * ========================================================================
   */
  getBehaviorsForAgeGroup(ageGroupId) {
    switch (ageGroupId) {
      case 'infant':        return this.getInfantBehaviors();
      case 'early_toddler': return this.getEarlyToddlerBehaviors();
      case 'late_toddler':  return this.getLateToddlerBehaviors();
      case 'preschool':     return this.getPreschoolBehaviors();
      case 'child':         return this.getChildBehaviors();
      case 'school_age':    return this.getChildBehaviors();
      default:              return this.getEarlyToddlerBehaviors();
    }
  }

  selectBehaviorWeighted(eligibleList, context) {
    if (!eligibleList || eligibleList.length === 0) {
      return this.getDefaultWanderBehavior(context?.ageGroupId);
    }
    const idx = Math.floor(Math.random() * eligibleList.length);
    return eligibleList[idx];
  }

  getAllBehaviors() {
    return {
      infant:        this.getInfantBehaviors(),
      early_toddler: this.getEarlyToddlerBehaviors(),
      late_toddler:  this.getLateToddlerBehaviors(),
      preschool:     this.getPreschoolBehaviors(),
      child:         this.getChildBehaviors()
    };
  }

  getStats() {
    const all = this.getAllBehaviors();
    return {
      version: this.version,
      lastUpdated: this.lastUpdated,
      ageGroups: Object.keys(all).length,
      totalBehaviors: Object.values(all).reduce((sum, age) => sum + age.behaviors.length, 0)
    };
  }
}

// Khởi tạo Singleton chính xác để đồng bộ BehaviorManager
const instance = new StandardBehaviorLibrary();
export default instance;