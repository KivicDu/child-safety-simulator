class HeatmapGenerator {
  constructor() {
    this.CELL_SIZE = 0.5;
    this.MIN_GRID_SIZE = 10;
    this.SMOOTHING_RADIUS = 1.0;
    this.DECAY_FACTOR = 0.5;
  }

  generateHeatmap(collisionEvents, sceneBbox, options = {}) {
    const { cellSize = this.CELL_SIZE, smoothing = true } = options;
    console.log(`🗺️  Generating heatmap from ${collisionEvents.length} events...`);

    const gridBounds = this.calculateGridBounds(sceneBbox, cellSize);
    const grid = this.initializeGrid(gridBounds);
    this.projectCollisionsToGrid(collisionEvents, grid, gridBounds, cellSize);
    if (smoothing) this.applyGaussianSmoothing(grid);
    const normalized = this.normalizeGrid(grid);
    const hotspots = this.identifyHotspots(normalized, gridBounds, cellSize);

    console.log(`✅ Heatmap: ${gridBounds.cols}×${gridBounds.rows}, ${hotspots.length} hotspots`);
    return { grid: normalized, bounds: gridBounds, cellSize, hotspots, metadata: { totalEvents: collisionEvents.length, maxRisk: this.getMaxValue(normalized), avgRisk: this.getAvgValue(normalized), generatedAt: new Date().toISOString() } };
  }

  calculateGridBounds(sceneBbox, cellSize) {
    const minX = Math.floor(sceneBbox.min[0] / cellSize) * cellSize;
    const maxX = Math.ceil(sceneBbox.max[0] / cellSize) * cellSize;
    const minZ = Math.floor(sceneBbox.min[2] / cellSize) * cellSize;
    const maxZ = Math.ceil(sceneBbox.max[2] / cellSize) * cellSize;
    const cols = Math.max(this.MIN_GRID_SIZE, Math.ceil((maxX - minX) / cellSize));
    const rows = Math.max(this.MIN_GRID_SIZE, Math.ceil((maxZ - minZ) / cellSize));
    return { minX, maxX, minZ, maxZ, cols, rows, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2 };
  }

  initializeGrid(bounds) {
    const grid = [];
    for (let row = 0; row < bounds.rows; row++) {
      grid[row] = [];
      for (let col = 0; col < bounds.cols; col++) {
        grid[row][col] = { riskScore: 0, eventCount: 0, totalInjury: 0, maxInjury: 0, events: [] };
      }
    }
    return grid;
  }

  projectCollisionsToGrid(events, grid, bounds, cellSize) {
    events.forEach(event => {
      const position = event.position;
      if (!position) return;
      const col = Math.floor((position[0] - bounds.minX) / cellSize);
      const row = Math.floor((position[2] - bounds.minZ) / cellSize);
      if (col < 0 || col >= bounds.cols || row < 0 || row >= bounds.rows) return;

      const cell = grid[row][col];
      const injuryScore = event.injury?.injuryScore || 0;
      cell.eventCount++;
      cell.totalInjury += injuryScore;
      cell.maxInjury = Math.max(cell.maxInjury, injuryScore);
      cell.events.push({ objectId: event.objectId, objectName: event.objectName, injuryScore, velocity: event.velocity });
      cell.riskScore = cell.totalInjury / cell.eventCount;
    });
  }

  applyGaussianSmoothing(grid) {
    const rows = grid.length, cols = grid[0].length;
    const smoothed = this.initializeGrid({ rows, cols });
    const radius = Math.ceil(this.SMOOTHING_RADIUS / this.CELL_SIZE);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let totalWeight = 0, weightedSum = 0;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            const distance = Math.sqrt(dr * dr + dc * dc);
            const weight = Math.exp(-distance * distance / (2 * this.DECAY_FACTOR * this.DECAY_FACTOR));
            weightedSum += grid[nr][nc].riskScore * weight;
            totalWeight += weight;
          }
        }
        if (totalWeight > 0) {
          smoothed[r][c].riskScore = weightedSum / totalWeight;
          smoothed[r][c].eventCount = grid[r][c].eventCount;
        }
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        grid[r][c].riskScore = smoothed[r][c].riskScore;
      }
    }
  }

  normalizeGrid(grid) {
    const rows = grid.length, cols = grid[0].length;
    let maxRisk = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        maxRisk = Math.max(maxRisk, grid[r][c].riskScore);
      }
    }
    if (maxRisk === 0) return grid;

    const normalized = [];
    for (let r = 0; r < rows; r++) {
      normalized[r] = [];
      for (let c = 0; c < cols; c++) {
        normalized[r][c] = { ...grid[r][c], riskScore: (grid[r][c].riskScore / maxRisk) * 100 };
      }
    }
    return normalized;
  }

  identifyHotspots(grid, bounds, cellSize, threshold = 60) {
    const hotspots = [];
    const rows = grid.length, cols = grid[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.riskScore >= threshold) {
          const worldX = bounds.minX + (c + 0.5) * cellSize;
          const worldZ = bounds.minZ + (r + 0.5) * cellSize;
          hotspots.push({ row: r, col: c, position: { x: worldX, z: worldZ }, riskScore: Math.round(cell.riskScore), eventCount: cell.eventCount, maxInjury: cell.maxInjury, involvedObjects: this.getUniqueObjects(cell.events) });
        }
      }
    }
    return hotspots.sort((a, b) => b.riskScore - a.riskScore);
  }

  getUniqueObjects(events) {
    const objectMap = new Map();
    events.forEach(event => {
      if (!objectMap.has(event.objectId)) {
        objectMap.set(event.objectId, { id: event.objectId, name: event.objectName, count: 0 });
      }
      objectMap.get(event.objectId).count++;
    });
    return Array.from(objectMap.values()).sort((a, b) => b.count - a.count);
  }

  getMaxValue(grid) {
    let max = 0;
    grid.forEach(row => row.forEach(cell => { max = Math.max(max, cell.riskScore); }));
    return max;
  }

  getAvgValue(grid) {
    let sum = 0, count = 0;
    grid.forEach(row => row.forEach(cell => {
      if (cell.eventCount > 0) { sum += cell.riskScore; count++; }
    }));
    return count > 0 ? sum / count : 0;
  }

  exportForRendering(heatmap) {
    return {
      width: heatmap.bounds.cols,
      height: heatmap.bounds.rows,
      cellSize: heatmap.cellSize,
      bounds: { minX: heatmap.bounds.minX, maxX: heatmap.bounds.maxX, minZ: heatmap.bounds.minZ, maxZ: heatmap.bounds.maxZ },
      data: heatmap.grid.map(row => row.map(cell => Math.round(cell.riskScore))),
      hotspots: heatmap.hotspots
    };
  }
}

export default new HeatmapGenerator();