import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import * as sceneController from '../controllers/sceneController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for GLB upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.glb' || ext === '.gltf') {
      cb(null, true);
    } else {
      cb(new Error('Only GLB/GLTF files are allowed!'));
    }
  },
  limits: { 
    fileSize: 200 * 1024 * 1024 // 200MB
  }
});

// POST /api/upload - Upload GLB file
router.post('/upload', upload.single('model'), sceneController.uploadModel);

// GET /api/scene/:id - Get parsed scene data
router.get('/scene/:id', sceneController.getScene);

// ── Analysis & Debug Endpoints ────────────────────────────────────────────
// GET /api/scene/:id/analysis - Full spatial analysis (groups + relations + hazards)
router.get('/scene/:id/analysis', sceneController.getAnalysis);

// Debug endpoints — individual data layers
router.get('/scene/:id/objects',   sceneController.getObjects);
router.get('/scene/:id/groups',    sceneController.getGroups);
router.get('/scene/:id/relations', sceneController.getRelations);
router.get('/scene/:id/hazards',   sceneController.getHazards);

export default router;