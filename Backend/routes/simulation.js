import express from 'express';
import * as simulationController from '../controllers/simulationController.js';
import * as batchSimulationController from '../controllers/batchSimulationController.js';

const router = express.Router();

// POST /api/simulate/start
router.post('/start', simulationController.startSimulation);

// GET /api/simulate/:id/status
router.get('/:id/status', simulationController.getSimulationStatus);

// GET /api/simulate/:id/events
router.get('/:id/events', simulationController.getCollisionEvents);

// GET /api/simulate/:id/heatmap
router.get('/:id/heatmap', simulationController.getSimulationHeatmap);

// GET /api/simulate/:id/report
router.get('/:id/report', simulationController.getSimulationReport);

// POST /api/simulate/batch-all-ages
router.post('/batch-all-ages', batchSimulationController.batchSimulateAllAges);

export default router;