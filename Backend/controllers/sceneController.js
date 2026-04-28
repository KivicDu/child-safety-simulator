import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import glbParser from '../utils/glbParser.js';
import objectClassifier from '../utils/objectClassifier.js';
import scaleAuthority from '../services/scaleAuthority.js';
import { applyScaleToSceneData } from '../utils/scaleNormalizer.js';
import geminiAPI from '../services/geminiAPI.js';
import { normalizeSceneObject, toBBox, bboxCenter, bboxDimensions } from '../utils/vecUtils.js';
import { groupObjects } from '../utils/objectGrouping.js';
import { computeSpatialRelations } from '../utils/spatialRelations.js';
import { computeHazards } from '../utils/spatialReasoning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSED_DIR = process.env.PARSED_DIR || './parsed';

// Ensure parsed directory exists
fs.mkdir(PARSED_DIR, { recursive: true }).catch(() => {});

export const uploadModel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const glbPath = req.file.path;
    const sceneId = path.basename(glbPath, '.glb');

    console.log(`📦 Parsing GLB: ${req.file.originalname}`);

    // Parse GLB
    const sceneData = await glbParser.parse(glbPath);

    // 🚨 Detect absolute scale via Backend ScaleAuthority (Single Source of Truth)
    const scaleInfo = scaleAuthority.detectScale(sceneData);

    // 🚨 Apply absolute scale factor to the JSON data directly (Baking to Math)
    applyScaleToSceneData(sceneData, scaleInfo.factor);

    // 🚨 Write the .meta metadata file so the Frontend can blindly apply the precise scalar matching physics
    const metaPath = `${glbPath}.meta`;
    const metaData = {
      normalized: true,
      scaleFactor: scaleInfo.factor,
      detectedBy: scaleInfo.detectedBy
    };
    await fs.writeFile(metaPath, JSON.stringify(metaData, null, 2));

    const classifiedObjects = objectClassifier.classifyScene(
      sceneData.objects,
      sceneData.boundingBox,
      sceneData.floor
    );

    /*
    await geminiAPI.init();
    const aiEnhanced = await geminiAPI.enhanceClassification(
      sceneData.objects,
      classifiedObjects
    );
    */
    
    // Update scene with classified objects (SKIP AI for now to fix timeout)
    sceneData.classifiedObjects = classifiedObjects;

    // ── Spatial Analysis Pipeline ──────────────────────────────────────────
    try {
      const analysisResult = runSpatialAnalysis(sceneData);
      sceneData.analysis = analysisResult;
      console.log(`✅ Spatial analysis complete: ${analysisResult.groups.length} groups, ` +
        `${analysisResult.relations.length} relations, ${analysisResult.hazards.length} hazards`);
    } catch (analysisErr) {
      console.warn('⚠️ Spatial analysis failed (non-fatal):', analysisErr.message);
      sceneData.analysis = { objects: [], groups: [], relations: [], hazards: [], error: analysisErr.message };
    }

    // Save parsed data
    const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
    await fs.writeFile(parsedPath, JSON.stringify(sceneData, null, 2));

    console.log(`✅ Scene parsed: ${sceneData.objects.length} objects`);

    res.json({
      success: true,
      sceneId: sceneId,
      filePath: `/uploads/${req.file.filename}`,
      scene: sceneData
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getScene = async (req, res) => {
  try {
    const sceneId = req.params.id;
    const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
    
    const data = await fs.readFile(parsedPath, 'utf8');
    const sceneData = JSON.parse(data);

    res.json(sceneData);

  } catch (error) {
    res.status(404).json({ error: 'Scene not found' });
  }
};

// ── Spatial Analysis: runs grouping → relations → hazards ─────────────────
function runSpatialAnalysis(sceneData) {
  // 1. Normalize objects to Vec3 format
  const normalizedObjects = sceneData.objects.map((rawObj, idx) => {
    const nObj = normalizeSceneObject(rawObj);

    // Attach classification data if available
    if (sceneData.classifiedObjects && sceneData.classifiedObjects[idx]) {
      const cls = sceneData.classifiedObjects[idx];
      nObj.classification = {
        label: cls.specificName || `${cls.subcategory} ${cls.category}`,
        category: cls.category,
        subcategory: cls.subcategory,
        confidence: cls.confidence || 0.5,
        source: cls.classificationSource || 'keyword',
        surfaceType: cls.surfaceType,
        dangerScore: cls.dangerScore || 0,
      };
    }
    return nObj;
  });

  // 2. Scene bounding box in Vec3 format
  const scnBbox = toBBox(sceneData.boundingBox);

  // 3. Object Grouping
  const { groups, ungrouped } = groupObjects(normalizedObjects, scnBbox);

  // 4. Spatial Relations
  const relations = computeSpatialRelations(normalizedObjects, scnBbox);

  // 5. Spatial Reasoning (contextual hazards)
  const floorHeight = sceneData.floor?.height || sceneData.floor?.topHeight || 0;
  const hazards = computeHazards(normalizedObjects, relations, { floorHeight });

  return {
    objects: normalizedObjects.map(obj => ({
      id: obj.id,
      name: obj.name,
      bbox: obj.bbox,
      center: obj.center,
      dimensions: obj.dimensions,
      classification: obj.classification || null,
    })),
    groups,
    ungrouped: ungrouped.map(o => o.id),
    relations,
    hazards,
    meta: {
      totalObjects: normalizedObjects.length,
      totalGroups: groups.length,
      totalRelations: relations.length,
      totalHazards: hazards.length,
      floorHeight,
    },
  };
}

// ── Analysis endpoint (GET /api/scene/:id/analysis) ───────────────────────
export const getAnalysis = async (req, res) => {
  try {
    const sceneId = req.params.id;
    const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
    const data = await fs.readFile(parsedPath, 'utf8');
    const sceneData = JSON.parse(data);

    // If analysis already cached, return it
    if (sceneData.analysis && !sceneData.analysis.error) {
      return res.json(sceneData.analysis);
    }

    // Otherwise, compute and cache
    const analysis = runSpatialAnalysis(sceneData);
    sceneData.analysis = analysis;
    await fs.writeFile(parsedPath, JSON.stringify(sceneData, null, 2));

    res.json(analysis);
  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(404).json({ error: 'Scene not found or analysis failed' });
  }
};

// ── Debug endpoints ───────────────────────────────────────────────────────
export const getObjects = async (req, res) => {
  try {
    const analysis = await loadAnalysis(req.params.id);
    res.json(analysis.objects);
  } catch (e) { res.status(404).json({ error: e.message }); }
};

export const getGroups = async (req, res) => {
  try {
    const analysis = await loadAnalysis(req.params.id);
    res.json(analysis.groups);
  } catch (e) { res.status(404).json({ error: e.message }); }
};

export const getRelations = async (req, res) => {
  try {
    const analysis = await loadAnalysis(req.params.id);
    res.json(analysis.relations);
  } catch (e) { res.status(404).json({ error: e.message }); }
};

export const getHazards = async (req, res) => {
  try {
    const analysis = await loadAnalysis(req.params.id);
    res.json(analysis.hazards);
  } catch (e) { res.status(404).json({ error: e.message }); }
};

async function loadAnalysis(sceneId) {
  const parsedPath = path.join(PARSED_DIR, `${sceneId}.json`);
  const data = await fs.readFile(parsedPath, 'utf8');
  const sceneData = JSON.parse(data);
  if (sceneData.analysis) return sceneData.analysis;
  throw new Error('No analysis data found — upload the model first');
}