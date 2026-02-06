import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import glbParser from '../utils/glbParser.js';
import objectClassifier from '../utils/objectClassifier.js';
import geminiAPI from '../services/geminiAPI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARSED_DIR = process.env.PARSED_DIR || './parsed';

// Ensure parsed directory exists
await fs.mkdir(PARSED_DIR, { recursive: true });

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

    const classifiedObjects = objectClassifier.classifyScene(
      sceneData.objects,
      sceneData.boundingBox,
      sceneData.floor
    );

    await geminiAPI.init();
    const aiEnhanced = await geminiAPI.enhanceClassification(
      sceneData.objects,
      classifiedObjects
    );
    
    // Update scene with classified objects
    sceneData.classifiedObjects = aiEnhanced;

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