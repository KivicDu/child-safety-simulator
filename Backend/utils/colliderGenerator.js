class ColliderGenerator {

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
      if (b < a) return false;
    }

    return true;
  }

  generateCollidersFromScene(sceneData, world, physicsEngine) {
    const colliders = [];

    const objects = sceneData?.objects || [];
    console.log(`🔨 Generating colliders for ${objects.length} objects...`);

    // Create floor collider
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
        collider: floorCollider.collider
      });

      console.log(`✅ Floor collider created at height ${sceneData.floor.height}`);
    } else {
      console.warn('⚠️ No valid floor data found, skipping floor collider');
    }

    // 🔥 FIX: Create SOLID colliders (NOT sensors) for collision detection
    let skipped = 0;

    objects.forEach((obj, index) => {
      if (!obj) {
        skipped++;
        return;
      }

      if (!this.isValidBBox(obj.boundingBox)) {
        skipped++;
        console.warn(
          `⚠️ Skipping collider for object #${index} (${obj.name || obj.id || 'unknown'}) - invalid boundingBox`
        );
        return;
      }

      try {
        // 🔥 CRITICAL FIX: Remove isSensor flag to enable real collisions
        const rb = physicsEngine.createBoxCollider(
          world,
          obj.boundingBox,
          true,  // isStatic = true
          false  // isSensor = false (CHANGED FROM true)
        );

        colliders.push({
          ...obj, // 🔥 FIX: Propagate ALL object properties (classification, material, etc.)
          id: obj.id || `obj_${index}`,
          name: obj.name || `Object ${index}`,
          type: 'object',
          body: rb.body,
          collider: rb.collider,
          boundingBox: obj.boundingBox
        });

      } catch (err) {
        skipped++;
        console.warn(
          `⚠️ Failed creating collider for object #${index} (${obj.name || obj.id || 'unknown'}): ${err.message}`
        );
      }
    });

    console.log(`✅ Created ${colliders.length} colliders (skipped ${skipped})`);
    return colliders;
  }

  // Calculate sharpness heuristic (for injury scoring later)
  calculateSharpness(bbox) {
    const size = [
      bbox.max[0] - bbox.min[0],
      bbox.max[1] - bbox.min[1],
      bbox.max[2] - bbox.min[2]
    ];

    const minDim = Math.min(...size);
    const maxDim = Math.max(...size);
    const ratio = minDim / maxDim;

    return 1 - ratio;
  }
}

export default new ColliderGenerator();