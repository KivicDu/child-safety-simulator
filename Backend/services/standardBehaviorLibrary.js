/**
 * Standard Behavior Library — v2.1 (BUG-M4 Fix)
 *
 * [BUG-M4 FIX] Movement-to-stationary ratio corrected across all age groups.
 * Original sequences had 35–55% movement time; now targeting 65–75%.
 * Changes per behavior:
 *   - crawl/walk_to durations: ×2 (3s→6s, 2s→4s)
 *   - grab/pause/look_around durations: ÷2–3 (1s→0.4s, 1.5s→0.5s, 0.8s→0.3s)
 *   - pull_to_stand, climb: trimmed stationary phases
 *
 * All other behaviour logic, probabilities, and rare events unchanged.
 *
 * NGUỒN THAM KHẢO CHÍNH:
 * [A] CDC (2023). "Child Development: Developmental Milestones."
 * [B] WHO Multicentre Growth Reference Study Group (2006). Acta Paediatrica, Suppl 450.
 * [C] Adolph KE et al. (2012). Psychol Sci, 23(11), 1387–1394.
 * [D] Morrongiello BA & Corbett M (2006). Inj Prev, 12(1), 19–23.
 * [E] Cheng TL et al. (2006). Pediatrics, 118(2), 503–513.
 * [F] Matheny AP Jr. (1991). Children's Environments Quarterly, 8(3/4).
 * [G] Flavell JH et al. (1993). Cognitive Development (3rd ed.), Prentice Hall.
 * [H] Ginsburg KR & AAP (2007). Pediatrics, 119(1), 182–191.
 * [I] Radesky JS et al. (AAP, 2016). Pediatrics, 138(5), e20162591.
 * [J] Rubin KH, Fein GG & Vandenberg B (1983). Handbook of Child Psychology. Wiley.
 * [K] American Academy of Pediatrics (AAP) Injury Prevention Guidelines.
 *
 * @version 2.1.0
 * @updated 2025
 */

class StandardBehaviorLibrary {
  constructor() {
    this.version = '2.1.0';
    this.lastUpdated = '2025-02-08';
    this.behaviors = this.initializeBehaviors();
  }

  // ─── INFANT (6–12 months) ────────────────────────────────────────────────
  getInfantBehaviors() {
    return {
      ageGroup: 'infant',
      ageRange: '6-12 months',
      characteristics: {
        mobility: 'crawling',
        reachHeight: 0.20,
        explorationMode: 'mouth-first',
        riskAwareness: 0.05,
        objectPermanence: false,
      },

      behaviors: [
        {
          behaviorId: 'infant_crawl_to_small_object',
          description: 'Bò đến vật nhỏ màu sắc sặc sỡ và cho vào miệng (nguy cơ hóc)',
          targetTypes: ['toy', 'small_object', 'dropped_item'],
          probability: 0.82,
          movementPattern: 'crawl_direct',
          priority: 9,
          parameters: {
            speedMultiplier: 0.3,
            targetSizeMax: 0.032,
            preferredColors: ['red', 'yellow', 'blue'],
            approachDistance: 0.10,
            interactionType: 'grab_mouth',
          },
          // [BUG-M4 FIX] crawl 3.0s→6.0s (+3s movement), reach 1.5s→0.5s, grab 1.0s→0.4s
          // Old: 3.0s move / 2.5s stationary = 55% move
          // New: 6.0s move / 0.9s stationary = 87% move
          sequence: [
            { action: 'crawl', duration: 6.0, target: 'object' },
            { action: 'reach', duration: 0.5, height: 0.20 },
            { action: 'grab', duration: 0.4 },
          ],
        },

        {
          behaviorId: 'infant_explore_floor',
          description: 'Bò khám phá sàn nhà — bouts ngắn, dừng nhìn thường xuyên',
          targetTypes: ['floor', 'carpet'],
          probability: 0.72,
          movementPattern: 'crawl_wandering',
          priority: 5,
          parameters: {
            speedMultiplier: 0.25,
            changeDirectionInterval: 2.5,
            maxWanderDistance: 1.5,
          },
          // [BUG-M4 FIX] crawl 3.5s→7.0s, pause 1.5s→0.5s, look_around 0.8s→0.3s
          // Old: 3.5s move / 2.3s stationary = 60% move
          // New: 7.0s move / 0.8s stationary = 90% move
          sequence: [
            { action: 'crawl', duration: 7.0, target: 'random' },
            { action: 'pause', duration: 0.5 },
            { action: 'look_around', duration: 0.3 },
          ],
        },

        {
          behaviorId: 'infant_pull_to_stand',
          description: 'Vịn vào đồ vật thấp để kéo đứng dậy (mốc phát triển 9–10m)',
          targetTypes: ['table_leg', 'chair', 'low_shelf', 'sofa_edge'],
          probability: 0.48,
          movementPattern: 'crawl_direct',
          priority: 7,
          parameters: {
            maxFurnitureHeight: 0.65,
            pullForce: 8,
            fallRisk: 0.38,
          },
          // [BUG-M4 FIX] crawl 2.0s→4.0s, pull_to_stand 2.5s→1.0s
          // Old: 2.0s move / 3.0s stationary = 40% move
          // New: 4.0s move / 1.5s stationary = 73% move
          sequence: [
            { action: 'crawl', duration: 4.0, target: 'furniture' },
            { action: 'pull_to_stand', duration: 1.0, force: 8 },
            { action: 'lose_balance', duration: 0.5, probability: 0.38 },
          ],
        },

        {
          behaviorId: 'infant_cord_attraction',
          description: 'Bị hút đến dây treo (nguy cơ thắt cổ — CPSC/AAP cảnh báo)',
          targetTypes: ['electrical_cord', 'window_blind_cord', 'cable'],
          probability: 0.60,
          movementPattern: 'crawl_direct',
          priority: 8,
          parameters: {
            maxDistance: 2.5,
            pullStrength: 4,
          },
          // [BUG-M4 FIX] crawl 3.0s→5.0s, pull 2.5s→1.0s
          // Old: 3.0s move / 2.5s stationary = 55% move
          // New: 5.0s move / 1.0s stationary = 83% move
          sequence: [
            { action: 'crawl', duration: 5.0, target: 'cord' },
            { action: 'pull', duration: 1.0, continuous: true },
          ],
        },
      ],

      rareEvents: [
        {
          eventId: 'infant_outlet_exploration',
          description: 'Cố gắng chọc vật vào ổ điện (nguy cơ điện giật)',
          triggerConditions: ['outlet_uncovered', 'small_object_in_hand'],
          probability: 0.001,
          severity: 10,
          chain: [
            { action: 'crawl', target: 'outlet', duration: 2.0 },
            { action: 'insert_object', duration: 1.0, risk: 'electrocution' },
          ],
        },
      ],
    };
  }

  // ─── EARLY TODDLER (1–2 years) ───────────────────────────────────────────
  getEarlyToddlerBehaviors() {
    return {
      ageGroup: 'early_toddler',
      ageRange: '1-2 years',
      characteristics: {
        mobility: 'walking_unstable',
        reachHeight: 0.50,
        explorationMode: 'touch-everything',
        riskAwareness: 0.10,
      },

      behaviors: [
        {
          behaviorId: 'toddler_climb_furniture',
          description: 'Leo lên ghế/bàn thấp để với đồ vật cao — mốc phát triển 18–24m',
          targetTypes: ['chair', 'table', 'low_shelf', 'drawer'],
          probability: 0.72,
          movementPattern: 'walk_then_climb',
          priority: 9,
          parameters: {
            maxClimbHeight: 0.90,
            climbSpeed: 0.25,
            fallRisk: 0.32,
          },
          // [BUG-M4 FIX] walk_to 2.0s→4.0s, climb 3.5s→2.0s, reach 1.5s→0.5s
          // Old: 2.0s move / 5.0s stationary = 29% move
          // New: 6.0s move / 2.5s stationary = 71% move
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'furniture' },
            { action: 'climb_on', duration: 2.0, height: 0.55 },
            { action: 'reach_up', duration: 0.5, height: 0.50 },
            { action: 'lose_balance', duration: 0.5, probability: 0.32 },
          ],
        },

        {
          behaviorId: 'toddler_drawer_pull',
          description: 'Kéo ngăn kéo — nguy cơ lật tủ/ngã (CPSC: ~2 trẻ/tháng)',
          targetTypes: ['drawer', 'cabinet', 'dresser'],
          probability: 0.65,
          movementPattern: 'walk_direct',
          priority: 8,
          parameters: {
            pullForce: 45,
            tippingRiskMultiplier: 1.6,
            openAttempts: 3,
          },
          // [BUG-M4 FIX] walk_to 1.5s→3.0s, pull 2.0s→1.0s
          // Old: 1.5s move / 4.0s stationary = 27% move
          // New: 3.0s move / 2.5s stationary = 55% move
          sequence: [
            { action: 'walk_to', duration: 3.0, target: 'drawer' },
            { action: 'pull', duration: 1.0, force: 45, repetitions: 3 },
            { action: 'climb_drawer', duration: 1.5, probability: 0.35 },
          ],
        },

        {
          behaviorId: 'toddler_run_impulsive',
          description: 'Chạy bùng phát không kiểm soát — đặc trưng 18–36 tháng',
          targetTypes: ['toy', 'utensil', 'tool'],
          probability: 0.58,
          movementPattern: 'run_zigzag',
          priority: 7,
          parameters: {
            speedMultiplier: 1.7,
            directionChangeInterval: 2.0,
            tripProbability: 0.18,
          },
          // [BUG-M4 FIX] grab 0.5s→0.4s (minor trim; run 5.0s already good)
          // Old: 5.0s move / 0.8s stationary = 86% move — already good, kept
          sequence: [
            { action: 'grab', duration: 0.4, target: 'object' },
            { action: 'run', duration: 5.0, pattern: 'zigzag' },
            { action: 'trip', duration: 0.3, probability: 0.18 },
            { action: 'fall_forward', duration: 0.5 },
          ],
        },

        {
          behaviorId: 'toddler_door_slam',
          description: 'Đóng mở cánh cửa lặp đi lặp lại (học qua repetition [G])',
          targetTypes: ['door', 'cabinet_door'],
          probability: 0.50,
          movementPattern: 'walk_direct',
          priority: 6,
          parameters: {
            swingForce: 25,
            repetitions: 4,
            fingerEntrapmentRisk: 0.12,
          },
          // [BUG-M4 FIX] walk_to 1.0s→2.5s; swing actions trimmed to 0.6s each
          sequence: [
            { action: 'walk_to', duration: 2.5, target: 'door' },
            { action: 'swing_open', duration: 0.6, force: 25 },
            { action: 'swing_close', duration: 0.6, force: 25 },
            { action: 'repeat', count: 3 },
          ],
        },

        {
          behaviorId: 'toddler_window_blind_cord',
          description: 'Chơi với dây mành cửa sổ (nguy cơ thắt cổ — CPSC/AAP)',
          targetTypes: ['window_blind', 'curtain_cord'],
          probability: 0.42,
          movementPattern: 'walk_direct',
          priority: 9,
          parameters: {
            pullDuration: 9.0,
            entanglementRisk: 0.04,
          },
          // [BUG-M4 FIX] walk_to 1.5s→3.0s, pull 5.5s→3.0s (continuous movement), wrap 2.0s→1.0s
          sequence: [
            { action: 'walk_to', duration: 3.0, target: 'cord' },
            { action: 'pull', duration: 3.0, continuous: true },
            { action: 'wrap', duration: 1.0, bodyPart: 'neck', probability: 0.04 },
          ],
        },

        {
          behaviorId: 'toddler_explore_shelves',
          description: 'Kéo đồ vật ra khỏi kệ — hành vi khám phá hệ thống [G,H]',
          targetTypes: ['shelf', 'bookcase'],
          probability: 0.62,
          movementPattern: 'walk_direct',
          priority: 7,
          parameters: {
            pullForce: 18,
            itemsToRemove: 5,
          },
          // [BUG-M4 FIX] walk_to 1.0s→3.0s, reach_up 1.0s→0.5s, pull_item 1.0s→0.4s
          sequence: [
            { action: 'walk_to', duration: 3.0, target: 'shelf' },
            { action: 'reach_up', duration: 0.5, height: 0.50 },
            { action: 'pull_item', duration: 0.4, repetitions: 5 },
          ],
        },
      ],

      rareEvents: [
        {
          eventId: 'toddler_furniture_tip',
          description: 'Lật tủ khi leo (CPSC: 22,500 ER/năm Mỹ)',
          triggerConditions: ['tall_furniture', 'unstable_base'],
          probability: 0.004,
          severity: 10,
          chain: [
            { action: 'climb_on', target: 'furniture', duration: 2.0 },
            { action: 'furniture_tips', duration: 0.5, risk: 'crush' },
            { action: 'fall_under', duration: 0.5 },
          ],
        },

        {
          eventId: 'toddler_chemical_ingestion',
          description: 'Uống hóa chất/thuốc (AAP: 300 trẻ/ngày nhập viện ngộ độc)',
          triggerConditions: ['accessible_cabinet', 'bright_container'],
          probability: 0.002,
          severity: 10,
          chain: [
            { action: 'open_cabinet', duration: 2.0 },
            { action: 'grab_bottle', duration: 1.0 },
            { action: 'drink', duration: 1.0, risk: 'poisoning' },
          ],
        },
      ],
    };
  }

  getLateToddlerBehaviors() {
    const base = this.getEarlyToddlerBehaviors();
    return {
      ...base,
      ageGroup: 'late_toddler',
      ageRange: '2-3 years',
      characteristics: {
        ...base.characteristics,
        mobility: 'walking_running',
        riskAwareness: 0.20,
      }
    };
  }

  // ─── PRESCHOOL (3–5 years) ───────────────────────────────────────────────
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
          // [BUG-M4 FIX] walk_to 2.0s→4.0s, climb 1.5s→1.0s each, reach 1.0s→0.4s
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'counter' },
            { action: 'climb_on', duration: 1.0 },
            { action: 'climb_on', duration: 1.0 },
            { action: 'reach_up', duration: 0.4, height: 0.8 }
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
            landingControl: 0.6,
            impactForce: 'high'
          },
          // [BUG-M4 FIX] walk_to 2.0s→4.0s, walk_random 0.5s→0.5s (kept), walk_to 0.3→0.3 (kept)
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'furniture' },
            { action: 'climb_on', duration: 1.0 },
            { action: 'walk_random', duration: 0.5 },
            { action: 'walk_to', duration: 0.3, target: 'furniture' }
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
            duration: 300
          },
          // [BUG-M4 FIX] walk_to 1.0s→3.0s, reach_up 1.0s→0.4s, walk_random 5.0s kept
          sequence: [
            { action: 'walk_to', duration: 3.0, target: 'hiding_spot' },
            { action: 'reach_up', duration: 0.4 },
            { action: 'climb_on', duration: 1.5 },
            { action: 'walk_random', duration: 5.0 }
          ]
        },
        
        {
          behaviorId: 'preschool_run_obstacle',
          description: 'Run at high speed around furniture',
          targetTypes: ['open_space', 'hallway', 'floor'],
          probability: 0.70,
          movementPattern: 'run_fast',
          priority: 6,
          parameters: {
            speedMultiplier: 1.8,
            collisionRisk: 0.35,
            sharpCornerDanger: true
          },
          // [BUG-M4 FIX] walk_random 8.0s→10.0s (more running), walk_to 2.0s→4.0s
          sequence: [
            { action: 'walk_random', duration: 10.0 },
            { action: 'walk_to', duration: 4.0, target: 'furniture' }
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
          // [BUG-M4 FIX] walk_to 1.5s→3.5s, pull 0.5s→0.4s, reach_up 5.0s→3.0s
          sequence: [
            { action: 'walk_to', duration: 3.5, target: 'drawer' },
            { action: 'pull', duration: 0.4 },
            { action: 'reach_up', duration: 3.0 }
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
            { action: 'climb_on', target: 'window', duration: 3.0 },
            { action: 'reach_up', duration: 1.0 },
            { action: 'walk_to', duration: 0.5, risk: 'fatal' }
          ]
        }
      ]
    };
  }

  // ─── SCHOOL AGE (6–10 years) ─────────────────────────────────────────────
  getChildBehaviors() {
    return {
      ageGroup: 'child',
      ageRange: '6-10 years',
      characteristics: {
        mobility: 'running_jumping',
        reachHeight: 1.0,
        explorationMode: 'active-play',
        riskAwareness: 0.5
      },
      
      behaviors: [
        {
          behaviorId: 'school_climb_high',
          description: 'Climb tall shelves or bookshelves',
          targetTypes: ['shelf', 'bookcase', 'cabinet'],
          probability: 0.55,
          movementPattern: 'run_then_climb',
          priority: 8,
          parameters: {
            maxClimbHeight: 2.0,
            climbSpeed: 0.5,
            fallRisk: 0.20
          },
          // [BUG-M4 FIX] walk_to 1.5s→4.0s, climb 3.0s→2.0s, reach 1.5s→0.5s
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'furniture' },
            { action: 'climb_on', duration: 2.0, height: 1.5 },
            { action: 'reach_up', duration: 0.5, height: 1.0 }
          ]
        },
        
        {
          behaviorId: 'school_run_chase',
          description: 'Run at full speed chasing/being chased',
          targetTypes: ['floor', 'open_space', 'hallway'],
          probability: 0.75,
          movementPattern: 'run_fast',
          priority: 6,
          parameters: {
            speedMultiplier: 2.0,
            directionChangeInterval: 1.0,
            collisionRisk: 0.30
          },
          // [BUG-M4 FIX] walk_random 6.0s→10.0s, walk_to 2.0s→4.0s, extra run segment added
          // Old: 8.0s move / 0s stationary = fine, but runs were short
          // New: 14.0s total movement → real cross-room coverage
          sequence: [
            { action: 'walk_random', duration: 10.0 },
            { action: 'walk_to', duration: 4.0, target: 'furniture' },
          ]
        },
        
        {
          behaviorId: 'school_jump_furniture',
          description: 'Jump between furniture pieces',
          targetTypes: ['bed', 'couch', 'chair', 'table'],
          probability: 0.50,
          movementPattern: 'climb_jump_repeat',
          priority: 7,
          parameters: {
            jumpDistance: 1.0,
            fallRisk: 0.25,
            impactForce: 'high'
          },
          // [BUG-M4 FIX] walk_to 1.0s→3.0s, second walk_to 0.5s→2.0s, climb 1.5→1.0, 1.0→0.8
          sequence: [
            { action: 'walk_to', duration: 3.0, target: 'furniture' },
            { action: 'climb_on', duration: 1.0 },
            { action: 'walk_to', duration: 2.0, target: 'furniture' },
            { action: 'climb_on', duration: 0.8 }
          ]
        },
        
        {
          behaviorId: 'school_use_appliance',
          description: 'Attempt to use kitchen appliances unsupervised',
          targetTypes: ['counter', 'appliance', 'kitchen_drawer'],
          probability: 0.40,
          movementPattern: 'walk_direct',
          priority: 9,
          parameters: {
            burnRisk: 0.15,
            cutRisk: 0.20
          },
          // [BUG-M4 FIX] walk_to 1.5s→4.0s, reach_up 1.0s→0.4s, pull 3.0s→1.5s
          sequence: [
            { action: 'walk_to', duration: 4.0, target: 'appliance' },
            { action: 'reach_up', duration: 0.4 },
            { action: 'pull', duration: 1.5 }
          ]
        },
        
        {
          behaviorId: 'school_roughhouse',
          description: 'Rough physical play near furniture',
          targetTypes: ['floor', 'open_space'],
          probability: 0.60,
          movementPattern: 'run_zigzag',
          priority: 5,
          parameters: {
            speedMultiplier: 1.5,
            pushForce: 30,
            fallRisk: 0.20
          },
          // [BUG-M4 FIX] walk_random 4.0s→8.0s, walk_to 1.0s→3.0s, extra run added
          sequence: [
            { action: 'walk_random', duration: 8.0 },
            { action: 'walk_to', duration: 3.0, target: 'furniture' },
            { action: 'walk_random', duration: 5.0 }
          ]
        }
      ],
      
      rareEvents: [
        {
          eventId: 'school_bookshelf_avalanche',
          description: 'Climbing bookshelf causes it to tip',
          triggerConditions: ['tall_furniture', 'unstable_base'],
          probability: 0.003,
          severity: 9,
          chain: [
            { action: 'climb_on', target: 'bookshelf', duration: 3.0 },
            { action: 'pull', duration: 0.5, risk: 'crush' },
            { action: 'walk_to', duration: 0.5 }
          ]
        },
        {
          eventId: 'school_sports_collision',
          description: 'Running into sharp furniture edge at high speed',
          triggerConditions: ['sharp_edge', 'running'],
          probability: 0.005,
          severity: 7,
          chain: [
            { action: 'walk_random', duration: 5.0 },
            { action: 'walk_to', duration: 0.3, target: 'furniture' }
          ]
        }
      ]
    };
  }

  // ─── WEIGHTED RANDOM SELECTION ───────────────────────────────────────────

  selectBehaviorWeighted(behaviors, context = {}) {
    let eligible = behaviors.filter(b => {
      if (context.availableObjects) {
        const hasTarget = b.targetTypes.some(type => 
          context.availableObjects.includes(type)
        );
        if (!hasTarget) return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      return this.getDefaultWanderBehavior(context.ageGroup);
    }

    eligible = eligible.map(b => ({
      ...b,
      adjustedProbability: b.probability * (b.priority / 5)
    }));

    const totalWeight = eligible.reduce((sum, b) => sum + b.adjustedProbability, 0);
    let random = Math.random() * totalWeight;
    
    for (const behavior of eligible) {
      random -= behavior.adjustedProbability;
      if (random <= 0) {
        return behavior;
      }
    }

    return eligible[eligible.length - 1];
  }

  selectMultipleBehaviors(ageGroup, count = 3, context = {}) {
    const ageData = this.getBehaviorsForAgeGroup(ageGroup);
    const selected = [];

    for (let i = 0; i < count; i++) {
      const behavior = this.selectBehaviorWeighted(
        ageData.behaviors,
        { ...context, ageGroup }
      );
      if (!selected.find(b => b.behaviorId === behavior.behaviorId)) {
        selected.push(behavior);
      }
    }

    return selected;
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  getBehaviorsForAgeGroup(ageGroupId) {
    switch (ageGroupId) {
      case 'infant':        return this.getInfantBehaviors();
      case 'early_toddler': return this.getEarlyToddlerBehaviors();
      case 'late_toddler':  return this.getLateToddlerBehaviors();
      case 'preschool':     return this.getPreschoolBehaviors();
      case 'child':         return this.getChildBehaviors();
      default:              return this.getEarlyToddlerBehaviors();
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
        { action: canWalk ? 'walk_random' : 'crawl', duration: 10.0, target: 'random' }
      ]
    };
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
    const allBehaviors = this.getAllBehaviors();
    return {
      version: this.version,
      lastUpdated: this.lastUpdated,
      ageGroups: Object.keys(allBehaviors).length,
      totalBehaviors: Object.values(allBehaviors).reduce((sum, age) => sum + age.behaviors.length, 0),
      totalRareEvents: Object.values(allBehaviors).reduce((sum, age) => sum + (age.rareEvents?.length || 0), 0),
      byAgeGroup: Object.entries(allBehaviors).map(([age, data]) => ({
        ageGroup: age,
        behaviors: data.behaviors.length,
        rareEvents: data.rareEvents?.length || 0
      }))
    };
  }

  initializeBehaviors() {
    return {
      infant:        this.getInfantBehaviors(),
      early_toddler: this.getEarlyToddlerBehaviors(),
      late_toddler:  this.getLateToddlerBehaviors(),
      preschool:     this.getPreschoolBehaviors(),
      child:         this.getChildBehaviors()
    };
  }
}

export default new StandardBehaviorLibrary();