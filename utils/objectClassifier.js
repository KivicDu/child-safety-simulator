class ObjectClassifier {
  constructor() {
    this.FLOOR_MAX_HEIGHT = 0.5; this.FLOOR_MIN_AREA = 1.0;
    this.WALL_MIN_HEIGHT = 1.5; this.WALL_MAX_THICKNESS = 0.3;
    this.TABLE_HEIGHT_MIN = 0.6; this.TABLE_HEIGHT_MAX = 1.2; this.SHELF_HEIGHT_MIN = 1.2;
  }

  classifyScene(objects, sceneBbox, floorInfo) {
    console.log(`🔍 Classifying ${objects.length} objects...`);
    const classified = objects.map(obj => ({
      ...obj, classification: {...this.classifyObject(obj, sceneBbox, floorInfo), classifiedAt: new Date().toISOString(), method: 'rule-based'}
    }));
    const summary = {}; classified.forEach(obj => { const cat = obj.classification.category; summary[cat] = (summary[cat] || 0) + 1; });
    console.log('📊', summary); return classified;
  }

  classifyObject(obj, sceneBbox, floorInfo) {
    const bbox = obj.boundingBox;
    const dims = { width: bbox.max[0] - bbox.min[0], height: bbox.max[1] - bbox.min[1], depth: bbox.max[2] - bbox.min[2] };
    const position = { x: (bbox.min[0] + bbox.max[0]) / 2, y: (bbox.min[1] + bbox.max[1]) / 2, z: (bbox.min[2] + bbox.max[2]) / 2 };
    const area = dims.width * dims.depth, volume = dims.width * dims.height * dims.depth;
    const isNearFloor = Math.abs(bbox.min[1] - (floorInfo?.height || 0)) < 0.1;
    const sharpness = 1 - (Math.min(dims.width, dims.height, dims.depth) / Math.max(dims.width, dims.height, dims.depth));
    
    let category = 'furniture', subcategory = 'unknown', dangerScore = 5, properties = { edgeSharpness: sharpness };

    if (dims.height < this.FLOOR_MAX_HEIGHT && area > this.FLOOR_MIN_AREA && isNearFloor) {
      category = 'floor'; dangerScore = 0;
    } else if (dims.height > this.WALL_MIN_HEIGHT && (dims.width < this.WALL_MAX_THICKNESS || dims.depth < this.WALL_MAX_THICKNESS)) {
      category = 'wall'; dangerScore = 2;
    } else if (dims.height >= this.TABLE_HEIGHT_MIN && dims.height <= this.TABLE_HEIGHT_MAX) {
      subcategory = 'table'; dangerScore = 4 + (sharpness > 0.7 ? 2 : 0); properties = { ...properties, canClimb: false, canPull: false };
    } else if (dims.height > this.SHELF_HEIGHT_MIN) {
      const baseArea = dims.width * dims.depth, ratio = dims.height / Math.sqrt(baseArea);
      const tippingRisk = ratio > 3 ? 'high' : ratio > 2 ? 'medium' : 'low';
      subcategory = 'shelf'; dangerScore = 6 + (tippingRisk === 'high' ? 3 : tippingRisk === 'medium' ? 1 : 0);
      properties = { ...properties, canClimb: true, canPull: true, tippingRisk };
    } else if (volume < 0.1) {
      category = 'small_object'; subcategory = 'toy'; dangerScore = volume < 0.001 ? 8 : 3;
      properties = { ...properties, chokeHazard: volume < 0.001 };
    }

    if (obj.name) {
      const n = obj.name.toLowerCase();
      if (n.includes('table') || n.includes('desk')) subcategory = 'table';
      else if (n.includes('chair')) { subcategory = 'chair'; dangerScore = 4; properties = {...properties, canClimb: true}; }
      else if (n.includes('shelf') || n.includes('bookcase')) subcategory = 'shelf';
    }

    return { category, subcategory, dangerScore, properties, dimensions: dims, position, confidence: 0.7 };
  }
}

export default new ObjectClassifier();