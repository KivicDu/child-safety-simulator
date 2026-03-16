/**
 * ============================================================================
 * TOPPLE PREDICTOR — Physics-Based Object Tip-Over Prediction
 * ============================================================================
 *
 * Mục đích: Dự đoán kết quả khi trẻ tác động lực lên vật thể cố định.
 * Vì vật thể trong scene không thể di chuyển thực sự (static trimesh),
 * module này tính toán xem vật thể CÓ THỂ bị đổ hay không dựa trên:
 *   - Khối lượng ước tính từ kích thước + vật liệu
 *   - Chiều cao trọng tâm vs diện tích đế (tipping moment)
 *   - Lực trẻ có thể tạo ra (từ torque model trong agent)
 *   - Vùng va chạm khi vật thể đổ
 *   - Chấn thương từ vật thể đổ lên trẻ
 *
 * NGUỒN:
 *   - Tip-over mechanics: Turner & Bhatt (2008) "Child Safety in the Home"
 *   - Furniture mass estimates: IKEA/BIFMA product data averaged
 *   - Pediatric crush injury: Sugar NF et al. (1988) Pediatrics 81:643
 *   - TV tip-over injury: Smith GA et al. (2002) Pediatrics 110(3):e30
 */

// ─── VẬT LIỆU → KHỐI LƯỢNG RIÊNG (kg/m³) ─────────────────────────────────
const MATERIAL_DENSITY = {
  wood:      600,   // gỗ thông trung bình
  hardwood:  750,   // gỗ cứng (sồi, teak)
  mdf:       700,   // ván ép MDF (nội thất rẻ)
  metal:     2700,  // nhôm (đồ nội thất kim loại)
  steel:     7800,  // thép
  glass:     2500,  // kính
  plastic:   1000,  // nhựa cứng
  fabric:    200,   // vải (gối, rèm) — rất nhẹ
  foam:      80,    // xốp
  ceramic:   2300,  // gốm sứ
  stone:     2600,  // đá
  unknown:   400,   // giả định nội thất rỗng (tủ, giá)
};

// ─── TỪ KHÓA TÊN → VẬT LIỆU ──────────────────────────────────────────────
const NAME_TO_MATERIAL = [
  { pattern: /tv|television|monitor|screen|tivi/i,        material: 'glass',   hollow: 0.3 },
  { pattern: /shelf|bookcase|wardrobe|cabinet|tu|ke/i,    material: 'mdf',     hollow: 0.15 },
  { pattern: /table|desk|ban/i,                           material: 'wood',    hollow: 0.2  },
  { pattern: /chair|stool|ghe/i,                          material: 'wood',    hollow: 0.25 },
  { pattern: /bed|giuong/i,                               material: 'wood',    hollow: 0.1  },
  { pattern: /lamp|den/i,                                 material: 'metal',   hollow: 0.7  },
  { pattern: /vase|binh|pot/i,                            material: 'ceramic', hollow: 0.4  },
  { pattern: /mirror|guong/i,                             material: 'glass',   hollow: 0.1  },
  { pattern: /sofa|couch|ghe_sofa/i,                      material: 'fabric',  hollow: 0.4  },
  { pattern: /basket|storage|hop/i,                       material: 'plastic', hollow: 0.3  },
];

// ─── TIÊU CHUẨN NGUY HIỂM KHI ĐỔ ─────────────────────────────────────────
// Nguồn: CPSC furniture tip-over data, Smith GA 2002 Pediatrics
const TOPPLE_DANGER_THRESHOLDS = {
  mass_light:    5,    // kg — đồ nhẹ, nguy hiểm thấp
  mass_moderate: 20,   // kg — nguy hiểm trung bình
  mass_heavy:    40,   // kg — nguy hiểm cao (TV, tủ lớn)
  height_low:    0.6,  // m — đồ thấp, ngã không xa
  height_med:    1.0,  // m — nguy hiểm trung bình  
  height_high:   1.5,  // m — nguy hiểm cao (tủ đứng)
};

class TopplePredictor {

  // ─── TÍNH KHỐI LƯỢNG ƯỚC TÍNH ─────────────────────────────────────────
  estimateMass(obj) {
    const bb = obj.boundingBox;
    if (!bb) return 10; // fallback

    const w = bb.max[0] - bb.min[0];
    const h = bb.max[1] - bb.min[1];
    const d = bb.max[2] - bb.min[2];
    const volume = w * h * d; // m³

    const name = (obj.name || obj.id || '').toLowerCase();

    // Tìm vật liệu từ tên
    let density = MATERIAL_DENSITY.unknown;
    let hollowFactor = 0.2; // 20% solid mặc định (đồ nội thất rỗng ruột)

    for (const entry of NAME_TO_MATERIAL) {
      if (entry.pattern.test(name)) {
        density = MATERIAL_DENSITY[entry.material] || MATERIAL_DENSITY.unknown;
        hollowFactor = entry.hollow;
        break;
      }
    }

    // mass = volume × density × fillFactor
    const mass = volume * density * hollowFactor;

    // Clamp về khoảng hợp lý: 0.5kg (đèn nhỏ) đến 200kg (tủ lớn)
    return Math.max(0.5, Math.min(200, mass));
  }

  // ─── TÍNH CHIỀU CAO TRỌNG TÂM ─────────────────────────────────────────
  estimateCenterOfMass(obj) {
    const bb = obj.boundingBox;
    if (!bb) return { y: 0.5 };

    const h = bb.max[1] - bb.min[1];
    const name = (obj.name || obj.id || '').toLowerCase();

    // TV: COM cao vì màn hình nặng ở phía trên
    if (/tv|television|monitor|tivi/.test(name)) {
      return {
        x: (bb.min[0] + bb.max[0]) / 2,
        y: bb.min[1] + h * 0.65,  // 65% chiều cao
        z: (bb.min[2] + bb.max[2]) / 2,
      };
    }
    // Tủ/kệ sách: COM ở giữa
    if (/shelf|bookcase|wardrobe|cabinet/.test(name)) {
      return {
        x: (bb.min[0] + bb.max[0]) / 2,
        y: bb.min[1] + h * 0.55,
        z: (bb.min[2] + bb.max[2]) / 2,
      };
    }
    // Mặc định: 50% chiều cao
    return {
      x: (bb.min[0] + bb.max[0]) / 2,
      y: bb.min[1] + h * 0.50,
      z: (bb.min[2] + bb.max[2]) / 2,
    };
  }

  // ─── KIỂM TRA CÓ THỂ ĐỔ KHÔNG ────────────────────────────────────────
  /**
   * @param {object} obj - scene object
   * @param {number} appliedForceN - lực tác động (Newton)
   * @param {string} forceDirection - 'push_horizontal' | 'pull' | 'climb_side'
   * @param {number} forceHeightM - chiều cao điểm tác lực (m từ sàn)
   * @returns {{ canTopple, tippingMoment, resistingMoment, ratio, reason }}
   */
  checkTopplePossibility(obj, appliedForceN, forceDirection, forceHeightM) {
    const bb = obj.boundingBox;
    if (!bb) return { canTopple: false, reason: 'no_bbox' };

    const w = bb.max[0] - bb.min[0];
    const h = bb.max[1] - bb.min[1];
    const d = bb.max[2] - bb.min[2];
    const footprintMin = Math.min(w, d); // cạnh nhỏ nhất của đế

    const mass = this.estimateMass(obj);
    const com  = this.estimateCenterOfMass(obj);
    const comHeight = com.y - bb.min[1]; // chiều cao COM so với đế

    // Moment chống lật: trọng lực × nửa chiều rộng đế
    // τ_resist = m × g × (footprint/2)
    const resistingMoment = mass * 9.81 * (footprintMin / 2);

    // Moment lật: lực tác động × chiều cao điểm tác lực
    // τ_tip = F × h_force
    const effectiveForceHeight = Math.min(forceHeightM, h); // không vượt quá chiều cao vật
    const tippingMoment = appliedForceN * effectiveForceHeight;

    const ratio = tippingMoment / (resistingMoment + 0.001);

    // Thêm yếu tố hình dạng: vật cao và hẹp dễ đổ hơn
    const aspectRatio = h / (footprintMin + 0.001);
    const stabilityFactor = Math.max(0.5, 1.0 - (aspectRatio - 1.0) * 0.15);

    const canTopple = (ratio * stabilityFactor) >= 1.0;

    return {
      canTopple,
      mass,
      comHeight,
      tippingMoment: Math.round(tippingMoment * 10) / 10,
      resistingMoment: Math.round(resistingMoment * 10) / 10,
      ratio: Math.round(ratio * 100) / 100,
      aspectRatio: Math.round(aspectRatio * 10) / 10,
      reason: canTopple
        ? `Tipping moment (${tippingMoment.toFixed(1)} Nm) > Resisting moment (${resistingMoment.toFixed(1)} Nm)`
        : `Object too stable (ratio=${ratio.toFixed(2)}, needs ≥1.0)`,
    };
  }

  // ─── DỰ ĐOÁN VÙNG ĐỔ ─────────────────────────────────────────────────
  /**
   * Tính vùng nguy hiểm khi vật thể đổ.
   * Vật thể đổ về phía lực tác động → vùng nguy hiểm là arc trước mặt.
   * @returns {{ dangerZone: {x, z, radius}, impactVelocity, fallHeight }}
   */
  predictFallZone(obj, pushDirection) {
    const bb = obj.boundingBox;
    if (!bb) return null;

    const cx = (bb.min[0] + bb.max[0]) / 2;
    const cz = (bb.min[2] + bb.max[2]) / 2;
    const h  = bb.max[1] - bb.min[1];

    // Vật đổ tạo thành cung tròn bán kính = chiều cao
    // Tâm = điểm pivot (cạnh đế về phía lực tác động)
    const pivotX = cx + (pushDirection?.x || 0) * Math.min((bb.max[0]-bb.min[0])/2, (bb.max[2]-bb.min[2])/2);
    const pivotZ = cz + (pushDirection?.z || 0) * Math.min((bb.max[0]-bb.min[0])/2, (bb.max[2]-bb.min[2])/2);

    // Vận tốc khi chạm đất: v = sqrt(2 * g * COM_height)
    const comHeight = h * 0.5; // giả định COM ở giữa
    const impactVelocity = Math.sqrt(2 * 9.81 * comHeight);

    return {
      dangerZone: {
        centerX: pivotX + (pushDirection?.x || 0) * h * 0.5,
        centerZ: pivotZ + (pushDirection?.z || 0) * h * 0.5,
        radius: h * 0.8,  // 80% chiều cao là bán kính nguy hiểm
      },
      impactVelocity: Math.round(impactVelocity * 10) / 10,
      fallHeight: Math.round(comHeight * 10) / 10,
      sweepAngleDeg: 90,  // vật thể quét 90° khi đổ
    };
  }

  // ─── TÍNH CHẤN THƯƠNG TỪ VẬT ĐỔ LÊN TRẺ ─────────────────────────────
  /**
   * Vật nặng đổ lên trẻ → crush injury.
   * Nguồn: Sugar NF et al. Pediatrics 1988; Smith GA Pediatrics 2002
   * @param {number} objectMassKg
   * @param {number} fallHeightM - chiều cao COM khi bắt đầu đổ
   * @param {string} ageGroupId
   * @param {string} bodyPart - phần cơ thể bị đè
   * @returns {{ injuryScore, gForce, riskTier, description }}
   */
  calculateCrushInjury(objectMassKg, fallHeightM, ageGroupId, bodyPart = 'head') {
    // Năng lượng khi chạm: E = m × g × h
    const kineticEnergy = objectMassKg * 9.81 * fallHeightM;

    // Thời gian dừng (collision duration) phụ thuộc vật liệu cứng/mềm
    const collisionDuration = 0.05; // 50ms cho đồ gỗ điển hình

    // Lực va chạm: F = sqrt(2 × m × E) / t = m × v / t
    const impactVelocity = Math.sqrt(2 * 9.81 * fallHeightM);
    const forceN = (objectMassKg * impactVelocity) / collisionDuration;

    // Mass của trẻ theo age group
    const childMassMap = {
      infant: 8, early_toddler: 12, late_toddler: 15,
      preschool: 18, child: 25,
    };
    const childMass = childMassMap[ageGroupId] || 12;

    // G-force = F / (m_child × g)
    const gForce = forceN / (childMass * 9.81);

    // Injury score dựa trên mass × height (crush severity)
    // TV đổ (25kg từ 1m) → cao → crush nguy hiểm cho trẻ nhỏ
    let injuryScore = Math.min(100, (objectMassKg * fallHeightM) * 2);

    // Nhân theo body part: đầu nguy hiểm nhất
    const bodyPartMultiplier = { head: 1.5, torso: 1.2, legs: 0.8, arm: 0.9 };
    injuryScore *= (bodyPartMultiplier[bodyPart] || 1.0);

    // Nhân theo tuổi: trẻ nhỏ dễ bị thương hơn
    const ageMultiplier = { infant: 1.5, early_toddler: 1.3, late_toddler: 1.1, preschool: 1.0, child: 0.9 };
    injuryScore *= (ageMultiplier[ageGroupId] || 1.0);
    injuryScore = Math.min(100, Math.round(injuryScore));

    // Risk tier
    let riskTier = 'safe';
    if (injuryScore >= 70) riskTier = 'critical';
    else if (injuryScore >= 45) riskTier = 'severe';
    else if (injuryScore >= 25) riskTier = 'moderate';
    else if (injuryScore >= 10) riskTier = 'minor';

    // Description theo loại đồ vật
    const descriptions = {
      critical: `Vật nặng (${objectMassKg.toFixed(0)}kg) đổ từ cao ${fallHeightM.toFixed(1)}m — NGUY HIỂM TÍNH MẠNG. Crush injury nghiêm trọng.`,
      severe:   `Vật (${objectMassKg.toFixed(0)}kg) đổ — chấn thương nặng, khả năng gãy xương cao.`,
      moderate: `Vật (${objectMassKg.toFixed(0)}kg) đổ — bầm tím, có thể gãy xương nhẹ.`,
      minor:    `Vật nhẹ (${objectMassKg.toFixed(0)}kg) đổ — trầy xước, bầm nhẹ.`,
      safe:     `Vật rất nhẹ — nguy cơ thấp.`,
    };

    return {
      injuryScore,
      gForce: Math.round(gForce),
      riskTier,
      forceN: Math.round(forceN),
      description: descriptions[riskTier],
      mechanismOfInjury: 'crush_by_falling_object',
    };
  }

  // ─── API CHÍNH: Đánh giá toàn diện một sự kiện push/pull ───────────────
  /**
   * Gọi khi agent thực hiện action 'push' hoặc 'pull' lên một object.
   * @param {object} agent - agent instance
   * @param {object} targetObj - scene object
   * @param {string} actionType - 'push' | 'pull' | 'climb_side' | 'pull_to_stand'
   * @param {object} ageGroupData - từ getAgeGroup()
   * @returns {ToppleEvent | null}
   */
  evaluate(agent, targetObj, actionType, ageGroupData) {
    if (!targetObj?.boundingBox) return null;

    const bb = targetObj.boundingBox;
    const name = (targetObj.name || targetObj.id || '').toLowerCase();

    // Skip objects không thể đổ (tường, sàn, trần, gắn tường)
    const isWallMounted = /wall|curtain|picture|mirror_wall|clock_wall|shelf_wall|switch|socket/.test(name);
    if (isWallMounted) return null;

    const objH = bb.max[1] - bb.min[1];
    const objW = bb.max[0] - bb.min[0];
    const objD = bb.max[2] - bb.min[2];

    // Skip đồ quá thấp (<20cm) hoặc quá rộng (nặng cố định như giường lớn, sofa)
    if (objH < 0.20) return null;
    const footprint = objW * objD;
    if (footprint > 4.0 && objH < 0.8) return null; // sofa, giường lớn — không đổ

    // Lực trẻ tạo ra
    const mass = ageGroupData?.mass || 12;
    const maxTorque = ageGroupData?.physics?.maxJointTorqueNm || 15;
    const armLength = ageGroupData?.anthropometry?.armLength || 0.25;
    const maxForceN = maxTorque / armLength; // F = τ / r

    // Chiều cao điểm tác lực: khoảng 2/3 tầm với của trẻ
    const reachHeight = ageGroupData?.reachHeight || 0.6;
    const forceHeightM = bb.min[1] + Math.min(reachHeight * 0.8, objH * 0.7);

    // Hướng lực
    const agPos = agent.getPosition();
    const objCX = (bb.min[0] + bb.max[0]) / 2;
    const objCZ = (bb.min[2] + bb.max[2]) / 2;
    const dirX = objCX - agPos[0];
    const dirZ = objCZ - agPos[2];
    const dirLen = Math.hypot(dirX, dirZ) || 1;
    const pushDir = { x: dirX / dirLen, z: dirZ / dirLen };

    // Kiểm tra topple
    const toppleCheck = this.checkTopplePossibility(
      targetObj, maxForceN, actionType, forceHeightM
    );

    if (!toppleCheck.canTopple) {
      // Vật không đổ — chỉ ghi nhận tác động nhỏ
      return {
        canTopple: false,
        objectId: targetObj.id,
        objectName: targetObj.name || targetObj.id,
        objectMass: Math.round(toppleCheck.mass),
        reason: toppleCheck.reason,
        agentInjury: null,
        recommendation: null,
      };
    }

    // Vật có thể đổ — tính toán hậu quả
    const fallZone = this.predictFallZone(targetObj, pushDir);
    const objectMass = toppleCheck.mass;

    // Xác định body part bị đổ lên (dựa vào chiều cao object vs chiều cao agent)
    const agentHeight = ageGroupData?.height || 0.8;
    const objTopRelativeToAgent = bb.max[1] - bb.min[1]; // chiều cao vật
    let affectedBodyPart = 'head';
    if (objTopRelativeToAgent < agentHeight * 0.4) affectedBodyPart = 'legs';
    else if (objTopRelativeToAgent < agentHeight * 0.7) affectedBodyPart = 'torso';
    else if (objTopRelativeToAgent < agentHeight * 0.9) affectedBodyPart = 'shoulder';

    const crushInjury = this.calculateCrushInjury(
      objectMass,
      fallZone?.fallHeight || objH * 0.5,
      agent.ageGroupId,
      affectedBodyPart
    );

    // Phân loại nguy hiểm của vật thể
    let objectDangerLevel = 'low';
    if (objectMass > TOPPLE_DANGER_THRESHOLDS.mass_heavy || objH > TOPPLE_DANGER_THRESHOLDS.height_high) {
      objectDangerLevel = 'critical';
    } else if (objectMass > TOPPLE_DANGER_THRESHOLDS.mass_moderate || objH > TOPPLE_DANGER_THRESHOLDS.height_med) {
      objectDangerLevel = 'high';
    } else if (objectMass > TOPPLE_DANGER_THRESHOLDS.mass_light || objH > TOPPLE_DANGER_THRESHOLDS.height_low) {
      objectDangerLevel = 'moderate';
    }

    // Recommendation cụ thể
    const recommendations = this._buildRecommendations(name, objectMass, objH, objectDangerLevel);

    return {
      canTopple: true,
      objectId: targetObj.id,
      objectName: targetObj.name || targetObj.id,
      objectMass: Math.round(objectMass),
      objectHeight: Math.round(objH * 100) / 100,
      objectDangerLevel,
      tippingMoment: toppleCheck.tippingMoment,
      resistingMoment: toppleCheck.resistingMoment,
      toppleRatio: toppleCheck.ratio,
      fallZone,
      agentInjury: {
        ...crushInjury,
        bodyPart: affectedBodyPart,
        ageGroupId: agent.ageGroupId,
      },
      recommendations,
      // Dùng để push vào collisionEvents
      asCollisionEvent: {
        type: 'topple_prediction',
        objectId: targetObj.id,
        objectName: targetObj.name || targetObj.id,
        position: [
          fallZone?.dangerZone?.centerX || objCX,
          bb.min[1],
          fallZone?.dangerZone?.centerZ || objCZ,
        ],
        injury: crushInjury,
        isFalling: false,
        isPrediction: true,  // đánh dấu đây là dự đoán, không phải va chạm thực
        objectMass: Math.round(objectMass),
        objectHeight: Math.round(objH * 100) / 100,
        dangerZoneRadius: fallZone?.dangerZone?.radius || 1.0,
      },
    };
  }

  _buildRecommendations(name, mass, height, dangerLevel) {
    const recs = [];

    if (/tv|television|tivi/.test(name)) {
      recs.push({
        type: 'anchor',
        priority: 'critical',
        action: 'Gắn TV vào tường bằng bracket chống đổ. TV là nguyên nhân #1 gây tử vong do đồ vật đổ ở trẻ em.',
        standard: 'CPSC TV Tip-Over Prevention Guidelines',
      });
    }

    if (/shelf|bookcase|wardrobe|cabinet|tu/.test(name)) {
      recs.push({
        type: 'anchor',
        priority: dangerLevel === 'critical' ? 'critical' : 'high',
        action: `Gắn ${name} vào tường bằng dây chống đổ hoặc bracket L. Khối lượng ước tính ${mass.toFixed(0)}kg.`,
        standard: 'ASTM F2057 Furniture Anti-Tip Standard',
      });
    }

    if (height > 1.0 && mass > 15) {
      recs.push({
        type: 'placement',
        priority: 'high',
        action: 'Đặt đồ vật nặng xuống thấp, không để đồ nặng trên cao.',
      });
    }

    if (dangerLevel === 'critical' || dangerLevel === 'high') {
      recs.push({
        type: 'supervision',
        priority: 'high',
        action: 'Không để trẻ chơi một mình gần khu vực này.',
      });
    }

    return recs;
  }
}

const topplePredictor = new TopplePredictor();
export { topplePredictor, TopplePredictor };