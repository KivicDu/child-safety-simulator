import { groupObjects } from './objectGrouping.js';
import { computeSpatialRelations } from './spatialRelations.js';
import { computeHazards } from './spatialReasoning.js';
import { classifyObject } from './objectClassifier.js';
import { toBBox, bboxCenter, bboxDimensions } from './vecUtils.js';

const SCENE_BBOX = toBBox({ min: [0, 0, 0], max: [10, 5, 10] });

// Synthetic Objects
const objects = [
  // A table with legs and top (hierarchy prefix + overlap)
  {
    id: '1', name: 'Table_Top', meshIds: ['1'],
    bbox: toBBox({ min: [2, 0.7, 2], max: [4, 0.75, 4] }),
  },
  {
    id: '2', name: 'Table_Leg_1', meshIds: ['2'],
    bbox: toBBox({ min: [2.1, 0, 2.1], max: [2.2, 0.7, 2.2] }),
  },
  {
    id: '3', name: 'Table_Leg_2', meshIds: ['3'],
    bbox: toBBox({ min: [3.8, 0, 3.8], max: [3.9, 0.7, 3.9] }),
  },
  // A toy block on top of the table
  {
    id: '4', name: 'Toy_Block', meshIds: ['4'],
    bbox: toBBox({ min: [3, 0.75, 3], max: [3.2, 0.95, 3.2] }),
  },
  // A stairs object near the toy block
  {
    id: '5', name: 'Stairs', meshIds: ['5'],
    bbox: toBBox({ min: [4.5, 0, 2], max: [6, 2, 4] }),
  },
  // A sharp knife on the floor
  {
    id: '6', name: 'Kitchen_Knife', meshIds: ['6'],
    bbox: toBBox({ min: [1, 0, 1], max: [1.2, 0.05, 1.2] }),
  },
  // A tall, thin pole (no keyword match)
  {
    id: '7', name: 'Unknown_Pole', meshIds: ['7'],
    bbox: toBBox({ min: [8, 0, 8], max: [8.1, 2, 8.1] }),
    material: { metallic: 0.9 } // Metal
  }
].map(obj => {
  const center = bboxCenter(obj.bbox);
  const dimensions = bboxDimensions(obj.bbox);
  
  // Classify
  const cls = classifyObject({ ...obj, boundingBox: { min: [obj.bbox.min.x, obj.bbox.min.y, obj.bbox.min.z], max: [obj.bbox.max.x, obj.bbox.max.y, obj.bbox.max.z] } }, SCENE_BBOX, null);
  
  return { ...obj, center, dimensions, classification: { ...cls, label: cls.subcategory || cls.category, source: cls.classificationSource } };
});

console.log('--- Objects & Classification ---');
objects.forEach(o => {
  console.log(`[${o.name}] Label: ${o.classification.label} (Source: ${o.classification.source}, Conf: ${o.classification.confidence})`);
});

console.log('\n--- Grouping ---');
const { groups, ungrouped } = groupObjects(objects, SCENE_BBOX);
groups.forEach(g => {
  console.log(`Group: ${g.name} (Members: ${g.members.join(', ')})`);
});
console.log(`Ungrouped: ${ungrouped.map(o => o.name).join(', ')}`);

console.log('\n--- Relations ---');
const relations = computeSpatialRelations(objects, SCENE_BBOX);
relations.forEach(r => {
  const a = objects.find(o => o.id === r.objectA).name;
  const b = objects.find(o => o.id === r.objectB).name;
  console.log(`${a} ${r.relation} ${b} (Conf: ${r.confidence.toFixed(2)})`);
});

console.log('\n--- Hazards ---');
const hazards = computeHazards(objects, relations, { floorHeight: 0 });
hazards.forEach(h => {
  console.log(`[${h.severity.toUpperCase()}] ${h.type}: ${h.explanation}`);
});

console.log('\nALL TESTS PASS!');
