// agent.js — v5
// Changes vs v4 (Bug-fix release):
//  • [NEW] ExplorationMap — chia phòng thành lưới 0.6m, nhớ ô đã đi qua,
//    setRandomTarget luôn ưu tiên vùng chưa khám phá → agent thực sự đi khắp phòng
//  • [NEW] Steering Forces — obstacle-avoidance bằng potential field (đẩy ra khi
//    lại gần vật cản) kết hợp seek-target → không còn đâm thẳng vào đồ vật
//  • [NEW] Age Movement Profile — mỗi nhóm tuổi có pattern di chuyển đặc trưng:
//      – infant: bò zigzag, dừng nhìn xung quanh mỗi 2-4s
//      – early_toddler: lắc lư sang ngang, hay dừng đột ngột, đổi hướng ngẫu nhiên
//      – late_toddler: chạy bùng phát ngắn, té rồi đứng dậy, forwardBias cao
//      – preschool: chạy vòng quanh đồ vật, khám phá kiểu "tại sao"
//      – school_age: mục tiêu rõ ràng, đánh giá phòng trước khi di chuyển
//  • [NEW] Curiosity burst system — boredomLevel tăng khi đứng yên / ở gần chỗ cũ;
//    khi đủ chán → chọn điểm xa nhất chưa khám phá để "chạy tới"
//  • [FIX v4] setRandomTarget: lọc floor/tường, dùng _knownFloorY (Bug 1+5)
//  • [FIX v4] stuckCounter 60→90, idleCooldown 1-2s→0.3-0.6s (Bug 2)
//  • [FIX v4] dangerZone radius 0.8→0.35m, memDuration 30→8s (Bug 3)
//  • [FIX v4] walk_random retry target sau danger reject (Bug 4)

import { getAgeGroup } from '../config/ageGroups.js';
import physicsEngine from './physicsEngine.js';
import { visionSystem } from './visionSystem.js';
import { riskAnalytics } from './riskAnalytics.js';

export const WADING_SCALE_FACTOR = 0.6;
const MIN_WADING_SPEED  = 0.05;
const RECOVERY_DURATION = 1.5;

// ============================================================================
//  EXPLORATION MAP
//  Chia phòng thành lưới ô vuông, đếm số lần agent đi qua mỗi ô.
//  setRandomTarget dùng để ưu tiên ô chưa (ít) được khám phá.
// ============================================================================
class ExplorationMap {
  constructor(cellSize = 0.6) {
    this.cellSize = cellSize;
    this.cells    = new Map();   // key "cx,cz" → visitCount
    this.bounds   = null;
    this.cols     = 0;
    this.rows     = 0;
    this._allKeys = [];          // cache của tất cả key hợp lệ
  }

  init(bounds) {
    this.bounds = bounds;
    this.cells.clear();
    this._allKeys = [];
    const cs = this.cellSize;
    this.cols = Math.max(1, Math.ceil((bounds.max[0] - bounds.min[0]) / cs));
    this.rows = Math.max(1, Math.ceil((bounds.max[2] - bounds.min[2]) / cs));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const key = `${c},${r}`;
        this.cells.set(key, 0);
        this._allKeys.push(key);
      }
    }
  }

  /** Gọi mỗi khi agent di chuyển — cộng 1 vào ô hiện tại */
  markVisited(x, z) {
    if (!this.bounds) return;
    const c = Math.floor((x - this.bounds.min[0]) / this.cellSize);
    const r = Math.floor((z - this.bounds.min[2]) / this.cellSize);
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
    const key = `${c},${r}`;
    this.cells.set(key, (this.cells.get(key) || 0) + 1);
  }

  /** Trả về trung tâm (x, z) của ô ít được thăm nhất (với softmax noise) */
  getLeastVisitedCenter(avoidNearPos = null, minDist = 1.5, validCheckFn = null) {
    if (!this.bounds || this._allKeys.length === 0) return null;
    const cs = this.cellSize;

    // Lấy visitCount của tất cả ô
    let candidates = this._allKeys.map(key => {
      const [c, r] = key.split(',').map(Number);
      const cx = this.bounds.min[0] + (c + 0.5) * cs;
      const cz = this.bounds.min[2] + (r + 0.5) * cs;
      const visits = this.cells.get(key) || 0;
      return { cx, cz, visits };
    });

    if (validCheckFn) {
      candidates = candidates.filter(cd => validCheckFn(cd.cx, cd.cz));
    }

    if (candidates.length === 0) return null;

    // Loại bỏ ô quá gần vị trí hiện tại
    if (avoidNearPos) {
      const far = candidates.filter(
        cd => Math.hypot(cd.cx - avoidNearPos[0], cd.cz - avoidNearPos[2]) >= minDist
      );
      if (far.length > 0) candidates = far;
    }

    // Sort theo visitCount tăng dần, lấy top 20% ít được thăm nhất
    candidates.sort((a, b) => a.visits - b.visits);
    const topN = Math.max(1, Math.floor(candidates.length * 0.2));
    const pool = candidates.slice(0, topN);

    // Chọn ngẫu nhiên trong pool để không đi lặp đúng 1 ô
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    // Thêm jitter nhỏ trong ô để không đi đúng tâm ô
    const jitter = cs * 0.3;
    return [
      chosen.cx + (Math.random() - 0.5) * jitter,
      chosen.cz + (Math.random() - 0.5) * jitter,
    ];
  }

  /** Tỉ lệ phòng đã được khám phá (0–1) */
  getCoverage() {
    if (this._allKeys.length === 0) return 0;
    let visited = 0;
    for (const k of this._allKeys) { if ((this.cells.get(k) || 0) > 0) visited++; }
    return visited / this._allKeys.length;
  }
}

// ============================================================================
//  AGE MOVEMENT PROFILES — EVIDENCE-BASED PARAMETERS
//
//  Tất cả giá trị số dưới đây được lấy trực tiếp từ các nghiên cứu được
//  đánh giá đồng nghiệp (peer-reviewed). Không có giá trị nào ước lượng.
//
//  NGUỒN THAM KHẢO CHÍNH:
//
//  [1] Dusing SC & Thorpe DE (2007). "A normative sample of temporal and
//      spatial gait parameters in children using the GAITRite electronic
//      walkway." Gait & Posture, 25(1), 135–139.
//      → Tốc độ đi bộ tự chọn (cm/s) theo tuổi, n=438 trẻ 1–10 tuổi.
//      1yr: 82±25 | 2yr: 88±20 | 3yr: 97±18 | 4yr: 107±16 | 5yr: 112±16
//      6yr: 118±15 | 7yr: 125±15 | 10yr: 134±15 cm/s
//
//  [2] Latorre-Roman PA et al. (2017). "Reference values for running sprint
//      field tests in preschool children." Gait & Posture, 54, 76–79.
//      → 20m sprint speed (tốc độ tối đa), n=3076 trẻ 3–6 tuổi:
//      3yr: 2.89 m/s | 4yr: 3.21 m/s | 5yr: 3.45 m/s | 6yr: 3.64 m/s
//
//  [3] Papaiakovou G et al. (2009). "The effect of chronological age and
//      gender on the development of sprint performance during childhood and
//      puberty." J Strength Cond Res, 23(9), 2568–2573.
//      → Tốc độ chạy 30m theo nhóm tuổi 7–18 năm.
//
//  [4] Liu W et al. (2022). "Biomechanical Characteristics of the Typically
//      Developing Toddler Gait: A Narrative Review." Children, 9(3), 406.
//      → Mô tả toàn diện gait toddler: wide base, flat foot, high guard arms,
//        short steps, high cadence, trunk sway, cadence 165-185 steps/min.
//
//  [5] Hakkarainen M et al. (2023). "Estimability study on the age of
//      toddlers' gait development based on gait parameters."
//      Scientific Reports, 13, 2977.
//      → Trunk sway tương quan nghịch với tuổi r = -0.58 (p<0.001).
//        Knee-to-knee distance (base of support) r = -0.78 với tuổi.
//
//  [6] Assaiante C et al. (1993, 1998, 2000). Longitudinal studies on trunk
//      lateral stability in toddlers. Neuroreport; J Mot Behav; Dev Psychobiol.
//      → Trunk oscillations giảm mạnh trong vài tuần đầu đi độc lập.
//        Hip stabilization xảy ra trước shoulder/head stabilization.
//
//  [7] Cavagna GA et al. (2001). "The mechanics of running in children."
//      J Physiol, 528(Pt 3), 647–656. PMC2231007.
//      → Step frequency giảm từ 4 Hz (2 tuổi) xuống 2.5 Hz (12 tuổi).
//        Tốc độ chạy tự nhiên trẻ nhỏ ~1.8–2.5 m/s (preferred, không phải max sprint).
//
//  [8] Xiong QL et al. (2021). "Measurement and Analysis of Human Infant
//      Crawling for Rehabilitation: A Narrative Review."
//      Front Neurol, 12, 731374.
//      → Infant crawling speed: khoảng 0.10–0.25 m/s (hands-and-knees).
//
//  [9] Adolph KE et al. (2019). "Where Infants Go: Real-Time Dynamics of
//      Locomotor Exploration." Child Dev, 91(2), e371–e390. PMC6893075.
//      → Crawlers: ~50% of bouts end at destinations.
//        Short, straight paths (destination-directed).
//        Pause & fix-before-moving pattern.
//
//  [10] Hallemans A et al. (2005). Spatiotemporal parameters 13.5–18.5 months.
//       → Walking speed newly walking toddlers: ~0.65–0.90 m/s.
//
//  [11] Lythgo N et al. (2009, 2011). GAITRite studies, n=737 children 5–13y.
//       → School age free-speed walking ~1.15–1.34 m/s. Mature gait by 7yr.
//
//  [12] PMAA/physiotherapy review (Sutherland 1997): Kinematic gait mature by
//       3.5–4 years. Spatiotemporal parameters stabilize ~7 years.
//
//  [13] Gallagher S et al. (2011). "Locomotion in restricted space."
//       Gait Posture, 33(1), 71–76.
//       → Adult 4-pt crawling: 0.50±0.20 m/s. Infant: much slower.
//
//  stumbleProb được ước tính từ: Adolph KE (2012) data về falls/hour
//  trong trẻ mới đi (toddler falls ~17 times/hour khi novice).
//  17 falls/hour ÷ 3600s ÷ ~2 falls per stumble attempt ≈ 0.0024/s
//  Tại 60 fps: 0.0024/60 ≈ 0.00004/frame. Nhưng không phải mọi stumble
//  đều dẫn đến ngã — nhân hệ số hiển thị là 3× → ~0.00012/frame cho novice.
//  Adolph ref: Adolph KE et al. (2012). "How do you learn to walk? Thousands
//  of steps and dozens of falls per day." Psychol Sci, 23(11), 1387–1394.
// ============================================================================
const AGE_MOVEMENT_PROFILES = {

  // ─────────────────────────────────────────────────────────────────────────
  //  INFANT — 6–12 tháng (Bò: hands-and-knees crawl)
  //  Refs: [8] Xiong 2021, [9] Adolph 2019, [4] Liu 2022
  // ─────────────────────────────────────────────────────────────────────────
  infant: {
    locomotion:         'crawl',

    // Tốc độ bò: Xiong 2021 báo cáo 0.10–0.25 m/s cho infant hands-knees.
    // Adult 4-pt crawl (Gallagher 2011) = 0.50 m/s — infant chậm hơn ~40%.
    velocityProfile: {
      crawl: { mean: 0.15, stdDev: 0.04 },   // m/s — Xiong 2021 [8]
      walk:  { mean: 0.15, stdDev: 0.04 },   // fallback = same as crawl
    },

    // Dao động thân mình ngang (lateral wobble):
    // Infant bò tạo dao động ngang thân lớn hơn toddler đứng (Assaiante [6]).
    // Biên độ 0.07m tương đương ~8° trunk lean ở chiều cao thân 0.3m
    wobbleAmplitude:    0.07,   // m — ước từ Assaiante 1993 [6]
    wobbleFrequency:    1.5,    // Hz — tần số chu kỳ bò (chậm)

    // Pause: Adolph 2019 [9] báo cáo crawlers dừng trước mỗi bout di chuyển
    // để fixate destination. Average bout = 3–5 bước → ~2–4s giữa các pause
    pauseInterval:      [2.0, 5.0],   // s — Adolph 2019 [9]
    pauseDuration:      [1.0, 3.5],   // s — fixation time before next bout

    // Không có burst chạy ở infant
    burstProb:          0.0,
    dirChangeProb:      0.02,    // ít tự chủ thay đổi hướng

    // Stumble (ngã trong khi bò): thấp hơn toddler đi đứng
    stumbleProb:        0.00005, // /frame — ước từ Adolph 2012 [13]

    // Curiosity: Adolph 2019 [9] — infant chủ yếu di chuyển đến vật ở gần
    curiosityRadius:    1.2,    // m — giới hạn bởi thị trường nhìn từ vị trí bò
    attentionSpan:      5.0,    // s — infant attention span rất ngắn
    boredomRate:        0.10,   // nhanh muốn đổi mục tiêu
    explorationBias:    0.25,   // bám gần spawn (attachment behavior)

    // Wobble đầu (head bob khi bò)
    headBobAmplitude:   0.012,  // m — quan sát clinical [4]

    // Đặc tính gait học từ [4], [5]:
    // - Bò = tứ chi, 4-beat gait
    // - Không có "stumble from heel strike" vì không đứng
    // - Arms support weight → arms NOT in high guard
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  EARLY TODDLER — 12–24 tháng (Đi mới, chập chững)
  //  Refs: [1] Dusing 2007, [4] Liu 2022, [5] Hakkarainen 2023,
  //        [6] Assaiante 1993–2000, [10] Hallemans 2005, Adolph 2012
  // ─────────────────────────────────────────────────────────────────────────
  early_toddler: {
    locomotion:         'walk',

    // Tốc độ đi bộ: Dusing & Thorpe 2007 [1], 1-year-old: 82±25 cm/s.
    // Hallemans 2005 [10]: newly walking 13.5–18.5 months = 0.65–0.90 m/s.
    velocityProfile: {
      walk:  { mean: 0.82, stdDev: 0.20 },   // m/s — Dusing 2007 [1]
      run:   { mean: 1.40, stdDev: 0.25 },   // m/s — ước từ Cavagna 2001 [7]
      crawl: { mean: 0.70, stdDev: 0.15 },
    },

    // Dao động thân mình ngang:
    // [5] Hakkarainen 2023: trunk sway tương quan nghịch r=-0.58 với tuổi.
    // [6] Assaiante 2000: "trunk oscillations significantly decreased in first
    //     weeks of walking" nhưng vẫn rất cao ở 12–18 months.
    // [4] Liu 2022: "wide base of support, arms in high guard position,
    //     increased trunk movement" — đặc trưng clinically.
    // 0.09m tương đương ~10–12° lateral trunk lean [4,5,6]
    wobbleAmplitude:    0.09,   // m — [5,6]: highest trunk sway at walk onset
    wobbleFrequency:    1.8,    // Hz — ~2-step cycle (cadence ~175-185 steps/min [4])

    // Pause: không documented rõ nhưng behavioral observation:
    // toddler mới đi dừng thường xuyên để re-stabilize
    pauseInterval:      [2.5, 6.0],
    pauseDuration:      [0.8, 2.5],

    // Burst chạy: ít, toddler mới đi chưa kiểm soát được run well
    burstProb:          0.015,
    burstDuration:      [0.5, 2.0],
    burstSpeedMult:     1.6,

    // Đổi hướng đột ngột: rất cao — toddlers "dart suddenly" (clinical obs)
    dirChangeProb:      0.07,

    // Stumble/falls:
    // Adolph KE et al (2012) Psychol Sci 23(11):1387–1394:
    // "Novice walkers average 17 falls/hour" = 17/3600 ≈ 0.0047/s
    // Chia 60fps = 0.000078/frame. Nhân 1.5 (hiển thị) = 0.00012/frame
    stumbleProb:        0.00012, // /frame — Adolph 2012

    curiosityRadius:    2.0,
    attentionSpan:      8.0,
    boredomRate:        0.06,
    explorationBias:    0.45,

    // Đặc tính gait [4]: flat foot / forefoot contact, arms in high guard
    // (shoulders abducted, elbows flexed), toes pointing outward, no heel strike
    armsHighGuard:      true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  LATE TODDLER — 24–36 tháng
  //  Refs: [1] Dusing 2007 (2yr: 88±20 cm/s), [4] Liu 2022, [5] Hakkarainen 2023
  //        Van Hamme et al 2015 (regression database 1–7yr, n=106)
  // ─────────────────────────────────────────────────────────────────────────
  late_toddler: {
    locomotion:         'run',

    // Dusing 2007 [1]: 2-year-old = 88±20 cm/s (self-selected walk).
    // Van Hamme 2015: regression confirms speed ~0.88 m/s at 2yr.
    // Running (Cavagna 2001 [7]): preferred running freq ≈ 3.5 Hz at 2yr →
    //   step length ~0.25m × 3.5 Hz = ~0.87 m/s preferred run (slow run).
    //   Max sprint at 3yr (Latorre 2017 [2]) = 2.89 m/s.
    velocityProfile: {
      walk:  { mean: 0.92, stdDev: 0.17 },   // m/s — Dusing 2007 [1]
      run:   { mean: 1.80, stdDev: 0.35 },   // m/s — Cavagna 2001 [7]
      sprint:{ mean: 2.70, stdDev: 0.40 },   // m/s — Latorre 2017 [2]
      crawl: { mean: 0.70, stdDev: 0.15 },
    },

    // [5] Hakkarainen: trunk sway ↓ với tuổi (r=-0.58).
    // Tại 24–36 tháng sway vẫn cao nhưng giảm so với 12 tháng.
    wobbleAmplitude:    0.06,   // m — giảm từ 0.09 của early_toddler
    wobbleFrequency:    2.0,    // Hz — cadence ~155–170 steps/min [4]

    pauseInterval:      [4.0, 10.0],
    pauseDuration:      [0.5, 2.0],

    // Burst chạy bùng phát: đặc trưng 2–3 tuổi ("explosive locomotion")
    // [7] Cavagna: children 2yr run with step freq 3.5 Hz
    burstProb:          0.055,
    burstDuration:      [1.0, 3.5],
    burstSpeedMult:     1.9,    // burst lên ~1.8 m/s từ walk 0.92 → run ~1.75 m/s

    dirChangeProb:      0.055,

    // Adolph 2012: novice walkers còn ~8 falls/hour tại 2yr (reduced from 17)
    // = 8/3600/60 × 1.5 = 0.000056/frame
    stumbleProb:        0.000056,

    // Forward lunge: toddler 2–3yr lean forward impulsively (clinical obs [4])
    forwardLunge:       0.12,

    curiosityRadius:    3.0,
    attentionSpan:      12.0,
    boredomRate:        0.045,
    explorationBias:    0.65,
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  PRESCHOOL — 3–5 tuổi
  //  Refs: [1] Dusing 2007 (3yr:97cm/s, 4yr:107, 5yr:112), [2] Latorre 2017,
  //        [12] Sutherland 1980 (kinematics mature by 3.5–4y),
  //        Van Hamme 2015, [7] Cavagna 2001
  // ─────────────────────────────────────────────────────────────────────────
  preschool: {
    locomotion:         'run',

    // Dusing 2007 [1]: 3yr=97±18, 4yr=107±16, 5yr=112±16 cm/s
    // Latorre 2017 [2] max sprint: 3yr=2.89, 4yr=3.21, 5yr=3.45 m/s
    // Preferred running (Cavagna 2001 [7]): step freq ~3.2 Hz ở 3–5yr →
    //   preferred running ~1.7–2.2 m/s (40–60% của sprint max)
    velocityProfile: {
      walk:   { mean: 1.05, stdDev: 0.13 },  // m/s — Dusing 2007 avg 3–5yr [1]
      run:    { mean: 2.00, stdDev: 0.40 },  // m/s — Cavagna 2001 preferred [7]
      sprint: { mean: 3.20, stdDev: 0.35 },  // m/s — Latorre 2017 avg 3–5yr [2]
      crawl:  { mean: 0.90, stdDev: 0.18 },
    },

    // Sutherland 1980/1997 [12]: kinematics adult-like by 3.5–4yr.
    // Trunk sway giảm đáng kể, gần bình thường. ~0.025m = ~3° lateral lean.
    wobbleAmplitude:    0.025,  // m — [12] mature kinematics 3.5yr
    wobbleFrequency:    2.5,    // Hz — cadence ~130–145 steps/min [1,4]

    pauseInterval:      [6.0, 18.0],
    pauseDuration:      [0.4, 2.0],

    // Burst running: preschool chạy bộc phát, đặc trưng nhóm tuổi [7]
    burstProb:          0.050,
    burstDuration:      [1.5, 5.0],
    burstSpeedMult:     1.75,   // walk 1.05 × 1.75 ≈ 1.84 m/s → vào preferred run

    // Running circles: preschool chạy vòng quanh đồ vật (imaginative play)
    circleProb:         0.035,
    circleDuration:     [2.0, 5.0],

    dirChangeProb:      0.025,

    // Falls ở preschool rất giảm so với toddler (Adolph 2012 [13]):
    // ~2 falls/hour ở experienced walkers = 2/3600/60 × 1.5 ≈ 0.000014/frame
    stumbleProb:        0.000014,

    curiosityRadius:    4.5,
    attentionSpan:      20.0,
    boredomRate:        0.028,
    explorationBias:    0.82,
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  SCHOOL AGE — 6–10 tuổi
  //  Refs: [1] Dusing 2007 (6yr:118, 10yr:134 cm/s), [3] Papaiakovou 2009,
  //        [11] Lythgo 2009 (n=737, 5–13yr), [12] Sutherland 1997,
  //        Chester & Biden 2006 (Clinical Biomechanics)
  // ─────────────────────────────────────────────────────────────────────────
  school_age: {
    locomotion:         'run',

    // Dusing 2007 [1]: 6yr=118±15, 7yr=125±15, 10yr=134±15 cm/s
    // Lythgo 2009 [11]: free-speed walk 5–13yr = ~1.15–1.30 m/s
    // Sprint 7yr (Papaiakovou 2009 [3]): boys ~3.8–4.2 m/s (30m sprint)
    // Preferred running: ~50–65% of max sprint → ~2.2–2.8 m/s
    velocityProfile: {
      walk:   { mean: 1.25, stdDev: 0.13 },  // m/s — Dusing 2007 avg 6–10yr [1]
      run:    { mean: 2.50, stdDev: 0.45 },  // m/s — preferred, Cavagna [7]
      sprint: { mean: 4.00, stdDev: 0.50 },  // m/s — Papaiakovou 2009 [3]
      crawl:  { mean: 1.10, stdDev: 0.20 },
    },

    // Lythgo 2011 [11]: spatiotemporal params stabilize ~7yr.
    // Trunk sway gần adult. ~0.01m = ~1° → Iosa (2014): head gait stable ~7yr.
    wobbleAmplitude:    0.010,  // m — [11,12] mature gait
    wobbleFrequency:    2.8,    // Hz — cadence ~110–125 steps/min (adult-like) [1]

    pauseInterval:      [8.0, 30.0],
    pauseDuration:      [0.3, 2.5],

    // Burst: school-age chạy bùng phát có kiểm soát (chase game, running play)
    burstProb:          0.038,
    burstDuration:      [2.0, 7.0],
    burstSpeedMult:     1.85,   // walk 1.25 × 1.85 ≈ 2.3 m/s (preferred run range)

    dirChangeProb:      0.012,

    // Chester 2006 [ref 13]: 6–10yr falls ≈ <1/hour → negligible
    stumbleProb:        0.000003,

    // "Scan before move": school-age children assess before acting (clinical obs)
    scanBeforeMove:     true,

    curiosityRadius:    7.0,
    attentionSpan:      45.0,
    boredomRate:        0.013,
    explorationBias:    1.0,
  },
};

function getAgeMovementProfile(ageGroupId) {
  // Map ageGroupId strings → profile key
  if (ageGroupId === 'infant')                                     return AGE_MOVEMENT_PROFILES.infant;
  if (ageGroupId === 'early_toddler')                              return AGE_MOVEMENT_PROFILES.early_toddler;
  if (ageGroupId === 'late_toddler')                               return AGE_MOVEMENT_PROFILES.late_toddler;
  if (ageGroupId === 'preschool')                                  return AGE_MOVEMENT_PROFILES.preschool;
  if (ageGroupId === 'child')                                      return AGE_MOVEMENT_PROFILES.child;
  return AGE_MOVEMENT_PROFILES.early_toddler; // fallback
}

class Agent {
  constructor(id, startPosition, rigidBody, ageGroupId, world = null) {
    this.id         = id;
    this.body       = rigidBody;
    this.ageGroupId = ageGroupId;
    this.world      = world;  // stored so controller can be used in moveTowardsTarget

    // Init from Age Group early for physics
    const groupData = getAgeGroup(this.ageGroupId);
    if (groupData) {
      this.gaitStability = groupData.gaitStability || 0.8;
      this.anthropometry = groupData.anthropometry || null;
    }

    // ── Character controller (anti-clip) ─────────────────────────────────
    // Created once per agent; used by moveAgentWithController every frame.
    this.controller = null;
    // FIX CLIPPING: khởi tạo this.collider từ body để KCC có target collider
    this.collider = null;
    if (world && physicsEngine.rapier) {
      try {
        let kccOffset = 0.05;
        if (this.ageGroupId === 'infant') kccOffset = 0.15;
        else if (this.ageGroupId === 'early_toddler' || this.ageGroupId === 'late_toddler') kccOffset = 0.10;

        // [FIX P3] Bind maxStepHeight to legLength * 0.4 (biological capability).
        // Old hard-coded values let infants step over adult-sized obstacles and
        // toddlers get permanently stuck on toys. 
        // legLength * 0.4 matches empirical max step-height studies:
        //   infant (~0.22m leg): maxStep = 0.088m (~9cm) — can step over low doorsills
        //   early_toddler (~0.28m): maxStep = 0.112m (~11cm) — low toys, thresholds
        //   late_toddler (~0.32m): maxStep = 0.128m (~13cm)
        //   preschool (~0.38m): maxStep = 0.152m (~15cm)
        //   school_age (~0.46m): maxStep = 0.184m (~18cm)
        const legLen = groupData?.anthropometry?.legLength
                    ?? (groupData?.height ?? 0.8) * 0.40;
        const maxStepHeight = Math.max(0.05, legLen * 0.4);

        this.controller = physicsEngine.createCharacterController(world, kccOffset, maxStepHeight);
      } catch (e) {
        console.warn(`[Agent ${id}] Could not create character controller:`, e.message);
      }
    }

    // ── Trajectory ───────────────────────────────────────────────────────
    this.trajectory            = [];
    this.MAX_TRAJECTORY_POINTS = 600;
    this.trajectorySampleRate  = 1;
    this.frameCount            = 0;

    // ── State & Behavior ─────────────────────────────────────────────────
    this.state           = 'IDLE';
    this.emotion         = 'neutral';
    this.behaviorQueue   = [];
    this.currentBehavior = null;
    this.behaviorTimer   = 0;

    // ── Rare Events ──────────────────────────────────────────────────────
    this.participatingInRareEvent = false;
    this.rareEventChain           = null;
    this.rareEventStep            = 0;

    // ── Movement ─────────────────────────────────────────────────────────
    this.targetPosition    = null;
    this.velocity          = [0, 0, 0];
    this.previousPosition  = [...startPosition];
    this.failedMovementCooldown = 0;
    this.targetLockTimer   = 0;
    // [FIX v3] spawnY = FEET Y (floor surface Y where agent was spawned).
    // This is NOT the Rapier body-centre Y (which = spawnY + height/2).
    // All fall-height calculations must use: h = getFeetY(pos.y) - spawnY
    // where getFeetY(bodyCentreY) = bodyCentreY - height/2.
    this.spawnY            = startPosition[1];
    this.availableObjects  = [];

    // ── Research-Based Stats ─────────────────────────────────────────────
    this.fatigueLevel    = 0.0; // Mirror for legacy
    this.gaitStability   = 1.0;
    this.lastStumbleTime = 0;

    // ── [Phase 2] Muscle Fatigue Model ──────────────────────────────────
    this.muscleState = {
      fatigueLevel: 0.0,
      sustainedLoadTimer: 0.0
    };

    // ── Wading (v2) ───────────────────────────────────────────────────────
    this.wadingPenalty  = 0.0;
    this.wadingObjectId = null;

    // ── Recovery (v2) ────────────────────────────────────────────────────
    this.recoveryTimer = 0;

    // (Moved getAgeGroup up to apply early physics constraints)

    // ── Action Log ────────────────────────────────────────────────────────
    this.actionLog = [];

    // ── Metrics ───────────────────────────────────────────────────────────
    this.totalDistance = 0;
    this.stateHistory  = new Map();

    // ── Physics ───────────────────────────────────────────────────────────
    this.fallState     = null;
    this.stunTimer     = 0;
    this.pendingBounce = null;

    // ── Perception → Decision Pipeline (v4: vision, reaction latency) ────
    this.perceptionQueue = [];       // {object, saliencyScore, seenAt}
    this.reactionTimer   = 0;        // countdown from reactionLatency
    this.pendingReaction  = null;     // object waiting for reaction

    // ── Object Permanence Memory (Piaget) ────────────────────────────────
    this.objectMemory = new Map();   // objectId → {lastSeenPos, lastSeenTime}

    // ── Heading & Kinematics ─────────────────────────────────────────────
    this.currentHeading     = Math.random() * Math.PI * 2; // radians
    this.lastDirChangeTime  = 0;

    // ── Learning & Short-term Memory ─────────────────────────────────────
    this.dangerMap      = new Map(); // posKey → {pos, severity, expiresAt}
    this.actionFailLog  = new Map(); // "objId_action" → {count}
    this.frustrationCount = 0;

    // ── Anti-stuck detection ──────────────────────────────────────────────
    this.stuckCounter  = 0;
    this.lastMovePos   = [...startPosition];
    // FIX STATE LOOP: idle cooldown prevents instant re-targeting after stuck escape,
    // breaking the MOVING → stuck 60f → IDLE → MOVING → stuck loop.
    this.idleCooldown  = 0;

    // ── Simulation Timer ──────────────────────────────────────────────────
    this.simTime       = 0;

    // ── [v5] Exploration Map ──────────────────────────────────────────────
    // Nhớ vùng đã đi qua → ưu tiên khám phá nơi mới
    this.explorationMap = new ExplorationMap(0.6);
    this._boundsInited  = false;   // init lần đầu khi có bounds

    // ── [v5] Curiosity & Boredom (Phase 4 AI Engine) ──────────────────────
    this.boredomLevel       = 0.0;     // 0=hứng thú, 1=chán hoàn toàn
    this.lastPositionChange = 0;       // simTime lần cuối agent di chuyển đáng kể
    this.curiosityTarget    = null;    // điểm tò mò hiện tại {pos, expiresAt}
    this.burstState         = null;    // {endTime, speedMult} — trạng thái chạy bùng phát
    this.circleState        = null;    // {center, radius, angle, endTime}
    this.pauseUntil         = 0;       // simTime dừng lại nhìn xung quanh
    
    // ── [Phase 4] Curiosity Driven Behavior Engine ────────────────────
    this.curiosityLevel     = getAgeGroup(ageGroupId)?.curiosity || 0.8;
    this.fearLevel          = getAgeGroup(ageGroupId)?.riskAwareness || 0.2;
    this.objectExposureMap  = new Map(); // Tracks exposure time to decay curiosity

    // [FIX v3] Cache half-height so fall calculations can convert body-centre Y → feet Y
    const _ag = getAgeGroup(ageGroupId);
    this._agentHalfH = (_ag?.height ?? 1.0) / 2;

    // ── [v5] Age Movement Profile ─────────────────────────────────────────
    this._ageProfile = getAgeMovementProfile(ageGroupId);
    this._wobblePhase = Math.random() * Math.PI * 2;  // phase ngẫu nhiên mỗi agent
    this._driftPhase  = Math.random() * Math.PI * 2;  // continuous drift phase

    // ── [v5] Known floor Y ────────────────────────────────────────────────
    // Set bởi simulationController sau spawn, dùng cho target Y chính xác
    this._knownFloorY  = startPosition[1];

    // ── [FIX-C] Speed cache — resample velocity every step cycle, not per-frame
    // Gaussian per-frame resampling created 3600× noise amplification in DBC.
    // One biological step = ~350ms → resample interval = 0.35s
    this._cachedSpeed           = null;
    this._speedActionType       = null;   // invalidate cache on action type change
    this._speedResampleTimer    = 0;
    this._speedResampleInterval = 0.35;   // seconds — 1 gait step cycle

    // ── [P4] Hand Interaction Sensors ────────────────────────────────────
    // Set by simulationController after world creation via physicsEngine.createHandSensors()
    this.handSensors        = null;   // { left: {body,collider}, right: {body,collider} }
    this._handInteractCooldown = 0;   // per-object interaction debounce timer
    this._handInteractLog   = new Map(); // objectId → lastInteractTime
    this._handReachRadius   = (groupData?.anthropometry?.armLength ?? (groupData?.height ?? 0.8) * 0.30) * 0.75;
  }

  // ── Physics Utility ───────────────────────────────────────────────────────
  setSafeTranslation(newPos) {
    if (!this.body) return;
    if (Number.isFinite(newPos.x) && Number.isFinite(newPos.y) && Number.isFinite(newPos.z)) {
      this.body.setNextKinematicTranslation(newPos);
    } else {
      console.warn(`[Agent ${this.id}] Guarded NaN in setSafeTranslation:`, newPos);
    }
  }

  // ── [v6] Dynamic Center of Mass (COM) Calculation ───────────────────────
  getDynamicCOM() {
    const ag = getAgeGroup(this.ageGroupId);
    const pos = this.getPosition();
    if (!ag || !ag.segmentalMass) {
      // Static fallback if no segmental data
      return [pos[0], pos[1] + (ag?.height || 0.8) * 0.55, pos[2]];
    }

    const { head, torso, arms, legs } = ag.segmentalMass;
    const isCrawling = (!ag.canWalk || this.currentBehavior?.action === 'crawl');
    const totalH = ag.height || 0.8;
    
    let comY = pos[1];
    
    let comX = pos[0];
    let comZ = pos[2];
    
    if (isCrawling) {
      // ── [Phase 7] Inertial Lag in Crawling ────────────────────────
      const accelMult = 0.02; 
      comX -= (this.acceleration?.[0] || 0) * accelMult;
      comZ -= (this.acceleration?.[2] || 0) * accelMult;
    } else {
      // ── [Phase 7] Inertial Lag in Standing/Running ────────────────
      const accelMult = 0.05; // 50ms inertial lag
      comX -= (this.acceleration?.[0] || 0) * accelMult;
      comZ -= (this.acceleration?.[2] || 0) * accelMult;
    }

    // ── [Phase 5] POSTURAL COM MODEL ─────────────────────────────────────
    // Dynamic segment mapping based on current behavior state
    let headY  = totalH * 0.90;
    let torsoY = totalH * 0.60;
    let armsY  = totalH * 0.55;
    let legsY  = totalH * 0.25;
    
    let headZ = 0;
    let torsoZ = 0;
    let armsZ = 0;
    let legsZ = 0;
    
    if (isCrawling) {
      headY  = totalH * 0.35;
      torsoY = totalH * 0.25;
      armsY  = totalH * 0.15;
      legsY  = totalH * 0.15;
      
      headZ  = totalH * 0.4;
      torsoZ = 0;
      armsZ  = totalH * 0.3;
      legsZ  = -totalH * 0.3;
    } else if (this.currentBehavior?.action?.includes('pull') || this.currentBehavior?.action?.includes('push')) {
      // Leaning forward
      headZ  = totalH * 0.3;
      torsoZ = totalH * 0.15;
      armsZ  = totalH * 0.4; // Arms extended
    } else if (this.currentBehavior?.action?.includes('reach_up')) {
      // Arms raised, COM shifts up, slight lean back
      armsY  = totalH * 0.85;
      headZ  = -totalH * 0.05; 
      torsoZ = -totalH * 0.05;
    }
    
    // Calculate final anatomical COM
    const weightedY = (head * headY) + (torso * torsoY) + (arms * armsY) + (legs * legsY);
    const weightedZ = (head * headZ) + (torso * torsoZ) + (arms * armsZ) + (legs * legsZ);
    
    comY += weightedY;
    
    // Rotate local Z offset by agent's heading to get global world X/Z shift
    const heading = this.currentHeading || 0;
    comX += Math.sin(heading) * weightedZ;
    comZ += Math.cos(heading) * weightedZ;
    
    this.debugCOM = {
      position: [comX, comY, comZ],
      bosRadius: ag?.capsuleRadius ? ag.capsuleRadius * 1.5 : 0.33,
      comDistFromBOS: Math.hypot(comX - pos[0], comZ - pos[2])
    };
    
    return [comX, comY, comZ];
  }

  // ── ActionLog recording ───────────────────────────────────────────────────
  recordPosition(position) {
    this.frameCount++;
    if (this.frameCount % this.trajectorySampleRate !== 0) return;

    this.trajectory.push(position.map(v => Math.round(v * 100) / 100));

    // FIX BUG #9: When agent is MOVING with no currentBehavior (wander), log 'walk' not 'idle'.
    // Previously entry.a was always 'idle' during wander — causing wrong animation in Canvas3D.
    const wanderAction = (this.state === 'MOVING' && !this.currentBehavior) ? 'walk' : null;
    const entry = {
      s: this.state,
      a: wanderAction || this.currentBehavior?.action || this.currentBehavior?.type || 'idle',
      v: Math.round(Math.hypot(this.velocity[0], this.velocity[2]) * 100) / 100,
    };
    if (this.emotion && this.emotion !== 'neutral')    entry.e        = this.emotion;
    if (this.wadingObjectId)                           { entry.wadingIn = this.wadingObjectId; entry.a = 'wade'; }
    if (this.recoveryTimer > 0)                        entry.recovery  = true;

    this.actionLog.push(entry);

    if (this.trajectory.length > this.MAX_TRAJECTORY_POINTS) {
      this.trajectory.shift();
      this.actionLog.shift();
    }
  }

  // ── Gaussian helper ───────────────────────────────────────────────────────
  _gaussianRandom(mean, stdDev) {
    const u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v) * stdDev + mean;
  }

  getRealisticVelocity(actionType) {
    // [FIX-C] Cache velocity sample per gait step cycle (0.35s), not per-frame.
    // Old code: fresh Gaussian sample every 16ms → velocity jitter Δv ≈ ±0.17 m/s
    // every frame → acceleration = 0.17 × 60 = 10 m/s² → DBC fires constantly.
    // Fix: re-use the same speed for one full step cycle. Biological gait speed
    // varies step-to-step, not frame-to-frame.
    const now = this.simTime ?? 0;
    if (
      this._cachedSpeed !== null &&
      this._speedActionType === actionType &&
      now < this._speedResampleTimer
    ) {
      return this._cachedSpeed;
    }

    // [v6] Ưu tiên velocityProfile từ AGE_MOVEMENT_PROFILES (evidence-based)
    const movProf = this._ageProfile;
    let speed;
    if (movProf?.velocityProfile) {
      const vp = movProf.velocityProfile[actionType]
              || movProf.velocityProfile.walk
              || movProf.velocityProfile.crawl;
      if (vp) {
        speed = this._gaussianRandom(vp.mean, vp.stdDev);
        speed *= (1.0 - this.fatigueLevel * 0.4);
        if (this.wadingPenalty > 0) {
          speed *= (1.0 - this.wadingPenalty);
          speed  = Math.max(MIN_WADING_SPEED, speed);
        }
        speed = Math.max(MIN_WADING_SPEED, speed);
      }
    }
    if (speed == null) {
      // Fallback: ageGroups.js velocityProfile
      const ag = getAgeGroup(this.ageGroupId);
      if (!ag?.velocityProfile) {
        speed = 1.0;
      } else {
        const prof = ag.velocityProfile[actionType] || ag.velocityProfile.walk || ag.velocityProfile.crawl
                  || { mean: ag.speed || 0.5, stdDev: (ag.speed || 0.5) * 0.15 };
        speed = this._gaussianRandom(prof.mean, prof.stdDev);
        speed *= (1.0 - this.fatigueLevel * 0.4);
        if (this.wadingPenalty > 0) {
          speed *= (1.0 - this.wadingPenalty);
          speed  = Math.max(MIN_WADING_SPEED, speed);
        }
        speed = Math.max(MIN_WADING_SPEED, speed);
      }
    }

    // Store in cache for this step cycle
    this._cachedSpeed         = speed;
    this._speedActionType     = actionType;
    this._speedResampleTimer  = now + this._speedResampleInterval;
    return speed;
  }

  // ── Emotion helpers ───────────────────────────────────────────────────────
  _setEmotion(e)  { this.emotion = e; }
  _clearEmotion() { this.emotion = 'neutral'; }

  // ── Attraction scanning — Vision-based with Saliency Map ──────────────────
  scanForAttractions(bounds) {
    if (this.participatingInRareEvent) return;

    // Prevent continuous overriding of existing reactions/behaviors
    if (this.pendingReaction) return;
    if (this.behaviorQueue && this.behaviorQueue.length && ['investigate', 'grab_mouth', 'hurt', 'crying', 'recovery'].includes(this.behaviorQueue[0]?.type)) return;

    // Lower scan frequency if currently busy (except wandering)
    const isWandering = !this.currentBehavior || (this.currentBehavior.action && this.currentBehavior.action.includes('random'));
    if (!isWandering && Math.random() > 0.02) return;
    if (isWandering && Math.random() > 0.15) return;

    const ag = getAgeGroup(this.ageGroupId);
    if (!ag || !this.availableObjects.length) return;

    // Step 1: Vision-based scan with FOV + saliency scoring
    const visible = visionSystem.scanVisibleObjects(this, this.availableObjects);
    if (!visible.length) return;

    // Step 2: Update object permanence memory
    const now = Date.now() / 1000;
    for (const v of visible) {
      this.objectMemory.set(v.object.id, {
        lastSeenPos: visionSystem._getObjCenter(v.object),
        lastSeenTime: now,
      });
    }
    // Forget old objects (limited memory by age)
    const memoryLimit = ag.cognition?.hiddenObjectMemory || 30;
    for (const [id, mem] of this.objectMemory) {
      if (now - mem.lastSeenTime > memoryLimit) this.objectMemory.delete(id);
    }

    // Step 3: Apply stranger/large-object fear penalty
    const best = visible[0];
    let score = best.score;
    score = this._applyStrangerFear(best.object, score);

    // Step 4: Queue best object with reaction latency delay
    if (score > 0.5 && Math.random() < score * 0.3) {
      // ── [Phase 6] NEUROMOTOR DELAY SYSTEM ──────────────────────────────────
      if (ag.neuromotorLatency) {
        // Reaction delay = Perception + Transmission + Actuation
        const { perception, transmission, actuation } = ag.neuromotorLatency;
        this.reactionTimer = perception + transmission + actuation;
      } else {
        const stats = this._getFatigueModifiedStats();
        this.reactionTimer = stats.reactionLatency;
      }
      this.pendingReaction = best;
    }
  }

  // ── Update loop ───────────────────────────────────────────────────────────
  update(deltaTime, colliders, otherAgents, bounds) {
    if (!this.body) return;
    this.availableObjects = colliders || [];
    this.simTime += deltaTime;

    const cur = this.getPosition();
    this.recordPosition(cur);

    const dx = cur[0] - this.previousPosition[0];
    const dy = cur[1] - this.previousPosition[1];
    const dz = cur[2] - this.previousPosition[2];
    
    const newVel = [dx/deltaTime, dy/deltaTime, dz/deltaTime];
    if (this.velocity) {
      // [FIX-A] Smooth acceleration with EMA (Exponential Moving Average).
      // Raw double-derivative at 60fps: Δv/Δt = (v_n - v_{n-1}) / (1/60)
      // → amplifies Gaussian velocity jitter by 3600×, causing DBC to fire
      // 80%+ of frames (measured: 48 triggers/s, should be <1 trigger/s).
      // EMA α=0.08 → smoothing window ≈ 1/(0.08×60) = 208ms (≈ 1 step cycle).
      // This matches biological proprioceptive delay for postural correction.
      const EMA_ALPHA = 0.08;
      const rawAccX = (newVel[0] - this.velocity[0]) / deltaTime;
      const rawAccZ = (newVel[2] - this.velocity[2]) / deltaTime;
      const prevAcc = this.acceleration || [0, 0, 0];
      this.acceleration = [
        prevAcc[0] + EMA_ALPHA * (rawAccX - prevAcc[0]),
        0,  // Y-axis acceleration not used in DBC lateral balance calc
        prevAcc[2] + EMA_ALPHA * (rawAccZ - prevAcc[2]),
      ];
    } else {
      this.acceleration = [0, 0, 0];
    }
    this.velocity = newVel;
    this.totalDistance += Math.sqrt(dx*dx + dy*dy + dz*dz);

    // ── [Phase 2] MUSCLE FATIGUE MODEL ─────────────────────────────────────
    const ag = getAgeGroup(this.ageGroupId);
    const fProfile = ag?.fatigueProfile || { fatigueRate: 0.05, recoveryRate: 0.1, enduranceCapacity: 60 };
    
    if (this.state === 'MOVING' || this.state === 'INTERACTING') {
      this.muscleState.fatigueLevel = Math.min(1.0, this.muscleState.fatigueLevel + deltaTime * fProfile.fatigueRate);
      // Heavy load fatigue applied in executeAction
    } else if (this.state === 'IDLE') {
      this.muscleState.fatigueLevel = Math.max(0.0, this.muscleState.fatigueLevel - deltaTime * fProfile.recoveryRate);
      this.muscleState.sustainedLoadTimer = Math.max(0.0, this.muscleState.sustainedLoadTimer - deltaTime);
    }
    // Mirror to legacy fatigue for movement scale
    this.fatigueLevel = this.muscleState.fatigueLevel;

    if (this.recoveryTimer > 0) {
      this.recoveryTimer = Math.max(0, this.recoveryTimer - deltaTime);
      if (this.recoveryTimer === 0 && this.emotion === 'crying') this._clearEmotion();
    }

    if (this.wadingPenalty > 0) {
      this.wadingPenalty = Math.max(0, this.wadingPenalty - deltaTime * 2.0);
      if (this.wadingPenalty === 0) this.wadingObjectId = null;
    }

    // [v5] Init exploration map khi có bounds lần đầu
    if (bounds && !this._boundsInited) {
      this.explorationMap.init(bounds);
      this._boundsInited = true;
    }

    // [v5] Đánh dấu ô đã đi qua mỗi frame
    if (this._boundsInited) {
      this.explorationMap.markVisited(cur[0], cur[2]);
    }

    // [v5] Cập nhật boredom — tăng khi đứng yên, giảm khi di chuyển
    this._updateBoredom(deltaTime, cur);

    this.scanForAttractions(bounds);

    // ── Process Reaction Latency Pipeline ──────────────────────────────────
    if (this.pendingReaction && this.reactionTimer > 0) {
      this.reactionTimer -= deltaTime;
      if (this.reactionTimer <= 0) {
        this._reactToObject(this.pendingReaction);
        this.pendingReaction = null;
      }
    }

    // [FIX-C] Update hand sensors position each frame BEFORE physics step.
    // simulationController calls physicsEngine.step() after agent.update(),
    // so hand sensors will be in correct position when event queue is drained.
    this._updateHandSensors();

    this.updateBehavior(deltaTime, colliders, bounds);
    this.previousPosition = [...cur];
  }

  updateBehavior(deltaTime, colliders, bounds) {
    if (!this.body) return;

    // ── [Phase 1] DYNAMIC BALANCE CONTROLLER ─────────────────────────────────
    const pos = this.getPosition();
    const dynamicCOM = this.getDynamicCOM();
    const agData = getAgeGroup(this.ageGroupId);
    
    // Only check stability if moving or interacting aggressively
    if (agData && (this.state === 'MOVING' || this.state === 'INTERACTING') && !this.fallState) {
      const capsuleRadius = agData.capsuleRadius || 0.22;
      const supportRadius = capsuleRadius * 1.5; // Base of Support
      
      const comDistX = dynamicCOM[0] - pos[0];
      const comDistZ = dynamicCOM[2] - pos[2];
      const comDist = Math.hypot(comDistX, comDistZ);
      
      // Calculate Margin of Stability
      let marginOfStability = supportRadius - comDist;
      
      const bCtrl = agData.balanceControl || { ankleGain: 0.5, hipGain: 0.5, recoveryStepLatency: 0.5, balanceNoise: 0.5 };
      
      // Inject deterministic motor noise into balance perception
      // Note: Math.random() is globally overridden by seededRandom.js (Mulberry32)
      const noise = (Math.random() * 2 - 1) * bCtrl.balanceNoise * 0.1;
      marginOfStability += noise;
      
      if (marginOfStability < 0.10) {
        // Need balance correction strategy
        if (marginOfStability >= 0.04) {
          // 1. Ankle Strategy (small adjustment)
          if (!this._stratLog) {
            this.actionLog.push({ s: this.state, a: 'ankle_strategy', margin: marginOfStability.toFixed(2) });
            this._stratLog = true;
          }
          // Slight velocity dampening
          this.velocity[0] *= (1.0 - (1.0 - bCtrl.ankleGain) * 0.1);
          this.velocity[2] *= (1.0 - (1.0 - bCtrl.ankleGain) * 0.1);
        } else if (marginOfStability >= 0.0) {
          // 2. Hip Strategy (larger COM shift, torso bends)
          this.actionLog.push({ s: this.state, a: 'hip_strategy', margin: marginOfStability.toFixed(2) });
          // Stronger velocity dampening
          this.velocity[0] *= (1.0 - (1.0 - bCtrl.hipGain) * 0.4);
          this.velocity[2] *= (1.0 - (1.0 - bCtrl.hipGain) * 0.4);
        } else if (marginOfStability >= -0.15) {
          // 3. Step Strategy (take rapid recovery step to expand BOS)
          this.actionLog.push({ s: 'IDLE', a: 'step_strategy', margin: marginOfStability.toFixed(2) });
          
          this.behaviorQueue = [
             { type: 'stumble', action: 'lose_balance', duration: bCtrl.recoveryStepLatency, completed: false }
          ];
          this.currentBehavior = null;
          this.state = 'INTERACTING';
          this._setEmotion('scared');
          return;
        } else {
          // 4. Fall
          this.actionLog.push({ s: 'IDLE', a: 'fall_failed', margin: marginOfStability.toFixed(2) });
          
          const isRunStall = Math.hypot(this.velocity[0], this.velocity[2]) > 1.5;
          this.behaviorQueue = [
             { type: 'stumble', action: isRunStall ? 'fall_forward' : 'trip', duration: 1.5, completed: false }
          ];
          this.currentBehavior = null;
          this.targetPosition = null;
          this.state = 'IDLE';
          this.velocity = [0, 0, 0];
          this._setEmotion('scared');
          return; // Physics interrupt
        }
      } else {
        this._stratLog = false; // Reset log spam blocker
      }
    }

    // Apply queued bounce (outside Rapier drain loop)
    if (this.pendingBounce && this.body) {
      const pos  = this.body.translation();
      const newX = pos.x + this.pendingBounce.nx * this.pendingBounce.force;
      const newZ = pos.z + this.pendingBounce.nz * this.pendingBounce.force;
      if (Number.isFinite(newX) && Number.isFinite(newZ)) {
        this.setSafeTranslation({ x: newX, y: pos.y, z: newZ });
      }
      this.pendingBounce = null;
    }

    if (this.stunTimer > 0) { this.stunTimer -= deltaTime; return; }
    if (this.fallState && this.body) { this.executeAction({ action: 'free_fall' }, deltaTime, colliders, bounds); return; }
    if (this.participatingInRareEvent && this.rareEventChain) { this.executeRareEventStep(deltaTime, colliders, bounds); return; }

    // FIX STATE LOOP: honour idle cooldown — do NOT pick a new target while cooling down.
    // This breaks the rapid MOVING→stuck→IDLE→MOVING→stuck cycle by inserting a real pause.
    if (this.idleCooldown > 0) {
      this.idleCooldown = Math.max(0, this.idleCooldown - deltaTime);
      this.state = 'IDLE';
      return;
    }

    if (this.currentBehavior) {
      this.behaviorTimer += deltaTime;
      if (this.behaviorTimer >= this.currentBehavior.duration) {
        this.currentBehavior.completed = true; this.currentBehavior = null;
        this.behaviorTimer = 0; this.state = 'IDLE';
      } else {
        this.executeAction(this.currentBehavior, deltaTime, colliders, bounds);
      }
    } else if (this.state === 'MOVING' && this.targetPosition) {
      this.moveTowardsTarget(deltaTime, 'walk');
      if (!this.targetPosition) this.state = 'IDLE';
    } else {
      this.pickNextBehavior(deltaTime, bounds);
      if (this.state === 'MOVING' && this.targetPosition) this.moveTowardsTarget(deltaTime, 'walk');
    }
  }

  pickNextBehavior(deltaTime, bounds) {
    // FIX-P1: Complete rewrite — old code never assigned flat behaviors to currentBehavior
    if (!this.behaviorQueue?.length) {
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }

    // Find next uncompleted behavior
    let next = this.behaviorQueue.find(b => !b.completed);

    // If all behaviors are done, reset and cycle
    if (!next) {
      // FIX: Remove one-shot reaction behaviors (hurt/crying/recovery) — they must NOT be recycled.
      // handleCollision replaces behaviorQueue with [hurt, cry, get_up]. Without this filter,
      // pickNextBehavior resets them to completed=false and replays the chain forever.
      const REACTION_TYPES = ['hurt', 'crying', 'recovery'];
      this.behaviorQueue = this.behaviorQueue.filter(b => !REACTION_TYPES.includes(b.type));

      // Restore saved behaviors if collision had replaced them
      if (!this.behaviorQueue.length && this._savedBehaviorQueue?.length) {
        this.behaviorQueue = this._savedBehaviorQueue;
        this._savedBehaviorQueue = null;
      }

      if (this.behaviorQueue.length) {
        this.behaviorQueue.forEach(b => {
          b.completed = false;
          if (b.sequence) b.sequence.forEach(a => { a.completed = false; });
        });
      }
      // Walk to random target between behavior cycles
      this.state = 'MOVING';
      this.setRandomTarget(bounds);
      return;
    }

    // Case 1: Behavior has a sequence of sub-actions
    if (next.sequence && next.sequence.length > 0) {
      const act = next.sequence.find(a => !a.completed);
      if (act) {
        // FIX-P1: Resolve target for sub-actions like {action:'crawl', target:'object'}
        this._resolveActionTarget(act, next, bounds);
        this.currentBehavior = act;
        this.behaviorTimer = 0;
      } else {
        // All sub-actions completed — mark parent as completed
        next.completed = true;
        // Walk to random target briefly before next behavior
        this.state = 'MOVING';
        this.setRandomTarget(bounds);
      }
      return;
    }

    // Case 2: Behavior is a flat action (no sequence)
    // — This was the critical bug: these were NEVER executed before!
    this._resolveActionTarget(next, next, bounds);
    this.currentBehavior = next;
    this.behaviorTimer = 0;
  }

  // FIX-P1: Resolve target position for an action based on targetObjectId or target type
  _resolveActionTarget(action, parentBehavior, bounds) {
    const targetId = action.targetObjectId || parentBehavior?.targetObjectId;
    const targetType = action.target || parentBehavior?.targetTypes?.[0];

    // If action already has a target, or is a stationary action, skip
    if (this.targetPosition) return;
    const stationaryActions = ['grab', 'grab_mouth', 'reach_up', 'pull', 'pull_to_stand',
      'open_drawer', 'pause', 'look_around', 'lose_balance', 'climb_on'];
    if (stationaryActions.includes(action.action)) return;

    // Try to find a specific target object
    if (targetId && this.availableObjects.length > 0) {
      const obj = this.availableObjects.find(c =>
        c.id === targetId || c.name?.toLowerCase().includes(targetId.toLowerCase())
      );
      if (obj?.boundingBox) {
        // FIX STATE LOOP: Target the NEAR EDGE of the bounding box, not its geometric center.
        // Targeting the center places the goal INSIDE the furniture, causing the KCC to
        // block immediately, triggering stuckCounter, and creating the MOVING→stuck→IDLE loop.
        const cur = this.getPosition();
        const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
        const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
        const toCurX = cur[0] - cx;
        const toCurZ = cur[2] - cz;
        const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
        const hx = (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2;
        const hz = (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2;
        const edgeRadius = Math.max(hx, hz);
        const capsR = this.anthropometry ? (this.anthropometry.walkStride || 0.3) : 0.3;
        const approachOffset = edgeRadius + capsR * 2.5;
        this.targetPosition = [
          cx + (toCurX / toCurLen) * approachOffset,
          obj.boundingBox.min[1],
          cz + (toCurZ / toCurLen) * approachOffset,
        ];
        return;
      }
    }

    // Try to find by target type (e.g. 'furniture', 'cord', 'object')
    if (targetType && targetType !== 'random' && this.availableObjects.length > 0) {
      const cur = this.getPosition();
      let bestObj = null, bestDist = Infinity;
      for (const obj of this.availableObjects) {
        if (!obj.boundingBox) continue;
        const name = (obj.name || obj.id || '').toLowerCase();
        if (name.includes(targetType.toLowerCase()) || targetType === 'object') {
          const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
          const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
          const d = Math.hypot(cx - cur[0], cz - cur[2]);
          if (d < bestDist && d < 8.0) { bestDist = d; bestObj = obj; }
        }
      }
      if (bestObj) {
        // FIX STATE LOOP: same edge-approach fix for type-matched objects
        const cur2 = this.getPosition();
        const cx = (bestObj.boundingBox.min[0] + bestObj.boundingBox.max[0]) / 2;
        const cz = (bestObj.boundingBox.min[2] + bestObj.boundingBox.max[2]) / 2;
        const toCurX = cur2[0] - cx;
        const toCurZ = cur2[2] - cz;
        const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
        const hx = (bestObj.boundingBox.max[0] - bestObj.boundingBox.min[0]) / 2;
        const hz = (bestObj.boundingBox.max[2] - bestObj.boundingBox.min[2]) / 2;
        const edgeRadius = Math.max(hx, hz);
        const capsR = this.anthropometry ? (this.anthropometry.walkStride || 0.3) : 0.3;
        const approachOffset = edgeRadius + capsR * 2.5;
        this.targetPosition = [
          cx + (toCurX / toCurLen) * approachOffset,
          bestObj.boundingBox.min[1],
          cz + (toCurZ / toCurLen) * approachOffset,
        ];
        return;
      }
    }

    // Fallback: random position
    this.setRandomTarget(bounds);
  }

  executeAction(action, deltaTime, colliders, bounds) {
    if (!this.body) return;
    const t = action.action || action.type;

    switch (t) {
      case 'walk_to':
      case 'investigate':
        this.state = 'MOVING';
        // [FIX bbox-C2] Guard: only compute target once.
        // Old code: re-set target to CENTRE of object every frame → KCC blocked
        // immediately → stuckCounter++ every frame → escape loop every 1.5s.
        // Fix: skip if targetPosition already set. Use EDGE approach (not centre).
        if (!this.targetPosition && (action.targetObjectId || action.target)) {
          const id  = action.targetObjectId || action.target;
          const obj = colliders.find(c => c.id === id || c.name?.toLowerCase().includes(id.toLowerCase()));
          if (obj?.boundingBox) {
            // Approach edge of object, not its centre
            const cur2 = this.getPosition();
            const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
            const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
            const toCurX = cur2[0] - cx;
            const toCurZ = cur2[2] - cz;
            const toCurLen = Math.hypot(toCurX, toCurZ) || 1;
            const edgeR = Math.max(
              (obj.boundingBox.max[0] - obj.boundingBox.min[0]) / 2,
              (obj.boundingBox.max[2] - obj.boundingBox.min[2]) / 2
            );
            const capsR = this.anthropometry?.walkStride ?? 0.3;
            const offset = edgeR + capsR * 2.0;
            this.targetPosition = [
              cx + (toCurX / toCurLen) * offset,
              obj.boundingBox.min[1],
              cz + (toCurZ / toCurLen) * offset,
            ];
          } else {
            this.setRandomTarget(bounds);
          }
        } else if (!this.targetPosition) {
          this.setRandomTarget(bounds);
        }
        this.moveTowardsTarget(deltaTime, 'walk');
        break;

      case 'walk_random':
        this.state = 'MOVING';
        // [v5/Bug4] Luôn chọn target mới khi null — bao gồm sau khi danger zone reject
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'walk');
        if (!this.targetPosition) this.setRandomTarget(bounds);
        break;

      case 'crawl':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'crawl');
        if (!this.targetPosition) this.setRandomTarget(bounds);
        break;

      case 'run': case 'run_unstable':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'run');
        break;

      case 'lunge':
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, 'lunge');
        break;

      case 'trip': case 'stumble': case 'fall_forward': {
        // FIX BUG #11: Use FALLING state immediately so injury calculator gets correct severity.
        // [FIX v3 BOUNCE]: pos.y is the BODY CENTRE (= feetY + halfH).
        // spawnY is the FEET Y. So the real height above floor =
        //   (pos.y - this._agentHalfH) - this.spawnY
        // Previously used pos.y - this.spawnY which was always ≈ halfH even on flat ground,
        // causing every stumble to trigger free_fall unnecessarily → infinite bounce loop.
        const pos = this.body.translation();
        const currentFeetY = pos.y - this._agentHalfH;
        const h   = currentFeetY - this.spawnY;
        const landingY = this.spawnY + this._agentHalfH; // body-centre Y at floor level
        if (h > 0.15) {
          this.state = 'FALLING';
          this.fallState = { startY: pos.y, targetY: landingY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        } else {
          this.state = 'INTERACTING'; // ground-level stumble: no airtime
          if (this.behaviorTimer < 0.3) {
            const surge = 1.0 * deltaTime, angle = Math.random() * Math.PI * 2;
            this.setSafeTranslation({
              x: pos.x + Math.cos(angle)*surge,
              y: Math.max(landingY - 0.2, pos.y - Math.sin(this.behaviorTimer*10)*0.1),
              z: pos.z + Math.sin(angle)*surge,
            });
          } else {
            this.state = 'IDLE'; this.velocity = [0,0,0];
            this.recoveryTimer = RECOVERY_DURATION;
            this._setEmotion('crying');
          }
        }
        break;
      }

      case 'free_fall': {
        this.state = 'FALLING';
        if (!this.body) break;
        const pos = this.body.translation();
        if (!this.fallState) {
          // [FIX v3 BOUNCE]: Convert body-centre Y to feet Y before computing height.
          // pos.y = body centre = feetY + halfH.  spawnY = feetY at spawn.
          // Real height above floor = (pos.y - halfH) - spawnY.
          const currentFeetY = pos.y - this._agentHalfH;
          const h = Math.max(0.1, currentFeetY - this.spawnY);
          const landingY = this.spawnY + this._agentHalfH; // body-centre at floor level
          this.fallState = { startY: pos.y, targetY: landingY, fallHeight: h,
            velocity: Math.sqrt(2*9.81*h), elapsed: 0, duration: Math.sqrt(2*h/9.81) };
        }
        this.fallState.elapsed += deltaTime;
        const t2       = Math.min(this.fallState.elapsed / this.fallState.duration, 1.0);
        const newY     = this.fallState.startY - this.fallState.fallHeight * t2 * t2;
        this.setSafeTranslation({ x: pos.x, y: Math.max(this.fallState.targetY, newY), z: pos.z });
        if (t2 >= 1.0) {
          this.fallState = null; this.state = 'IDLE';
          this.recoveryTimer = RECOVERY_DURATION;
          this._setEmotion('crying');
        }
        break;
      }

      // FIX-H4: Interaction actions — agent stays in place but records action for frontend animation
      case 'grab': case 'grab_mouth':
        this.state = 'INTERACTING';
        // Agent stays still, but emotion may change (mischievous for grab_mouth)
        if (t === 'grab_mouth') this._setEmotion('mischievous');
        break;

      case 'reach_up': {
        this.state = 'INTERACTING';
        // FIX: Remove physical Y-axis accumulation. 'reach_up' (tiptoes) should only 
        // be a visual animation on the frontend. Modifying physics Y here causes the 
        // "Flying Bug" because the agent never returns to the floor.
        break;
      }

      case 'open_drawer': case 'pull': case 'pull_to_stand': case 'push': {
        const agData = getAgeGroup(this.ageGroupId);
        const maxTorque = agData?.physics?.maxJointTorqueNm || 10;
        
        // Approximate force needed
        let assumedForceN = 20; // Default generic force
        if (action.targetObjectId && colliders) {
          const obj = colliders.find(c => c.id === action.targetObjectId);
          // Very simplified force heuristic based on object height/mass estimate
          if (obj && obj.boundingBox) {
            const h = obj.boundingBox.max[1] - obj.boundingBox.min[1];
            assumedForceN = 10 + (h * 40); 
          }
        }

        const armLength = agData?.anthropometry?.armLength || 0.2;
        const requiredTorque = assumedForceN * armLength;

        // ── [Phase 2] MUSCLE FATIGUE MODEL (Effective Torque) ────────────────
        // effectiveTorque = maxJointTorqueNm * fatigueFactor * postureFactor * coordinationFactor
        
        let fatigueFactor = 1.0 - (this.muscleState.fatigueLevel * 0.5); // Max 50% torque loss from general fatigue
        let postureFactor = (this.state === 'IDLE') ? 1.0 : 0.8;
        
        // [Phase 6] Stochastic Motor Noise injection
        const motorNoise = agData?.motorControl?.coordinationNoise || 0.1;
        let coordinationFactor = 1.0 - (Math.random() * motorNoise); // Mulberry32 seeded
        
        const effectiveTorque = maxTorque * fatigueFactor * postureFactor * coordinationFactor;

        // Apply sustained load if pushing hard but failing
        if (requiredTorque > 0.6 * maxTorque) {
            this.muscleState.sustainedLoadTimer += deltaTime;
            if (this.muscleState.sustainedLoadTimer > 2.0) { // 2 seconds of sustained struggling
                const fProfile = agData?.fatigueProfile || { fatigueRate: 0.05, enduranceCapacity: 60 };
                // Exponential fatigue spike
                this.muscleState.fatigueLevel = Math.min(1.0, this.muscleState.fatigueLevel + (fProfile.fatigueRate * 5.0)); 
            }
        }

        if (requiredTorque > effectiveTorque) {
          this.logTorqueLimitExceeded(this.id, requiredTorque, effectiveTorque);
          
          // Action mapping on failure
          this.state = 'INTERACTING';
          this.behaviorTimer = 0;
          this.currentBehavior = { type: 'failed_torque', action: 'lose_balance', duration: 1.5, completed: false };
          this._setEmotion('frustrated');
          break;
        }

        this.state = 'INTERACTING';
        // Pull back slightly — agent leans backward
        const pos_p = this.body.translation();
        const pullBack = Math.sin(this.behaviorTimer * 1.5) * 0.02 * deltaTime;
        if (Number.isFinite(pos_p.z + pullBack)) {
          this.setSafeTranslation({ x: pos_p.x, y: pos_p.y, z: pos_p.z + pullBack });
        }
        break;
      }

      case 'climb_on': {
        const pos_c  = this.body.translation();
        const curPos = [pos_c.x, pos_c.y, pos_c.z];
        let climbTarget = null;
        
        // 1. Try intended target
        const intendedTargetId = action.targetObjectId || this.currentBehavior?.targetObjectId;
        if (intendedTargetId) {
          climbTarget = (colliders || []).find(c => c.id === intendedTargetId);
        }
        
        // 2. Find nearest climbable-size object (within 0.4m)
        if (!climbTarget) {
          let bestDist = 0.4;
          for (const obj of (colliders || [])) {
            if (!obj.boundingBox) continue;
            const cx = (obj.boundingBox.min[0] + obj.boundingBox.max[0]) / 2;
            const cz = (obj.boundingBox.min[2] + obj.boundingBox.max[2]) / 2;
            const objHeight = obj.boundingBox.max[1] - obj.boundingBox.min[1];
            const d = Math.hypot(cx - curPos[0], cz - curPos[2]);
            if (d < bestDist && objHeight > 0.2 && objHeight < 1.5) { 
              climbTarget = obj; 
              bestDist = d;
            }
          }
        }
        if (!climbTarget) { this.state = 'IDLE'; break; }

        // Non-climbable filter
        const climbTargetName = (climbTarget.name || climbTarget.id || '').toLowerCase();
        const isNonClimbable = /curtain|drape|blind|rem|man_cua|shade|banner|tapestry|flag|ri_do|wall|picture|frame|painting|poster|mirror|clock|lamp|sconce|tranh|tuong|anh/.test(climbTargetName);
        if (isNonClimbable) {
          this.state = 'INTERACTING';
          this._setEmotion('mischievous');
          if (this.currentBehavior) {
             this.currentBehavior.action = climbTargetName.match(/curtain|drape|blind|rem|man_cua|ri_do/) ? 'pull' : 'reach_up';
          }
          break;
        }

        // Validate climbability
        const agData = getAgeGroup(this.ageGroupId);
        // FIX: Strictly limit maxClimbH to 1.0m even for older kids to prevent wall-climbing
        const maxClimbH = Math.min(1.0, (agData?.reachHeight || 0.5) * 1.5);
        const objH = climbTarget.boundingBox.max[1] - climbTarget.boundingBox.min[1];
        const friction = this._getObjectFriction(climbTarget);

        if (!agData?.canClimb || objH > maxClimbH || friction < 0.3) {
          this.state = 'INTERACTING';
          this._setEmotion(friction < 0.3 ? 'frustrated' : 'scared');
          if (this.currentBehavior) {
            this.currentBehavior.action = 'reach_up';
          }
          break;
        }

        const progress = this.behaviorTimer / (action.duration || 3.0);

        // FIX BUG #7: Set state based on phase.
        // Phase 1 (approach) = MOVING; Phase 2+ (actual climb) = INTERACTING.
        // Previously was INTERACTING for ALL phases causing fatigue/animation mismatch.
        if (progress < 0.3) {
          this.state = 'MOVING';  // ← approaching the object, agent is walking
        } else {
          this.state = 'INTERACTING'; // ← actually climbing
        }
        
        const fail = agData?.climbFailRate || 0.1;
        const adjustedFail = fail + (1 - friction) * 0.2;
        if (Math.random() < adjustedFail && pos_c.y > (this.spawnY + this._agentHalfH) + 0.1) {
          // [FIX v3 BOUNCE]: pos_c.y is body-centre. Convert to feet Y for fall height.
          const currentFeetY = pos_c.y - this._agentHalfH;
          const h = currentFeetY - this.spawnY;
          const landingY = this.spawnY + this._agentHalfH;
          this.fallState = { startY: pos_c.y, targetY: landingY, fallHeight: Math.max(0.1, h),
            velocity: Math.sqrt(2*9.81*Math.max(0.1, h)), elapsed: 0, duration: Math.sqrt(2*Math.max(0.1, h)/9.81) };
        } else {
          // FIX: Headboard Bug. Don't blindly use the object's absolute max Y.
          // Fallback simple cap:
          const maxAllowedY = (this.spawnY + this._agentHalfH) + (agData?.height || 0.8) + 0.1;
          let objectTopY = climbTarget.boundingBox.max[1];

          // Use raycast at the center of the object to find the actual surface height, not the headboard peak.
          const cx = (climbTarget.boundingBox.min[0] + climbTarget.boundingBox.max[0]) / 2;
          const cz = (climbTarget.boundingBox.min[2] + climbTarget.boundingBox.max[2]) / 2;

          if (this.world) {
             const ray = new physicsEngine.rapier.Ray({ x: cx, y: objectTopY + 0.5, z: cz }, { x: 0, y: -1, z: 0 });
             const hit = this.world.castRay(ray, objectTopY - this.spawnY + 1.0, true);
             if (hit) {
               const hitToi = hit.toi !== undefined ? hit.toi : hit.timeOfImpact;
               objectTopY = (objectTopY + 0.5) - hitToi;
             }
          }

          const targetTopY = Math.min(objectTopY, maxAllowedY);
          
          // Safety fallback: if targetTopY is somehow way above actual floor (e.g., raycast glitch), abort
          if (targetTopY > maxAllowedY + 0.5) {
            this.state = 'IDLE';
            return;
          }
          
          // FIX: Walk to object EDGE (not center) to prevent clipping into geometry
          const objHalfX = (climbTarget.boundingBox.max[0] - climbTarget.boundingBox.min[0]) / 2;
          const objHalfZ = (climbTarget.boundingBox.max[2] - climbTarget.boundingBox.min[2]) / 2;
          const capsuleR = agData?.capsuleRadius || 0.15;
          const edgeDist = Math.max(objHalfX, objHalfZ) + capsuleR * 1.5;
          const toObjX = cx - pos_c.x;
          const toObjZ = cz - pos_c.z;
          const toObjLen = Math.hypot(toObjX, toObjZ) || 1;
          const edgeX = cx - (toObjX / toObjLen) * Math.min(edgeDist, Math.max(objHalfX, objHalfZ));
          const edgeZ = cz - (toObjZ / toObjLen) * Math.min(edgeDist, Math.max(objHalfX, objHalfZ));
          
          if (progress < 0.3) {
            // Phase 1: approach edge of object
            this.targetPosition = [edgeX, pos_c.y, edgeZ];
            this.moveTowardsTarget(deltaTime, 'walk');
          } else {
            const dObject = Math.hypot(cx - pos_c.x, cz - pos_c.z);
            if (dObject > 1.2) {
               // Too far — cancel climb
               this.state = 'IDLE';
               this.targetPosition = null;
               break;
            }
            
            if (progress < 0.8) {
              // Phase 2: pull up (capped speed, never exceed targetTopY)
              const climbSpeed = this.getRealisticVelocity('climb');
              const maxLift = climbSpeed * deltaTime * 0.5; // Max 0.5m/s climb rate
              const liftY = Math.min(maxLift, targetTopY - pos_c.y);
              if (liftY > 0) {
                this.setSafeTranslation({
                  x: pos_c.x, y: Math.min(targetTopY, pos_c.y + liftY), z: pos_c.z
                });
              }
            } else {
              // Phase 3: on top (capped)
              this.setSafeTranslation({
                x: pos_c.x, y: Math.min(targetTopY, pos_c.y), z: pos_c.z
              });
            }
          }
        }
        break;
      }

      case 'hurt_light': case 'hurt_medium': case 'hurt_heavy': case 'hurt_shock': case 'recoil':
        this.state = 'INTERACTING';
        break;

      case 'crying_stand': case 'crying_sit':
        this.state = 'INTERACTING';
        break;

      case 'get_up_slow': case 'get_up_fast':
        this.state = 'INTERACTING';
        // FIX BUG #12: 'scared' should be set at the BEGINNING of get_up (just fell, frightened),
        // then cleared to 'cautious' as agent finishes standing up.
        // Previously was setting 'scared' at 80% done — logically backwards.
        if (this.behaviorTimer <= deltaTime * 2) {
          // First frame of get_up: agent is scared from the fall
          this._setEmotion('scared');
        } else if (this.behaviorTimer > (action.duration || 1.5) * 0.8) {
          // Near end: agent has recovered, transition to cautious
          this._setEmotion('cautious');
        }
        break;

      case 'pause': case 'look_around':
        this.state = 'IDLE';
        break;

      // Group G: Rare events + F7 slide — agent stays in place, frontend animates
      case 'dodge': case 'push': case 'throw': case 'pick_up':
      case 'sit_down': case 'stand_up': case 'jump': case 'land': case 'slide':
        this.state = 'INTERACTING';
        break;

      // FIX-P2: climb_on must check if there's actually something to climb nearby
      // If nothing climbable within 1.5m, convert to 'look_around' instead
      default: {
        // FIX BUG #8: Use `t` (the extracted string) not `action` (the object) for comparison.
        // Previously `action === 'crawl'` was ALWAYS false because action is an object like {action:'crawl',...}.
        this.state = 'MOVING';
        if (!this.targetPosition) this.setRandomTarget(bounds);
        this.moveTowardsTarget(deltaTime, t === 'crawl' ? 'crawl' : 'walk');
      }
    }
  }

  // ── Movement Kernel — Anti-Clip via KCC + Turn Rate + Inertia ─────────────
  moveTowardsTarget(deltaTime, actionType = 'walk') {
    if (!this.targetPosition || !this.body) return;
    if (this.simTime < this.failedMovementCooldown) return;

    const cur  = this.getPosition();
    const dx   = this.targetPosition[0] - cur[0];
    const dz   = this.targetPosition[2] - cur[2];
    const dist = Math.sqrt(dx*dx + dz*dz);
    const arr  = this._getArrivalThreshold(actionType);
    if (dist < arr) {
      this.targetPosition = null;
      if (this.emotion === 'mischievous' && Math.random() < 0.2) this._setEmotion('excited');
      else this._clearEmotion();
      return;
    }

    // Danger zone avoidance (Learning & Memory system)
    const dangerCheck = this._isNearDangerZone(this.targetPosition);
    if (dangerCheck.dangerous) {
      this._logRiskEvent('near_miss', this.targetPosition, { reason: 'danger_zone_avoided' });
      this.targetPosition = null;
      this.state = 'IDLE';
      return;
    }

    // ── BIOLOGICAL PHYSICS: Torque Limits on Movement ───────────────────────
    const agTorqueData = getAgeGroup(this.ageGroupId);
    if (agTorqueData && agTorqueData.physics) {
      // Calculate dynamic torque based on child's mass, intended acceleration, and leg length
      const legLength = agTorqueData.anthropometry?.legLength || 0.2;
      const agentMass = agTorqueData.mass || 12;
      const accelTime = agTorqueData.kinematics?.accelerationTime || 0.5;
      
      // Acceleration estimated roughly as speed/0.5s time-to-speed
      const accel = this.getRealisticVelocity(actionType) / accelTime;
      const requiredForce = agentMass * accel;
      const requiredTorque = requiredForce * legLength;
      const maxTorque = agTorqueData.physics.maxJointTorqueNm;

      if (requiredTorque > maxTorque) {
        this.logTorqueLimitExceeded(this.id, requiredTorque, maxTorque);
        // Force stumble or lose_balance state due to insufficient torque to overcome inertia
        this.behaviorQueue = [{ type: 'stumble', action: 'lose_balance', duration: 1.5, completed: false }];
        this.currentBehavior = null;
        this.velocity = [0, 0, 0];
        this.state = 'IDLE';
        this.failedMovementCooldown = this.simTime + 0.5;
        return;
      }
    }

    // Nếu đang trong trạng thái pause (nhìn xung quanh) → không di chuyển
    if (this.simTime < this.pauseUntil) return;

    // [v5] Xác định speed thực tế — có thể bị burst nhân lên
    let speed = this.getRealisticVelocity(actionType);
    
    // ── FOOT-GROUND CONTACT FRICTION ──────────────────────────────────────────
    // Fetch friction matrix from physicsEngine ('hardwood' assumed default)
    const floorFriction = physicsEngine.getFrictionForMovement(actionType, 'hardwood');
    speed *= (floorFriction / 0.5); // Normalize around 0.5 typical friction

    const prof = this._ageProfile;
    if (this.burstState && this.simTime < this.burstState.endTime) {
      speed *= this.burstState.speedMult;
    }

    // Stumble check — xác suất theo profile tuổi
    const stumbleP = prof.stumbleProb || 0;
    if (stumbleP > 0 && Math.random() < stumbleP) {
      this.behaviorQueue = [{ type: 'stumble', action: 'fall_forward', duration: 1.5, completed: false }];
      this.currentBehavior = null;
      return;
    }

    // ── [v5] Steering: Seek + Obstacle Avoidance ─────────────────────────
    // 1. Seek vector — hướng thẳng đến target
    const seekX = dx / dist;
    const seekZ = dz / dist;

    // 2. Avoid vector — tổng lực đẩy ra từ các vật cản gần
    let avoidX = 0, avoidZ = 0;
    const avoidRadius = 0.35;   // chỉ xét vật trong 0.35m
    const solidObstacles = (this.availableObjects || []).filter(obj => {
      if (!obj.boundingBox) return false;
      const { min, max } = obj.boundingBox;
      const objH = max[1] - min[1];
      const roomW = this._boundsInited
        ? Math.max(this.explorationMap.cols, this.explorationMap.rows) * this.explorationMap.cellSize
        : 10;
      const objW = Math.max(max[0] - min[0], max[2] - min[2]);
      if (objW > roomW * 0.75) return false;  // sàn/tường → skip
      if (objH < 0.20) return false;          // thảm mỏng → skip
      if (min[1] > (this._knownFloorY ?? 0) + 0.5) return false; // treo cao → skip
      return true;
    });

    for (const obj of solidObstacles) {
      const bb = obj.boundingBox;
      // Tìm điểm gần nhất trên AABB với agent
      const nearX = Math.max(bb.min[0], Math.min(cur[0], bb.max[0]));
      const nearZ = Math.max(bb.min[2], Math.min(cur[2], bb.max[2]));
      const toObjX = cur[0] - nearX;
      const toObjZ = cur[2] - nearZ;
      const toObjDist = Math.hypot(toObjX, toObjZ);

      // [FIX bbox-D] Handle toObjDist = 0: agent is INSIDE the AABB.
      // Old condition: toObjDist > 0 — silently skipped this case,
      // leaving the agent with zero avoidance force when spawned inside bbox.
      // Fix: generate a random escape direction when directly overlapping.
      if (toObjDist < avoidRadius) {
        const safeDist = Math.max(toObjDist, 0.01);
        const strength = (1 - safeDist / avoidRadius) * 1.5;
        if (toObjDist < 0.01) {
          // Directly inside AABB — push in a random direction based on agentId
          // (deterministic per-agent to avoid oscillation between agents)
          const escAngle = (this.id * 2.399963) % (Math.PI * 2); // golden angle spread
          avoidX += Math.cos(escAngle) * strength;
          avoidZ += Math.sin(escAngle) * strength;
        } else {
          avoidX += (toObjX / safeDist) * strength;
          avoidZ += (toObjZ / safeDist) * strength;
        }
      }
    }

    // 3. Kết hợp seek + avoid (normalize avoid nếu lớn quá)
    const avoidLen = Math.hypot(avoidX, avoidZ);
    // Trọng số avoid tăng khi gần vật (max 0.45), tránh áp đảo seek quá mức
    const avoidWeight = Math.min(0.45, avoidLen * 0.3);
    const seekWeight  = 1 - avoidWeight;
    let steerX = seekX * seekWeight + (avoidLen > 0 ? (avoidX/avoidLen)*avoidWeight : 0);
    let steerZ = seekZ * seekWeight + (avoidLen > 0 ? (avoidZ/avoidLen)*avoidWeight : 0);
    const steerLen = Math.hypot(steerX, steerZ) || 1;
    steerX /= steerLen;
    steerZ /= steerLen;

    // ── [v5] Age Kinematics ───────────────────────────────────────────────
    const ag  = getAgeGroup(this.ageGroupId);
    const kin = ag?.kinematics;
    const stats = this._getFatigueModifiedStats();
    let moveX, moveZ;

    if (kin) {
      // Turn rate — agent không xoay ngay lập tức mà xoay dần
      const desiredAngle = Math.atan2(steerZ, steerX);
      const angleDiff    = this._normalizeAngle(desiredAngle - this.currentHeading);
      const maxTurn      = stats.turnRate * deltaTime;
      this.currentHeading += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

      // Forward bias (toddler lao về phía trước bốc đồng)
      const biasedSpeed = speed * (1.0 + kin.forwardBias * 0.3);

      // Momentum — quán tính từ frame trước
      const rawX = Math.cos(this.currentHeading) * biasedSpeed * deltaTime;
      const rawZ = Math.sin(this.currentHeading) * biasedSpeed * deltaTime;
      const mf = kin.momentumFactor;
      moveX = rawX * (1 - mf) + (this.velocity[0] * deltaTime) * mf;
      moveZ = rawZ * (1 - mf) + (this.velocity[2] * deltaTime) * mf;
    } else {
      moveX = steerX * speed * deltaTime;
      moveZ = steerZ * speed * deltaTime;
    }

    // ── [Phase 6] STOCHASTIC MOTOR NOISE ───────────────────────────────────
    const agObj = getAgeGroup(this.ageGroupId);
    const mCtrl = agObj?.motorControl || { coordinationNoise: 0.1, motorPlanningError: 0.05 };
    
    // 1. Lateral Wobble (Rhythmic)
    const prevWobble = Math.sin(this._wobblePhase) * (prof.wobbleAmplitude || 0);
    this._wobblePhase += prof.wobbleFrequency * deltaTime * Math.PI * 2;
    const currWobble = Math.sin(this._wobblePhase) * (prof.wobbleAmplitude || 0);
    const wobbleDelta = currWobble - prevWobble;

    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0.001) {
      this._driftPhase += deltaTime * 1.5;

      // 1. Motor Planning Error (Drift in intended trajectory)
      // Two superimposed sine waves create a fluid, continuous wander instead of white noise
      const wanderFactor = Math.sin(this._driftPhase) * 0.5 + Math.cos(this._driftPhase * 0.73) * 0.5;
      const planErrorAngle = wanderFactor * mCtrl.motorPlanningError; 
      
      const currentX = moveX;
      const currentZ = moveZ;
      moveX = currentX * Math.cos(planErrorAngle) - currentZ * Math.sin(planErrorAngle);
      moveZ = currentX * Math.sin(planErrorAngle) + currentZ * Math.cos(planErrorAngle);
      
      // 2. Coordination Noise (Stochastic magnitude jitter & lateral wobble)
      const speedWander = Math.sin(this._driftPhase * 1.3);
      const coordJitter = 1.0 + (speedWander * mCtrl.coordinationNoise);
      moveX *= coordJitter;
      moveZ *= coordJitter;

      // Apply lateral rhythmic wobble
      const perpX = -moveZ / moveLen;
      const perpZ =  moveX / moveLen;
      moveX += perpX * wobbleDelta;
      moveZ += perpZ * wobbleDelta;
    }

    // §Fix: use character controller so agent slides along walls instead of clipping
    if (this.controller && this.world) {
      const kccCollider = this.collider ?? this.colliders?.torso ?? this.colliders?.legs ?? null;
      if (kccCollider) {
        const corrected = physicsEngine.moveAgentWithController(
          this.world, this.controller, this.body, kccCollider,
          { x: moveX, y: -0.05, z: moveZ },
          deltaTime
        );

        // ── Anti-stuck detection ──────────────────────────────────────────
        const posNow = this.body.translation();
        const stuckDx = posNow.x - this.lastMovePos[0];
        const stuckDz = posNow.z - this.lastMovePos[2];
        const stuckDist = Math.sqrt(stuckDx * stuckDx + stuckDz * stuckDz);
        
        // Expected movement minimum is 5% of their intended speed for that frame
        const intendedDist = Math.hypot(moveX, moveZ);
        const isEffectivelyStuck = intendedDist > 0.001 && stuckDist < intendedDist * 0.05;

        // Absolute micro-stuck fallback (avoids float precision errors)
        if (isEffectivelyStuck || stuckDist < 0.0005) {
          this.stuckCounter++;
        } else {
          this.stuckCounter = 0;
        }
        this.lastMovePos = [posNow.x, posNow.y, posNow.z];

        // If stuck for 90+ frames (~1.5s at 60fps), try escape via KCC (not teleport)
        if (this.stuckCounter > 90) {
          const escDist = 0.4;
          const moveLen2 = Math.hypot(moveX, moveZ) || 1;
          // Try 3 escape directions via KCC to find the clearest path
          const escDirs = [
            { x: -moveZ / moveLen2 * escDist, z:  moveX / moveLen2 * escDist },  // perp left
            { x:  moveZ / moveLen2 * escDist, z: -moveX / moveLen2 * escDist },  // perp right
            { x: -moveX / moveLen2 * escDist, z: -moveZ / moveLen2 * escDist },  // backward
          ];
          let bestMoveDist = 0;
          for (const dir of escDirs) {
            const esc = physicsEngine.moveAgentWithController(
              this.world, this.controller, this.body, kccCollider,
              { x: dir.x, y: 0, z: dir.z },
              deltaTime
            );
            const d = Math.hypot(esc?.x || 0, esc?.z || 0);
            if (d > bestMoveDist) bestMoveDist = d;
          }
          // FIX BUG 2: idleCooldown ngắn hơn (0.3–0.6s) để không lãng phí quá nhiều thời gian
          this.stuckCounter = 0;
          this.targetPosition = null;
          this.state = 'IDLE';
          this.idleCooldown = 0.3 + Math.random() * 0.3;
        }
        return;
      }
    }

    // Fallback: direct translation
    const pos = this.body.translation();
    if (Number.isFinite(pos.x + moveX) && Number.isFinite(pos.z + moveZ)) {
      this.setSafeTranslation({ x: pos.x + moveX, y: pos.y, z: pos.z + moveZ });
    }
  }

  // ── [v6] Physics Safey Logger ─────────────────────────────────────
  logTorqueLimitExceeded(agentId, torqueRequested, maxTorque) {
    if (this.simTime - (this._lastTorqueLogTime || 0) < 1.0) return; // Debounce logging
    this._lastTorqueLogTime = this.simTime;
    
    console.warn(`[Physics Safety] Agent ${agentId} exceeded biological torque limit! Requested: ${torqueRequested.toFixed(1)}Nm, Max: ${maxTorque.toFixed(1)}Nm`);
    
    this.actionLog.push({
      s: 'INTERACTING',
      a: 'torque_exceeded',
      v: 0,
      reqTorque: torqueRequested,
      maxTorque: maxTorque
    });
  }

  _getArrivalThreshold(actionType) {
    if (!this.anthropometry) return 0.2;
    switch (actionType) {
      case 'crawl':  return this.anthropometry.crawlReach  || 0.15;
      case 'run':
      case 'sprint': return (this.anthropometry.runStride  || 0.5) * 0.5;
      default:       return (this.anthropometry.walkStride || 0.3) * 0.5;
    }
  }

  // ── Collision / Intersection handlers ────────────────────────────────────
  handleIntersection(softObj) {
    if (!this.body) return;
    const r = typeof softObj.materialResistance === 'number' ? softObj.materialResistance : 0.60;
    this.wadingPenalty  = Math.min(1.0, r * WADING_SCALE_FACTOR);
    this.wadingObjectId = softObj.id || null;
  }

  handleCollision(contactNormal, severity, objectId = null) {
    if (!this.body) return;
    if (this.stunTimer > 0) return;
    if (this.fallState) return;

    // FIX: Ignore all severe impacts in the first 3 seconds to allow the agent to settle after spawn.
    // The KinematicCharacterController produces massive virtual velocities when pushing agents out of initial overlaps.
    // 2s was not always enough for furniture-spawn cases; increased to 3s.
    if (this.simTime < 3.0) return;

    // FIX: Don't start a new hurt chain while still recovering from a previous collision.
    // This breaks the get_up_fast → hurt_medium → cry_standing infinite loop.
    if (this.recoveryTimer > 0) return;

    // FIX: Per-object collision cooldown — ignore repeated collisions with same object within 8s.
    // Increased from 5s to 8s: agents spawning very close to furniture kept retriggering
    // the hurt chain every 5s even after physically settling, causing a perpetual state loop.
    if (objectId) {
      if (!this._collisionCooldowns) this._collisionCooldowns = new Map();
      const lastHit = this._collisionCooldowns.get(objectId) || 0;
      if (this.simTime - lastHit < 8.0) return;
      this._collisionCooldowns.set(objectId, this.simTime);
    }

    // FIX: Only interrupt behaviors and trigger hurt/cry for significant impacts.
    // severity < 15 usually means grazing or brushing past an object while KCC is sliding.
    if (severity < 15) {
      if (objectId) {
        this.actionLog.push({ type: 'graze', severity: severity.toFixed(1), objectId });
      }
      return; 
    }

    const force    = severity > 50 ? 0.15 : severity > 20 ? 0.08 : 0.01;
    const stun     = severity > 50 ? 1.5  : severity > 20 ? 0.8  : 0.2;
    let nx = 0, nz = 0;
    if (contactNormal && (contactNormal[0] !== 0 || contactNormal[2] !== 0)) {
      const len = Math.hypot(contactNormal[0], contactNormal[2]);
      nx = contactNormal[0]/len; nz = contactNormal[2]/len;
    } else {
      const a = Math.random() * Math.PI * 2; nx = Math.cos(a); nz = Math.sin(a);
    }
    this.pendingBounce = { nx, nz, force };
    this.stunTimer     = stun;
    this.velocity      = [0, 0, 0];

    // FIX #2: Emit hurt action with severity-based response
    const hurtAction = severity > 80 ? 'hurt_shock'
      : severity > 50 ? 'hurt_heavy'
      : severity > 20 ? 'hurt_medium' : 'hurt_light';
    const hurtDuration = severity > 80 ? 5.0
      : severity > 50 ? 3.0 : severity > 20 ? 2.0 : 0.5;
    const hurtEmotion = severity > 20 ? 'crying' : 'scared';

    // Chain: hurt → crying → get_up
    const chain = [{ type: 'hurt', action: hurtAction, duration: hurtDuration, completed: false }];
    if (severity > 20) {
      chain.push({ type: 'crying', action: severity > 50 ? 'crying_sit' : 'crying_stand',
        duration: severity > 50 ? 3.0 : 1.5, completed: false });
    }
    chain.push({ type: 'recovery', action: severity > 50 ? 'get_up_slow' : 'get_up_fast',
      duration: severity > 50 ? 2.0 : 0.8, completed: false });

    // FIX: Save original behaviors before replacing with reaction chain
    // so pickNextBehavior can restore them after the chain completes.
    if (this.behaviorQueue.length && !this.behaviorQueue.every(b => ['hurt', 'crying', 'recovery'].includes(b.type))) {
      this._savedBehaviorQueue = [...this.behaviorQueue];
    }
    this.behaviorQueue = chain;
    this.currentBehavior = null;
    this.state = 'INTERACTING';
    this._setEmotion(hurtEmotion);
    this.recoveryTimer = hurtDuration + (severity > 20 ? 3.0 : 0.5);

    // v4: Record danger zone for learning system
    this._recordDangerZone(this.getPosition(), severity);
    this._logRiskEvent('collision', this.getPosition(), { severity, objectId: objectId });
    this._checkTantrumTrigger();
  }

  // ── Rare events ───────────────────────────────────────────────────────────
  executeRareEventStep(deltaTime, colliders, bounds) {
    if (!this.rareEventChain?.chain) return;
    const step = this.rareEventChain.chain[this.rareEventStep];
    if (!step) { this.participatingInRareEvent = false; return; }
    this.state = 'RARE_EVENT';
    if (step.action) this.executeAction(step, deltaTime, colliders, bounds);
    this.behaviorTimer += deltaTime;
    if (this.behaviorTimer >= (step.duration || 2.0)) {
      this.rareEventStep++;
      this.behaviorTimer = 0;
      if (this.rareEventStep >= this.rareEventChain.chain.length) this.participatingInRareEvent = false;
    }
  }

  // ── Surface friction helper (for climb validation) ───────────────────────
  _getObjectFriction(obj) {
    if (obj?.properties?.friction != null) return obj.properties.friction;
    const matName = (obj?.properties?.material?.name || obj?.name || obj?.id || '').toLowerCase();
    // FIX #15: Hanging/suspended objects — cannot support weight
    if (matName.includes('curtain') || matName.includes('drape') || matName.includes('blind')
        || matName.includes('rem') || matName.includes('ri_do') || matName.includes('man_cua')) return 0.10;
    if (matName.includes('glass') || matName.includes('mirror') || matName.includes('window')) return 0.15;
    if (matName.includes('metal') || matName.includes('steel') || matName.includes('chrome')) return 0.20;
    if (matName.includes('plastic') || matName.includes('laminate')) return 0.35;
    if (matName.includes('leather') || matName.includes('da')) return 0.45;
    if (matName.includes('wood') || matName.includes('go') || matName.includes('timber')) return 0.55;
    if (matName.includes('fabric') || matName.includes('cloth') || matName.includes('vai')) return 0.70;
    if (matName.includes('carpet') || matName.includes('rug') || matName.includes('tham')) return 0.75;
    if (matName.includes('mattress') || matName.includes('nem') || matName.includes('bed')) return 0.70;
    if (matName.includes('stone') || matName.includes('brick') || matName.includes('da')) return 0.65;
    return 0.50; // default — moderately climbable
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  v4 SUBSYSTEMS — Professional-Grade Child Behavior Simulation
  // ══════════════════════════════════════════════════════════════════════════

  // ── Reaction to Object (Priority 5: Affordance-based interaction) ──────────
  _reactToObject(visibleObj) {
    const ag = getAgeGroup(this.ageGroupId);
    const stats = this._getFatigueModifiedStats();
    const obj = visibleObj.object;
    
    // ── [Phase 4] CURIOSITY DRIVEN BEHAVIOR ENGINE ──────────────────────
    let exposure = this.objectExposureMap.get(obj.id) || 0;
    this.objectExposureMap.set(obj.id, exposure + 1);
    
    let currentCuriosity = this.curiosityLevel * Math.pow(0.8, exposure);
    let currentFear = this.fearLevel;
    
    const objName = (obj.name || obj.id || '').toLowerCase();
    const isLoud = objName.includes('vacuum') || objName.includes('blender');
    const isMoving = obj.rigidBody && Math.hypot(obj.rigidBody.linvel().x, obj.rigidBody.linvel().z) > 0.1;
    const isCaregiver = objName.includes('adult') || objName.includes('parent');
    const isHazard = objName.includes('knife') || objName.includes('fire') || objName.includes('stove');
    
    if (isLoud) currentFear *= 2.0;
    if (isCaregiver) currentFear *= 0.1;
    if (isHazard) currentFear *= 1.5; 
    if (isMoving) currentCuriosity *= 1.5;
    
    const strangerPenalty = 1.0 - this._applyStrangerFear(obj, 1.0);
    currentFear += strangerPenalty;
    
    // Avoidance routing
    if (currentFear > currentCuriosity * 1.2) {
      const curPos = this.getPosition();
      const dx = curPos[0] - (visionSystem._getObjCenter(obj)[0]);
      const dz = curPos[2] - (visionSystem._getObjCenter(obj)[2]);
      const dist = Math.hypot(dx, dz) || 1;
      this.targetPosition = [curPos[0] + (dx/dist)*3, curPos[1], curPos[2] + (dz/dist)*3];
      this.state = 'MOVING';
      this._setEmotion('scared');
      this.currentBehavior = null;
      return;
    }

    // ── [Priority 5] AFFORDANCE-BASED ACTION SELECTION ────────────────────
    // Read obj.affordances[] from scene metadata (populated by scene parser).
    // Fallback: infer affordances from object name + dimensions when metadata absent.
    const affordances = Array.isArray(obj.affordances) && obj.affordances.length > 0
      ? obj.affordances
      : this._inferAffordances(obj, objName, ag);

    const action = this._selectActionFromAffordances(affordances, obj, ag, stats);

    const willSucceed = Math.random() < stats.graspSuccess;
    if (willSucceed) {
      this.behaviorQueue = [{
        type: action,
        action: action,
        targetObjectId: obj.id,
        duration: this._getAffordanceDuration(action),
        completed: false,
      }];
      this._setEmotion(action === 'grab_mouth' ? 'mischievous' : 'curious');
    } else {
      const willDrop = Math.random() < stats.dropProb;
      this.behaviorQueue = [{ type: 'reach_fail', action: 'reach_up', duration: 1.5, completed: false }];
      if (willDrop) {
        this.behaviorQueue.push({ type: 'stumble', action: 'lose_balance', duration: 0.5, completed: false });
        this._setEmotion('frustrated');
        this._logRiskEvent('grasp_fail', this.getPosition(), { objectId: obj.id, severity: 2 });
        this._recordActionFail(obj.id, action);
      } else {
        this._setEmotion('curious');
      }
    }
    this.currentBehavior = null;
    this.state = 'IDLE';
  }

  /**
   * [Priority 5] Infer affordances from object name + dimensions when scene
   * metadata does not provide an explicit affordances[] array.
   */
  _inferAffordances(obj, nameLower, ag) {
    const affordances = [];
    const dims = obj.boundingBox ? [
      obj.boundingBox.max[0] - obj.boundingBox.min[0],
      obj.boundingBox.max[1] - obj.boundingBox.min[1],
      obj.boundingBox.max[2] - obj.boundingBox.min[2],
    ] : null;
    const maxDim = dims ? Math.max(...dims) : 1;
    const minDim = dims ? Math.min(...dims) : 1;

    // Graspable: small enough to hold in a child's hand (<4cm max dim)
    if (maxDim < 0.04) affordances.push('graspable');
    // Chokeable: tiny object the child might put in mouth
    if (maxDim < 0.04 && (this.ageGroupId === 'infant' || this.ageGroupId === 'early_toddler')) {
      affordances.push('chokeable');
    }
    // Climbable: right height range, non-slippery name
    if (dims && dims[1] > 0.20 && dims[1] < 1.2 && ag?.canClimb &&
        !/curtain|drape|blind|mirror|glass/.test(nameLower)) {
      affordances.push('climbable');
    }
    // Pullable: furniture with drawers or handles
    if (/drawer|cabinet|dresser|chest|wardrobe|tu|ke/.test(nameLower)) {
      affordances.push('pullable');
    }
    // Pushable: lightweight items
    if (/ball|toy|block|cube|box/.test(nameLower)) affordances.push('pushable');
    // Sharp / dangerous
    if (/knife|scissors|fork|pin|nail|razor|sharp/.test(nameLower)) affordances.push('sharp');
    if (/socket|outlet|plug|electric/.test(nameLower))               affordances.push('pokeable');
    // Fallback: everything else is investigable
    if (affordances.length === 0) affordances.push('investigable');
    return affordances;
  }

  /**
   * [Priority 5] Map affordances → concrete action, respecting age capability.
   */
  _selectActionFromAffordances(affordances, obj, ag, stats) {
    // Priority order: hazard first, then age-appropriate interaction
    if (affordances.includes('chokeable'))   return 'grab_mouth';
    if (affordances.includes('sharp'))       return 'investigate';   // approach then react
    if (affordances.includes('pokeable') && (this.ageGroupId === 'infant' || this.ageGroupId === 'early_toddler')) {
      return 'investigate';
    }
    if (affordances.includes('graspable'))   return 'grab';
    if (affordances.includes('climbable') && ag?.canClimb) return 'climb_on';
    if (affordances.includes('pullable'))    return 'pull';
    if (affordances.includes('pushable'))    return 'push';
    return 'walk_to';   // fallback: walk toward object
  }

  /** Duration in seconds for each affordance-driven action */
  _getAffordanceDuration(action) {
    const durations = {
      grab_mouth: 4.0,
      grab:       3.0,
      climb_on:   5.0,
      pull:       3.5,
      push:       2.5,
      investigate:5.0,
      walk_to:    4.0,
    };
    return durations[action] ?? 4.0;
  }  // ── [Priority 4] Hand Sensor Update ──────────────────────────────────────
  /**
   * Repositions the hand sensor bodies each frame to mirror the agent's current
   * position and heading. Called from update() before physicsEngine.step().
   * physicsEngine.updateHandSensorPositions() does the actual Rapier body move.
   */
  _updateHandSensors() {
    if (!this.handSensors || !this.body) return;
    const pos = this.body.translation();
    const ag  = getAgeGroup(this.ageGroupId);
    physicsEngine.updateHandSensorPositions(
      this.handSensors.left,
      this.handSensors.right,
      pos,
      this.currentHeading,
      ag?.height ?? 0.8,
      ag?.anthropometry ?? null
    );
  }

  /**
   * [Priority 4] Called by simulationController's drainIntersectionEvents loop
   * when a hand sensor collider intersects a scene object collider.
   * This replaces torso-collision-based interaction for reach/grab events.
   *
   * @param {string} hand        - 'left' or 'right'
   * @param {object} sceneObject - the collider metadata object (from handleToCollider)
   */
  handleHandSensorIntersection(hand, sceneObject) {
    if (!sceneObject || !sceneObject.id) return;
    if (this.state === 'FALLING' || this.stunTimer > 0) return;

    // Debounce: don't re-trigger same object within 5s
    const now = this.simTime;
    const lastTime = this._handInteractLog.get(sceneObject.id) || -Infinity;
    if (now - lastTime < 5.0) return;
    this._handInteractLog.set(sceneObject.id, now);

    // Ignore floors, walls, boundary objects
    if (sceneObject.type === 'floor' || sceneObject.type === 'wall' ||
        sceneObject.id === 'boundary_wall' || sceneObject.id === 'explicit_floor') return;

    // Don't interrupt a deliberate behavior (walk_to, climb_on, etc.)
    const busyActions = ['grab', 'grab_mouth', 'climb_on', 'pull', 'push', 'hurt', 'crying'];
    if (this.currentBehavior && busyActions.includes(this.currentBehavior.action)) return;

    // Use affordance system to select action
    const ag      = getAgeGroup(this.ageGroupId);
    const objName = (sceneObject.name || sceneObject.id || '').toLowerCase();
    const affordances = Array.isArray(sceneObject.affordances) && sceneObject.affordances.length > 0
      ? sceneObject.affordances
      : this._inferAffordances(sceneObject, objName, ag);

    const stats  = this._getFatigueModifiedStats();
    const action = this._selectActionFromAffordances(affordances, sceneObject, ag, stats);

    // Queue the affordance action (prepend to current queue so it runs immediately)
    const interactBehavior = {
      type:           action,
      action:         action,
      targetObjectId: sceneObject.id,
      duration:       this._getAffordanceDuration(action),
      completed:      false,
      _fromHandSensor: true,
    };

    // Save existing queue, prepend interaction
    if (this.behaviorQueue.length && !this._savedBehaviorQueue) {
      this._savedBehaviorQueue = [...this.behaviorQueue];
    }
    this.behaviorQueue = [interactBehavior, ...(this._savedBehaviorQueue || [])];
    this.currentBehavior = null;
    this.state = 'IDLE';

    this._logRiskEvent('hand_contact', this.getPosition(), {
      objectId: sceneObject.id,
      hand,
      action,
      affordances,
    });
  }

  // ── Fatigue-Modified Stats ────────────────────────────────────────────
  _getFatigueModifiedStats() {
    const ag = getAgeGroup(this.ageGroupId);
    const f = this.fatigueLevel;
    const coord = ag?.coordination || {};
    const kin = ag?.kinematics || {};
    return {
      reactionLatency: (coord.reactionLatency || 0.5) * (1 + f * 0.4),
      graspSuccess:    (coord.graspSuccessRate || 0.8) * (1 - f * 0.3),
      dropProb:        (coord.dropProbability || 0.1) * (1 + f * 0.5),
      turnRate:        (kin.turnRate || 2.0) * (1 - f * 0.2),
      fovH:            (ag?.vision?.fovHorizontal || 120) * (1 - f * 0.15),
    };
  }

  // ── Angle normalization helper ────────────────────────────────────────
  _normalizeAngle(angle) {
    while (angle > Math.PI)  angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  // ── Stranger/Large Object Fear ────────────────────────────────────────
  _applyStrangerFear(object, score) {
    const ag = getAgeGroup(this.ageGroupId);
    if (!ag?.fear) return score;
    const dims = object.boundingBox ? [
      object.boundingBox.max[0]-object.boundingBox.min[0],
      object.boundingBox.max[1]-object.boundingBox.min[1],
      object.boundingBox.max[2]-object.boundingBox.min[2],
    ] : null;
    if (!dims) return score;
    const objVol = dims[0] * dims[1] * dims[2];
    const childVol = (ag.height || 0.7) * 0.2 * 0.15;
    if (objVol > childVol * 8) {
      score *= (1 - ag.fear.strangerFear);
    }
    return score;
  }

  // ── Acoustic Startle Response ─────────────────────────────────────────
  handleStartleEvent(soundLevel, sourcePosition) {
    const ag = getAgeGroup(this.ageGroupId);
    const fear = ag?.fear;
    if (!fear) return;
    const intensity = soundLevel / 100;
    if (Math.random() > fear.startleSensitivity * intensity) return;
    this.stunTimer = fear.startleFreezeDuration;
    this.velocity = [0, 0, 0];
    if (this.ageGroupId === 'infant') {
      this._setEmotion('scared');
      this.behaviorQueue = [{ action: 'crying_stand', duration: 3.0, completed: false }];
    } else if (this.ageGroupId === 'toddler') {
      if (Math.random() < 0.5) {
        const pos = this.getPosition();
        const dx = pos[0] - sourcePosition[0];
        const dz = pos[2] - sourcePosition[2];
        const d = Math.hypot(dx, dz) || 1;
        this.targetPosition = [pos[0]+(dx/d)*2, pos[1], pos[2]+(dz/d)*2];
        this.state = 'MOVING';
        this._setEmotion('scared');
      } else {
        this._setEmotion('crying');
        this.behaviorQueue = [{ action: 'crying_stand', duration: 2.0, completed: false }];
      }
    } else {
      this._setEmotion('surprised');
    }
    this.currentBehavior = null;
    this._logRiskEvent('startle', sourcePosition, { soundLevel });
  }

  // ── Height Fear (Visual Cliff) ────────────────────────────────────────
  _checkHeightFear(perceivedHeight) {
    const ag = getAgeGroup(this.ageGroupId);
    const fear = ag?.fear;
    if (!fear || perceivedHeight < fear.heightFearThreshold) return false;
    switch (fear.heightFearResponse) {
      case 'cry':
        this._setEmotion('scared');
        this.behaviorQueue = [{ action: 'crying_stand', duration: 2.0, completed: false }];
        this.currentBehavior = null;
        return true;
      case 'hesitate':
        this.stunTimer = 1.0;
        this._setEmotion('scared');
        return Math.random() < 0.5;
      case 'cautious':
        return Math.random() < 0.2;
      default:
        return false;
    }
  }

  // ── Object Permanence (Piaget) ────────────────────────────────────────
  _checkObjectPermanence(objectId) {
    const ag = getAgeGroup(this.ageGroupId);
    const cog = ag?.cognition;
    const mem = this.objectMemory.get(objectId);
    if (!mem) return { shouldContinue: false };
    const elapsed = Date.now()/1000 - mem.lastSeenTime;
    if (Math.random() > (cog?.objectPermanence || 1)) {
      this.objectMemory.delete(objectId);
      return { shouldContinue: false };
    }
    if (elapsed > (cog?.hiddenObjectMemory || 30)) {
      this.objectMemory.delete(objectId);
      return { shouldContinue: false, reason: 'memory_expired' };
    }
    return { shouldContinue: true, lastKnownPos: mem.lastSeenPos,
      confidence: Math.max(0, 1 - elapsed / (cog?.hiddenObjectMemory || 30)) };
  }

  // ── Danger Zone Memory (Learning) ─────────────────────────────────────
  _recordDangerZone(position, severity) {
    const ag = getAgeGroup(this.ageGroupId);
    // [v5/Bug3] Giảm memDuration 30s→8s: agent "quên sợ" nhanh hơn → dám quay lại khám phá
    const memDuration = ag?.cognition?.dangerMemoryDuration || 8;
    const maxZones = ag?.cognition?.maxDangerZones || 4;
    const key = `${Math.round(position[0]*2)}_${Math.round(position[2]*2)}`;
    this.dangerMap.set(key, { pos: [...position], severity, expiresAt: Date.now()/1000 + memDuration });
    if (this.dangerMap.size > maxZones) {
      const oldest = [...this.dangerMap.entries()].sort((a,b) => a[1].expiresAt - b[1].expiresAt)[0];
      this.dangerMap.delete(oldest[0]);
    }
  }

  _isNearDangerZone(targetPos) {
    const now = Date.now()/1000;
    for (const [key, zone] of this.dangerMap) {
      if (now > zone.expiresAt) { this.dangerMap.delete(key); continue; }
      const d = Math.hypot(targetPos[0]-zone.pos[0], targetPos[2]-zone.pos[2]);
      // [v5/Bug3] Giảm radius 0.8m→0.35m: 4 zones × π×0.35² ≈ 1.5m² thay vì 8m²
      if (d < 0.35) return { dangerous: true, zone };
    }
    return { dangerous: false };
  }

  // ── Trial-and-Error Strategy Change ───────────────────────────────────
  _recordActionFail(objectId, action) {
    const key = `${objectId}_${action}`;
    const entry = this.actionFailLog.get(key) || { count: 0 };
    entry.count++;
    this.actionFailLog.set(key, entry);
    const ag = getAgeGroup(this.ageGroupId);
    const threshold = ag?.cognition?.failBeforeStrategyChange || Infinity;
    if (entry.count >= threshold && threshold < Infinity) {
      this.actionFailLog.delete(key);
      return this._generateAlternativeStrategy(objectId, action, ag);
    }
    return null;
  }

  _generateAlternativeStrategy(objectId, failedAction, ag) {
    const strategyType = ag?.cognition?.strategyChangeType || 'random_alt';
    switch (strategyType) {
      case 'random_alt':
        return { type: 'redirect', action: 'walk_random', duration: 3.0 };
      case 'use_tool': {
        const tools = this.availableObjects.filter(obj => {
          const h = obj.boundingBox ? obj.boundingBox.max[1] - obj.boundingBox.min[1] : 0;
          return h > 0.2 && h < 0.6;
        });
        if (tools.length) {
          return { type: 'tool_use', sequence: [
            { action: 'walk_to', targetObjectId: tools[0].id, duration: 2.0, completed: false },
            { action: 'push', duration: 2.0, completed: false },
            { action: 'climb_on', duration: 2.0, completed: false },
          ]};
        }
        return { type: 'redirect', action: 'walk_random', duration: 3.0 };
      }
      case 'plan':
        return { type: 'redirect', action: 'look_around', duration: 2.0 };
      default:
        return null;
    }
  }

  // ── Tantrum Trigger ───────────────────────────────────────────────────
  _checkTantrumTrigger() {
    this.frustrationCount++;
    if (this.frustrationCount >= 3 && this.fatigueLevel > 0.6) {
      this.frustrationCount = 0;
      this._setEmotion('frustrated');
      this.behaviorQueue = [
        { action: 'crying_sit', duration: 3.0, completed: false },
        { action: 'get_up_slow', duration: 2.0, completed: false },
      ];
      this.currentBehavior = null;
      this.state = 'INTERACTING';
      const pos = this.getPosition();
      const fallDir = Math.random() * Math.PI * 2;
      this.pendingBounce = { nx: Math.cos(fallDir), nz: Math.sin(fallDir), force: 0.1 };
      this._logRiskEvent('tantrum', pos, { fatigue: this.fatigueLevel, severity: 3 });
      return true;
    }
    return false;
  }

  // ── Risk Analytics Logger ─────────────────────────────────────────────
  _logRiskEvent(type, position, details = {}) {
    riskAnalytics.recordEvent(type, position, {
      agentId: this.id, ageGroup: this.ageGroupId, ...details
    });
  }

  // ── [v5] Helpers ──────────────────────────────────────────────────────────

  /**
   * Chọn điểm đích ngẫu nhiên — ưu tiên vùng chưa khám phá.
   * Fixes: Bug1 (floor filter), Bug5 (_knownFloorY)
   */
  setRandomTarget(bounds) {
    if (!bounds) return;

    if (this.targetPosition && this.simTime < this.targetLockTimer) {
      return; 
    }

    const floorY = this._knownFloorY ?? bounds.min[1];
    const prof   = this._ageProfile;
    const validCheckFn = (x, z) => !this._isInsideSolidObstacle(x, z, bounds);

    // Khi boredom cao → ưu tiên chạy đến vùng xa nhất chưa khám phá
    if (this.boredomLevel > 0.6 && this._boundsInited) {
      const pos = this.getPosition();
      const explorationPt = this.explorationMap.getLeastVisitedCenter(pos, 1.5, validCheckFn);
      if (explorationPt) {
        this.targetPosition = [explorationPt[0], floorY, explorationPt[1]];
        this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
        this.boredomLevel = Math.max(0, this.boredomLevel - 0.3);
        return;
      }
    }

    // 30% cơ hội: dùng exploration map để chọn ô ít được thăm (ngay cả khi chưa chán)
    if (this._boundsInited && Math.random() < 0.3) {
      const pos = this.getPosition();
      // explorationBias < 1 → trẻ nhỏ ít dám đi xa (ở gần spawn)
      const minD = (prof.explorationBias || 0.5) * 1.5;
      const pt = this.explorationMap.getLeastVisitedCenter(pos, minD, validCheckFn);
      if (pt) {
        this.targetPosition = [pt[0], floorY, pt[1]];
        this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
        return;
      }
    }

    // Standard random với filter obstacle
    const solidObstacles = this._buildSolidObstacles(bounds);
    // [FIX bbox-E] Pad must be >= avoidRadius (0.35m).
    // Old pads [0.20, 0.10, 0.0]: target placed 0.20m outside furniture, but
    // avoidance force starts at 0.35m → agent entered force field every step,
    // causing continuous steering deflections and target misses.
    const pads = [0.45, 0.30, 0.15];
    for (const pad of pads) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const x = bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]);
        const z = bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2]);
        let blocked = false;
        for (const obs of solidObstacles) {
          const bb = obs.boundingBox;
          if (x > bb.min[0] - pad && x < bb.max[0] + pad &&
              z > bb.min[2] - pad && z < bb.max[2] + pad) {
            blocked = true; break;
          }
        }
        if (!blocked) {
          this.targetPosition = [x, floorY, z];
          this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
          return;
        }
      }
    }
    // Last resort
    this.targetPosition = [
      bounds.min[0] + Math.random() * (bounds.max[0] - bounds.min[0]),
      floorY,
      bounds.min[2] + Math.random() * (bounds.max[2] - bounds.min[2]),
    ];
    this.targetLockTimer = this.simTime + 2.0 + Math.random() * 2.0;
  }

  /** Build danh sách obstacle thực sự (không phải floor/tường/vật treo) */
  _buildSolidObstacles(bounds) {
    const roomW = bounds ? Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) : 10;
    const floorY = this._knownFloorY ?? (bounds?.min[1] ?? 0);
    return (this.availableObjects || []).filter(obj => {
      if (!obj.boundingBox) return false;
      const { min, max } = obj.boundingBox;
      const objH = max[1] - min[1];
      const objW = Math.max(max[0] - min[0], max[2] - min[2]);
      if (objW > roomW * 0.75) return false;
      if (objH < 0.20) return false;
      if (min[1] > floorY + 0.5) return false;
      return true;
    });
  }

  _isInsideSolidObstacle(x, z, bounds) {
    for (const obs of this._buildSolidObstacles(bounds)) {
      const bb = obs.boundingBox;
      if (x > bb.min[0] - 0.15 && x < bb.max[0] + 0.15 &&
          z > bb.min[2] - 0.15 && z < bb.max[2] + 0.15) return true;
    }
    return false;
  }

  /**
   * [v5] Cập nhật boredom level.
   * Tăng khi đứng yên, giảm khi di chuyển đến chỗ mới.
   */
  _updateBoredom(deltaTime, curPos) {
    const prof = this._ageProfile;
    const boredomRate = prof.boredomRate || 0.03;
    const movedDist = Math.hypot(
      curPos[0] - (this.previousPosition[0] ?? curPos[0]),
      curPos[2] - (this.previousPosition[2] ?? curPos[2])
    );
    if (movedDist < 0.02) {
      // Đứng yên → chán nhanh hơn
      this.boredomLevel = Math.min(1.0, this.boredomLevel + boredomRate * deltaTime * 2);
    } else {
      // Di chuyển → đỡ chán
      this.boredomLevel = Math.max(0, this.boredomLevel - boredomRate * deltaTime * 0.5);
    }

    // Kiểm tra burst chạy bùng phát (theo profile tuổi)
    if (!this.burstState && this.state === 'MOVING') {
      const burstP = (prof.burstProb || 0) * deltaTime;
      if (Math.random() < burstP) {
        const dur = prof.burstDuration
          ? prof.burstDuration[0] + Math.random() * (prof.burstDuration[1] - prof.burstDuration[0])
          : 1.5;
        this.burstState = {
          endTime:   this.simTime + dur,
          speedMult: prof.burstSpeedMult || 1.5,
        };
      }
    }
    if (this.burstState && this.simTime >= this.burstState.endTime) {
      this.burstState = null;
    }

    // Kiểm tra đổi hướng đột ngột (trẻ nhỏ hay làm vậy)
    const dirChangeP = (prof.dirChangeProb || 0) * deltaTime;
    if (this.state === 'MOVING' && this.targetPosition && Math.random() < dirChangeP) {
      if (this.simTime > this.targetLockTimer) {
        this.targetPosition = null; // buộc chọn target mới frame sau
      }
    }

    // Kiểm tra dừng lại nhìn xung quanh (theo pauseInterval)
    if (this.simTime > this.pauseUntil && this.state === 'MOVING') {
      const [pMin, pMax] = prof.pauseInterval || [5, 10];
      // Xác suất mỗi frame
      const pauseCheckP = deltaTime / (pMin + Math.random() * (pMax - pMin));
      if (Math.random() < pauseCheckP) {
        const [dMin, dMax] = prof.pauseDuration || [0.5, 1.5];
        this.pauseUntil = this.simTime + dMin + Math.random() * (dMax - dMin);
        this._setEmotion('curious');
      }
    }
  }

  loadBehaviorPolicy(behaviors) {
    this.behaviorQueue = behaviors.map(b => ({
      ...b, completed: false,
      sequence: b.sequence ? b.sequence.map(a => ({ ...a, completed: false })) : [],
    }));
  }

  startRareEventChain(chain) {
    this.participatingInRareEvent = true;
    this.rareEventChain           = chain;
    this.rareEventStep            = 0;
    this.behaviorTimer            = 0;
  }

  getPosition() {
    if (!this.body) return this.previousPosition || [0, 0, 0];
    const t = this.body.translation();
    if (isNaN(t.x) || isNaN(t.y) || isNaN(t.z)) {
      return this.previousPosition || [0, 0, 0];
    }
    return [t.x, t.y, t.z];
  }

  getVelocity() {
    const [vx, vy, vz] = this.velocity;
    return Math.sqrt(vx*vx + vy*vy + vz*vz);
  }

  getStatus() {
    return {
      id: this.id, ageGroupId: this.ageGroupId, state: this.state,
      position: this.getPosition(), velocity: this.getVelocity(),
      totalDistance: this.totalDistance, fatigue: this.fatigueLevel,
      gaitStability: this.gaitStability,
      behaviorsCompleted: this.behaviorQueue?.filter(b => b.completed).length ?? 0,
    };
  }

  getAgeGroupData() { return getAgeGroup(this.ageGroupId) || { speed: 0.8 }; }

  getSampledTrajectory(maxPts = 30) {
    if (this.trajectory.length <= maxPts) return [...this.trajectory];
    const step = Math.floor(this.trajectory.length / maxPts);
    const out  = [];
    for (let i = 0; i < this.trajectory.length; i += step) {
      out.push([...this.trajectory[i]]);
      if (out.length >= maxPts) break;
    }
    return out;
  }

  cleanup() {
    // Cleanup character controller to avoid memory leak
    if (this.controller && this.world) {
      try { this.world.removeCharacterController(this.controller); } catch (_) {}
    }
    // [P4] Cleanup hand sensor rigid bodies
    if (this.handSensors && this.world) {
      try { this.world.removeRigidBody(this.handSensors.left.body);  } catch (_) {}
      try { this.world.removeRigidBody(this.handSensors.right.body); } catch (_) {}
    }
    this.controller    = null;
    this.handSensors   = null;
    this.trajectory    = [];
    this.behaviorQueue = [];
    this.availableObjects = [];
    // [v5] Reset exploration state
    this.explorationMap.cells.clear();
    this._boundsInited = false;
    this.burstState    = null;
    this.circleState   = null;
    // Reset speed cache
    this._cachedSpeed  = null;
  }
}

export default Agent;