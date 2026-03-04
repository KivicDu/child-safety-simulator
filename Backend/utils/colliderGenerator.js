// ─────────────────────────────────────────────────────────────────────────────
// colliderGenerator.js  — v2 (Implementation Plan §4.3)
//
// Changes vs v1:
//  • Soft-object detection expanded (materialResistance per material type)
//  • materialResistance (0-1) attached to every collider descriptor
//  • objectId propagated into collider user-data for actionLog.wadingIn echo
//  • activeEvents set with BOTH COLLISION_EVENTS | INTERSECTION_EVENTS on sensors
//    (previously only COLLISION_EVENTS was set, causing drainIntersectionEvents
//     to silently miss all soft-body interactions)
// ─────────────────────────────────────────────────────────────────────────────

// Material → resistance lookup (0 = no drag, 1 = maximum drag)
// Values are tunable via config without code changes.
const MATERIAL_RESISTANCE = {
  pillow:   0.70,
  cushion:  0.65,
  blanket:  0.50,
  plush:    0.75,
  mattress: 0.80,
  foam:     0.85,
  bedding:  0.55,
  soft:     0.60,   // generic fallback for anything tagged "soft"
  teddy:    0.70,
};

// Regex that identifies soft / yielding objects from their name / classification
const SOFT_PATTERN = /pillow|cushion|blanket|plush|bedding|soft|mattress|teddy|foam/;

class ColliderGenerator {

  // ── Validation ────────────────────────────────────────────────────────────

  isValidBBox(bbox) {
    if (!bbox) return false;
    if (!bbox.min || !bbox.max) return false;
    if (!Array.isArray(bbox.min) || !Array.isArray(bbox.max)) return false;
    if (bbox.min.length < 3 || bbox.max.length < 3) return false;

    for (let i = 0; i < 3; i++) {
      const a = bbox.min[i];
      const b = bbox.max[i];
      if (typeof a !== 'number' || typeof b !== 'number') return false;
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (b < a) return false;          // degenerate bbox
    }

    return true;
  }

  // ── Soft-object detection ─────────────────────────────────────────────────

  /**
   * Determine whether an object is a soft / yielding sensor.
   * Returns { isSoft, materialResistance } based on name and classification.
   */
  _classifySoftness(obj) {
    const searchStr = [
      obj.name,
      obj.classification?.category,
      obj.classification?.subcategory,
      obj.classification?.material,
      obj.properties?.material?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!SOFT_PATTERN.test(searchStr)) {
      return { isSoft: false, materialResistance: 0.0 };
    }

    // Pick the most specific resistance value from the lookup table
    let materialResistance = 0.60; // generic soft fallback
    for (const [key, value] of Object.entries(MATERIAL_RESISTANCE)) {
      if (searchStr.includes(key)) {
        materialResistance = value;
        break;
      }
    }

    return { isSoft: true, materialResistance };
  }

  // ── Main collider generation ──────────────────────────────────────────────

  generateCollidersFromScene(sceneData, world, physicsEngine) {
    const colliders = [];
    const objects = sceneData?.objects || [];

    console.log(`🔨 Generating colliders for ${objects.length} objects...`);

    // ── Floor collider ──────────────────────────────────────────────────────
    if (sceneData?.floor && typeof sceneData.floor.height === 'number') {
      const floorCollider = physicsEngine.createFloorCollider(
        world,
        sceneData.floor.height,
        100
      );

      colliders.push({
        id: 'floor',
        type: 'floor',
        body: floorCollider.body,
        collider: floorCollider.collider,
        materialResistance: 0.0,
      });

      console.log(`✅ Floor collider created at height ${sceneData.floor.height}`);
    } else {
      console.warn('⚠️ No valid floor data found, skipping floor collider');
    }

    // ── Object colliders ────────────────────────────────────────────────────
    let skipped = 0;

    objects.forEach((obj, index) => {
      if (!obj) {
        skipped++;
        return;
      }

      if (!this.isValidBBox(obj.boundingBox)) {
        skipped++;
        console.warn(
          `⚠️ Skipping collider for object #${index} (${obj.name || obj.id || 'unknown'}) — invalid boundingBox`
        );
        return;
      }

      try {
        // §4.3: classify softness and derive materialResistance
        const { isSoft, materialResistance } = this._classifySoftness(obj);

        // Stable objectId used in actionLog.wadingIn echo
        const objectId = obj.id || `obj_${index}`;

        // FIX RUG ALIGNMENT: tính toán surfaceY (top surface của bbox).
        // Physics engine đặt collider center ở giữa bbox → agent đứng ở center Y,
        // không phải tại top surface. surfaceY được dùng bởi simulationController
        // để snap agent lên đúng bề mặt khi spawn và khi raycast.
        const bboxHeight = obj.boundingBox.max[1] - obj.boundingBox.min[1];
        const surfaceY   = obj.boundingBox.max[1];  // top face của object
        if (bboxHeight < 0.02) {
          // Thảm/tấm lót mỏng: collision rất khó detect → warn
          console.warn(
            `  ⚠️ Thin object (${bboxHeight.toFixed(4)}m height): ${obj.name || objectId}. ` +
            `Physics raycast may miss. Ensure DoubleSide mesh in Canvas3D.`
          );
        }

        const rb = physicsEngine.createBoxCollider(
          world,
          obj.boundingBox,
          true,    // isStatic = true
          false    // FIX: Soft objects should NOT be sensors; they are solid obstacles that the child cannot walk through
        );

        // §4.3: set BOTH event flags so Rapier emits to drainCollisionEvents
        //       AND drainIntersectionEvents.  Previously only COLLISION_EVENTS
        //       was set, meaning sensor intersections were silently dropped.
        if (rb.collider && physicsEngine.rapier) {
          if (isSoft) {
            rb.collider.setActiveEvents(
              physicsEngine.rapier.ActiveEvents.COLLISION_EVENTS |
              physicsEngine.rapier.ActiveEvents.INTERSECTION_EVENTS
            );
          } else {
            // Non-soft objects only need rigid collision events
            rb.collider.setActiveEvents(
              physicsEngine.rapier.ActiveEvents.COLLISION_EVENTS
            );
          }
        }

        // §4.3: store objectId in collider user-data so it can be echoed into
        //       actionLog.wadingIn when an agent intersects this sensor
        if (rb.collider && typeof rb.collider.setUserData === 'function') {
          rb.collider.setUserData({ objectId, isSoft, materialResistance, surfaceY });
        }

        colliders.push({
          ...obj,                             // propagate ALL object properties
          id: objectId,
          name: obj.name || `Object ${index}`,
          type: 'object',
          body: rb.body,
          collider: rb.collider,
          boundingBox: obj.boundingBox,
          isSoft,                             // exposed for simulationController checks
          materialResistance,                 // exposed for agent.handleIntersection
          // FIX RUG ALIGNMENT: surfaceY exposed cho simulationController để spawn
          // agent tại đúng bề mặt (không bị lún xuống center bbox của thảm)
          surfaceY,
        });

        if (isSoft) {
          console.log(
            `  🛋️ Soft sensor: ${obj.name || objectId} (resistance=${materialResistance})`
          );
        }

      } catch (err) {
        skipped++;
        console.warn(
          `⚠️ Failed creating collider for object #${index} (${obj.name || obj.id || 'unknown'}): ${err.message}`
        );
      }
    });

    const softCount  = colliders.filter(c => c.isSoft).length;
    const solidCount = colliders.filter(c => c.type === 'object' && !c.isSoft).length;
    console.log(
      `✅ Created ${colliders.length} colliders — ${solidCount} solid, ${softCount} soft sensors (skipped ${skipped})`
    );

    return colliders;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Sharpness heuristic (used by injuryCalculator) */
  calculateSharpness(bbox) {
    const size = [
      bbox.max[0] - bbox.min[0],
      bbox.max[1] - bbox.min[1],
      bbox.max[2] - bbox.min[2],
    ];
    const minDim = Math.min(...size);
    const maxDim = Math.max(...size);
    const ratio  = minDim / maxDim;
    return 1 - ratio;
  }
}

export default new ColliderGenerator();