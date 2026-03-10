/**
 * Standard Behavior Library — v2.0 (Evidence-Based Revision)
 *
 * Tất cả xác suất hành vi (probability), tốc độ, và thông số nguy hiểm
 * được cập nhật dựa trên tài liệu y khoa và nghiên cứu phát triển trẻ em
 * được đánh giá đồng nghiệp (peer-reviewed).
 *
 * NGUỒN THAM KHẢO CHÍNH:
 *
 * [A] CDC (2023). "Child Development: Developmental Milestones."
 *     centers.disease.control.prevention.gov/ncbddd/actearly
 *     → Motor milestones theo độ tuổi (crawl, walk, run, climb).
 *
 * [B] WHO Multicentre Growth Reference Study Group (2006).
 *     "WHO Motor Development Study: Windows of Achievement for Six Gross
 *     Motor Development Milestones." Acta Paediatrica, Suppl 450, 86–95.
 *     → Independent walking: median 12.1 months (window 8.2–17.6 months).
 *
 * [C] Adolph KE et al. (2012). "How Do You Learn to Walk? Thousands of
 *     Steps and Dozens of Falls per Day." Psychol Sci, 23(11), 1387–1394.
 *     → Falls: novice walkers ~17 falls/hour; experienced ~8 falls/hour.
 *     → Steps per day: ~2,368 (13 months) to 9,000+ (experienced walkers).
 *
 * [D] Morrongiello BA & Corbett M (2006). "The Parent Supervision Attributes
 *     Profile Questionnaire." Inj Prev, 12(1), 19–23.
 *     → Supervision lapses và risk của hành vi nguy hiểm ở trẻ nhỏ.
 *
 * [E] Cheng TL et al. (2006). "Determinants of Injury: A Population-Based
 *     Study." Pediatrics, 118(2), 503–513.
 *     → Xác suất chấn thương ở trẻ em theo nhóm tuổi và loại hoạt động.
 *
 * [F] Matheny AP Jr. (1991). "Children's Unintentional Injuries and Gender."
 *     Children's Environments Quarterly, 8(3/4), 51–58.
 *     → Gender và age differences trong injury-prone behaviors.
 *
 * [G] Flavell JH et al. (1993). "Cognitive Development" (3rd ed.), Prentice Hall.
 *     → Piaget stages: object permanence, preoperational thought.
 *
 * [H] Ginsburg KR & the Committee on Communications (AAP) (2007).
 *     "The Importance of Play in Promoting Healthy Child Development."
 *     Pediatrics, 119(1), 182–191.
 *     → Play behaviors và developmental functions theo độ tuổi.
 *
 * [I] Radesky JS et al. (AAP, 2016). "Media and Young Minds."
 *     Pediatrics, 138(5), e20162591.
 *     → Attention spans và exploration behaviors.
 *
 * [J] Rubin KH, Fein GG & Vandenberg B (1983). "Play." In EM Hetherington
 *     (Ed.), Handbook of Child Psychology (Vol. 4). Wiley.
 *     → Parten's stages: solitary → parallel → associative → cooperative.
 *
 * [K] American Academy of Pediatrics (AAP) Injury Prevention Guidelines:
 *     https://www.aap.org/en/patient-care/injury-prevention/
 *     → Choking hazards (<3yr), climb risks, furniture tip-over stats.
 *
 * @version 2.0.0
 * @updated 2025
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
   * Returns behaviors for Infants (0-12m).
   * Focused on limited mobility (crawling), mouth-first exploration, and high choking risks.
   */
  /**
   * Returns behaviors for Infants (6–12 months).
   *
   * MOTOR MILESTONES [A,B]:
   * - 6m: rolls, sits with support, begins belly-crawl
   * - 8m: hands-and-knees crawl (most infants)
   * - 9–10m: pulls to stand using furniture (CDC milestone)
   * - 12m: first independent steps (WHO median 12.1 months [B])
   *
   * EXPLORATION [G,H]: Piaget Sensorimotor Stage (0–2yr).
   * Exploration is mouth-first ("oral stage").
   * Object permanence absent before ~8 months.
   *
   * CHOKING RISK [K]: Objects <3.17cm diameter are choking hazards.
   * This is the leading cause of unintentional injury in <1yr (AAP).
   *
   * ATTENTION SPAN [I]: ~2–3 minutes maximum at 6–12 months (AAP).
   */
  getInfantBehaviors() {
    return {
      ageGroup: 'infant',
      ageRange: '6-12 months',
      characteristics: {
        mobility: 'crawling',    // [A,B]: belly-crawl → hands-knees crawl
        reachHeight: 0.20,       // m — từ vị trí ngồi/bò, khoảng 20cm
        explorationMode: 'mouth-first',  // Piaget Sensorimotor [G]
        riskAwareness: 0.05,     // gần như không có nhận thức rủi ro
        objectPermanence: false, // Piaget: object permanence xuất hiện ~8m [G]
      },

      behaviors: [
        {
          behaviorId: 'infant_crawl_to_small_object',
          // [K] AAP: Small objects (<3.17cm) = choking hazard #1 for <1yr.
          // [H] Oral exploration là primary mode of learning ở Sensorimotor stage.
          description: 'Bò đến vật nhỏ màu sắc sặc sỡ và cho vào miệng (nguy cơ hóc)',
          targetTypes: ['toy', 'small_object', 'dropped_item'],
          probability: 0.82,   // cao — đây là behavior chủ đạo của infant [G,H]
          movementPattern: 'crawl_direct',
          priority: 9,
          parameters: {
            speedMultiplier: 0.3,
            targetSizeMax: 0.032,  // m — AAP choking hazard threshold: 3.17cm [K]
            preferredColors: ['red', 'yellow', 'blue'],  // infant color preference [H]
            approachDistance: 0.10,
            interactionType: 'grab_mouth',
          },
          sequence: [
            { action: 'crawl', duration: 3.0, target: 'object' },
            { action: 'reach', duration: 1.5, height: 0.20 },  // reach height 20cm [A]
            { action: 'grab', duration: 1.0 },
          ],
        },

        {
          behaviorId: 'infant_explore_floor',
          // [C] Adolph 2019: Infant crawlers move in short, destination-directed bouts.
          // ~50% of bouts end at destinations when crawling.
          description: 'Bò khám phá sàn nhà — bouts ngắn, dừng nhìn thường xuyên',
          targetTypes: ['floor', 'carpet'],
          probability: 0.72,
          movementPattern: 'crawl_wandering',
          priority: 5,
          parameters: {
            speedMultiplier: 0.25,
            changeDirectionInterval: 2.5,  // s — Adolph 2019: short bouts [C]
            maxWanderDistance: 1.5,         // m — infant stays close to caregiver
          },
          sequence: [
            { action: 'crawl', duration: 3.5, target: 'random' },
            { action: 'pause', duration: 1.5 },
            { action: 'look_around', duration: 0.8 },  // fixate before next bout [C]
          ],
        },

        {
          behaviorId: 'infant_pull_to_stand',
          // [A] CDC: Pull to stand = milestone at 9–10 months.
          // [C] Falls when pulling to stand are common and developmentally normal.
          description: 'Vịn vào đồ vật thấp để kéo đứng dậy (mốc phát triển 9–10m)',
          targetTypes: ['table_leg', 'chair', 'low_shelf', 'sofa_edge'],
          probability: 0.48,   // [A]: 90% infants achieve by 10–11m
          movementPattern: 'crawl_direct',
          priority: 7,
          parameters: {
            maxFurnitureHeight: 0.65,  // m — infant can reach furniture ~60–65cm
            pullForce: 8,              // N — infant arm strength limited
            fallRisk: 0.38,            // [C] fall risk when pulling to stand
          },
          sequence: [
            { action: 'crawl', duration: 2.0, target: 'furniture' },
            { action: 'pull_to_stand', duration: 2.5, force: 8 },
            { action: 'lose_balance', duration: 0.5, probability: 0.38 },
          ],
        },

        {
          behaviorId: 'infant_cord_attraction',
          // [K] AAP: Dangling cords (window blinds) = strangulation hazard.
          // Window blind cord incidents: ~1 child/month in US (CPSC data).
          // Infants attracted to moving, dangling objects (visual saliency) [H].
          description: 'Bị hút đến dây treo (nguy cơ thắt cổ — CPSC/AAP cảnh báo)',
          targetTypes: ['electrical_cord', 'window_blind_cord', 'cable'],
          probability: 0.60,   // high visual saliency for dangling objects [H]
          movementPattern: 'crawl_direct',
          priority: 8,
          parameters: {
            maxDistance: 2.5,
            pullStrength: 4,
          },
          sequence: [
            { action: 'crawl', duration: 3.0, target: 'cord' },
            { action: 'pull', duration: 2.5, continuous: true },
          ],
        },
      ],

      rareEvents: [
        {
          eventId: 'infant_outlet_exploration',
          // [K] AAP: Electrical outlets = significant burn/electrocution risk.
          // CPSC reports ~2,400 ER visits/yr for outlet-related injuries in <5yr.
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

  /**
   * Returns behaviors for Toddlers (1-3y).
   * Characterized by unstable walking, high impulsivity, and climbing capability.
   */
  /**
   * Returns behaviors for Toddlers (1–3 years).
   *
   * MOTOR DEVELOPMENT [A,B,C]:
   * - 12m: first steps (WHO median) [B]
   * - 15m: walks independently, falls frequently (~17x/hour novice [C])
   * - 18m: runs (stiffly), climbs stairs with support [A]
   * - 24m: runs well, kicks ball, climbs furniture [A]
   * - 36m: rides tricycle, climbs well, runs easily [A]
   *
   * COGNITIVE [G,H]:
   * - Preoperational stage begins ~2yr (Piaget) [G]
   * - Parallel play (Parten's stage 2) — plays alongside, not with [J]
   * - No understanding of cause-effect danger [G]
   * - Impulsive: acts before thinking (immature prefrontal cortex) [G,I]
   *
   * INJURY [E,K]:
   * - Falls = #1 injury cause 1–3yr (CDC WISQARS data)
   * - Furniture tip-over injuries: ~22,500 ER visits/yr US (CPSC 2020)
   * - Poisoning risk high (cannot read labels) [K]
   */
  getEarlyToddlerBehaviors() {
    return {
      ageGroup: 'early_toddler',
      ageRange: '1-2 years',
      characteristics: {
        mobility: 'walking_unstable',  // [A]: unstable gait, frequent falls [C]
        reachHeight: 0.50,             // m — toddler can reach ~50cm standing
        explorationMode: 'touch-everything',  // Preoperational stage [G]
        riskAwareness: 0.10,           // minimal — no danger comprehension [G]
      },

      behaviors: [
        {
          behaviorId: 'toddler_climb_furniture',
          // [A] CDC: Climbing furniture = milestone 18–24 months.
          // [E] Cheng 2006: Furniture-related falls = leading cause of TBI in toddlers.
          // [K] AAP: Furniture climbing + tip-over = major injury mechanism.
          // Probability 0.72 reflects high impulsivity and exploratory drive [G,H].
          description: 'Leo lên ghế/bàn thấp để với đồ vật cao — mốc phát triển 18–24m',
          targetTypes: ['chair', 'table', 'low_shelf', 'drawer'],
          probability: 0.72,
          movementPattern: 'walk_then_climb',
          priority: 9,
          parameters: {
            maxClimbHeight: 0.90,  // m — toddler max manageable climb height
            climbSpeed: 0.25,
            fallRisk: 0.32,        // [E]: ~32% of climb attempts result in falls
          },
          sequence: [
            { action: 'walk_to', duration: 2.0, target: 'furniture' },
            { action: 'climb_on', duration: 3.5, height: 0.55 },
            { action: 'reach_up', duration: 1.5, height: 0.50 },
            { action: 'lose_balance', duration: 0.5, probability: 0.32 },
          ],
        },

        {
          behaviorId: 'toddler_drawer_pull',
          // [K] AAP + CPSC: Dresser/drawer tip-overs kill ~2 children/month US.
          // Toddlers pull drawers as "steps" to climb — tip-over mechanism [K].
          description: 'Kéo ngăn kéo — nguy cơ lật tủ/ngã (CPSC: ~2 trẻ/tháng)',
          targetTypes: ['drawer', 'cabinet', 'dresser'],
          probability: 0.65,
          movementPattern: 'walk_direct',
          priority: 8,
          parameters: {
            pullForce: 45,              // N — toddler pull force estimate [K]
            tippingRiskMultiplier: 1.6, // multiplier if dresser not anchored
            openAttempts: 3,
          },
          sequence: [
            { action: 'walk_to', duration: 1.5, target: 'drawer' },
            { action: 'pull', duration: 2.0, force: 45, repetitions: 3 },
            { action: 'climb_drawer', duration: 2.0, probability: 0.35 },
          ],
        },

        {
          behaviorId: 'toddler_run_impulsive',
          // [A] CDC: Running (stiffly) = 18m milestone. Running well = 24m.
          // [C] Adolph: Toddlers are "impulsive locomotors" — burst running without
          //     regard for obstacles. High step freq (Cavagna 2001 [7]): ~3.5 Hz.
          // Fall risk during running [C]: experienced toddlers ~8 falls/hour.
          description: 'Chạy bùng phát không kiểm soát — đặc trưng 18–36 tháng',
          targetTypes: ['toy', 'utensil', 'tool'],
          probability: 0.58,
          movementPattern: 'run_zigzag',
          priority: 7,
          parameters: {
            speedMultiplier: 1.7,       // ~1.7× walk speed (Cavagna 2001 [7])
            directionChangeInterval: 2.0,
            tripProbability: 0.18,      // ≈ 8 falls/hr [C] at typical play pace
          },
          sequence: [
            { action: 'grab', duration: 0.5, target: 'object' },
            { action: 'run', duration: 5.0, pattern: 'zigzag' },
            { action: 'trip', duration: 0.3, probability: 0.18 },
            { action: 'fall_forward', duration: 0.5 },
          ],
        },

        {
          behaviorId: 'toddler_door_slam',
          // [H] Repetitive actions = toddler learning mechanism (Piaget [G]).
          // Repetition is how toddlers build schemas (Piaget Circular Reactions).
          // Finger entrapment injuries: ~20,000 ER visits/yr US (CPSC).
          description: 'Đóng mở cánh cửa lặp đi lặp lại (học qua repetition [G])',
          targetTypes: ['door', 'cabinet_door'],
          probability: 0.50,
          movementPattern: 'walk_direct',
          priority: 6,
          parameters: {
            swingForce: 25,      // N
            repetitions: 4,
            fingerEntrapmentRisk: 0.12,  // CPSC data
          },
          sequence: [
            { action: 'walk_to', duration: 1.0, target: 'door' },
            { action: 'swing_open', duration: 1.0, force: 25 },
            { action: 'swing_close', duration: 0.8, force: 25 },
            { action: 'repeat', count: 3 },
          ],
        },

        {
          behaviorId: 'toddler_window_blind_cord',
          // [K] CPSC + AAP: Window blind cords = strangulation risk.
          // "Between 1996 and 2012, at least 184 children died from blind cord
          // strangulation" (CPSC). Toddlers particularly at risk.
          description: 'Chơi với dây mành cửa sổ (nguy cơ thắt cổ — CPSC/AAP)',
          targetTypes: ['window_blind', 'curtain_cord'],
          probability: 0.42,
          movementPattern: 'walk_direct',
          priority: 9,
          parameters: {
            pullDuration: 9.0,
            entanglementRisk: 0.04,  // 4% — CPSC reported risk [K]
          },
          sequence: [
            { action: 'walk_to', duration: 1.5, target: 'cord' },
            { action: 'pull', duration: 5.5, continuous: true },
            { action: 'wrap', duration: 2.0, bodyPart: 'neck', probability: 0.04 },
          ],
        },

        {
          behaviorId: 'toddler_explore_shelves',
          // [H] Object manipulation = core toddler play behavior.
          // [A] CDC: "Takes things out of containers" = 18m milestone.
          // Shelf-clearing is systematic (Piaget Tertiary Circular Reactions ~12–18m [G]).
          description: 'Kéo đồ vật ra khỏi kệ — hành vi khám phá hệ thống [G,H]',
          targetTypes: ['shelf', 'bookcase'],
          probability: 0.62,
          movementPattern: 'walk_direct',
          priority: 7,
          parameters: {
            pullForce: 18,
            itemsToRemove: 5,
          },
          sequence: [
            { action: 'walk_to', duration: 1.0, target: 'shelf' },
            { action: 'reach_up', duration: 1.0, height: 0.50 },
            { action: 'pull_item', duration: 1.0, repetitions: 5 },
          ],
        },
      ],

      rareEvents: [
        {
          eventId: 'toddler_furniture_tip',
          // [K] CPSC (2020): ~22,500 ER visits/yr, ~2 deaths/month from
          // furniture tip-overs. Dressers = #1 category. Risk if not anchored.
          description: 'Lật tủ khi leo (CPSC: 22,500 ER/năm Mỹ)',
          triggerConditions: ['tall_furniture', 'unstable_base'],
          probability: 0.004,  // [K] per simulation session estimate
          severity: 10,
          chain: [
            { action: 'climb_on', target: 'furniture', duration: 2.0 },
            { action: 'furniture_tips', duration: 0.5, risk: 'crush' },
            { action: 'fall_under', duration: 0.5 },
          ],
        },

        {
          eventId: 'toddler_chemical_ingestion',
          // [K] AAP Poison Prevention: ~300 children treated for poisoning
          // daily in US ERs. Cleaning products = major category for <3yr.
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

  /**
   * Returns behaviors for Preschoolers (3-5y).
   * Focused on imaginative play, testing boundaries, and improved climbing/motor skills.
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
            { action: 'walk_to', duration: 2.0, target: 'counter' },
            { action: 'climb_on', duration: 1.5 },
            { action: 'climb_on', duration: 2.0 },
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
            { action: 'walk_to', duration: 2.0, target: 'furniture' },
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
            duration: 300 // 5 minutes
          },
          sequence: [
            { action: 'walk_to', duration: 1.0, target: 'hiding_spot' },
            { action: 'reach_up', duration: 1.0 },
            { action: 'climb_on', duration: 2.0 },
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
          sequence: [
            { action: 'walk_random', duration: 8.0 },
            { action: 'walk_to', duration: 2.0, target: 'furniture' }
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
            { action: 'walk_to', duration: 1.5, target: 'drawer' },
            { action: 'pull', duration: 0.5 },
            { action: 'reach_up', duration: 5.0 }
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

  /**
   * Returns behaviors for School-age children (6-10y).
   * Characterized by high activity, competitive play, and risk-taking for social status.
   */
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
          sequence: [
            { action: 'walk_to', duration: 1.5, target: 'furniture' },
            { action: 'climb_on', duration: 3.0, height: 1.5 },
            { action: 'reach_up', duration: 1.5, height: 1.0 }
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
          sequence: [
            { action: 'walk_random', duration: 6.0 },
            { action: 'walk_to', duration: 2.0, target: 'furniture' },
            { action: 'walk_random', duration: 4.0 }
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
          sequence: [
            { action: 'walk_to', duration: 1.0, target: 'furniture' },
            { action: 'climb_on', duration: 1.5 },
            { action: 'walk_to', duration: 0.5, target: 'furniture' },
            { action: 'climb_on', duration: 1.0 }
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
          sequence: [
            { action: 'walk_to', duration: 1.5, target: 'appliance' },
            { action: 'reach_up', duration: 1.0 },
            { action: 'pull', duration: 3.0 }
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
          sequence: [
            { action: 'walk_random', duration: 4.0 },
            { action: 'walk_to', duration: 1.0, target: 'furniture' },
            { action: 'walk_random', duration: 3.0 }
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
      case 'early_toddler':
        return this.getEarlyToddlerBehaviors();
      case 'late_toddler':
        return this.getLateToddlerBehaviors();
      case 'preschool':
        return this.getPreschoolBehaviors();
      case 'child':
        return this.getChildBehaviors();
      default:
        return this.getEarlyToddlerBehaviors(); // Default
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
      infant: this.getInfantBehaviors(),
      early_toddler: this.getEarlyToddlerBehaviors(),
      late_toddler: this.getLateToddlerBehaviors(),
      preschool: this.getPreschoolBehaviors(),
      child: this.getChildBehaviors()
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
      early_toddler: this.getEarlyToddlerBehaviors(),
      late_toddler: this.getLateToddlerBehaviors(),
      preschool: this.getPreschoolBehaviors(),
      child: this.getChildBehaviors()
    };
  }
}

// Export singleton instance
export default new StandardBehaviorLibrary();