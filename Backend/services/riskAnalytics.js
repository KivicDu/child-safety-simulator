/**
 * RiskAnalytics — Automated Risk Reporting for SafeHome Simulator
 * 
 * Collects simulation events and produces:
 * - Collision heatmap (0.5m grid resolution)
 * - Near-miss event log (turnRate/momentum/dangerZone saves)
 * - Accident event log with severity
 * - Auto-generated safety recommendations
 */

class RiskAnalytics {
  constructor() {
    this.collisionHeatmap = new Map(); // grid_key → { count, totalSeverity }
    this.nearMissEvents = [];
    this.accidentEvents = [];
    this.gridResolution = 0.5; // 0.5m squares
    this.maxEvents = 500;      // cap to prevent memory issues

    // [BUG-18 FIX] Near-miss threshold is now agent-height-proportional.
    // Old: hardcoded 0.15m for all ages. For a school-age child (1.2m tall) this
    // is only 12.5% of body height — misses many close-call events.
    // For an infant (0.5m tall) 0.15m = 30% of height — slightly over-sensitive.
    // Formula: 0.10 + agentHeight * 0.12 (matches biomechanical "personal space" literature).
    // Default fallback: 0.15m (for code paths that don't pass agent height).
    this._nearMissBaseThreshold = 0.10;
    this._nearMissHeightCoeff   = 0.12;
    this._defaultNearMissThreshold = 0.15;
  }

  /**
   * Get the near-miss threshold for a specific agent height (or default).
   * @param {number|null} agentHeight - Agent height in metres
   * @returns {number} threshold in metres
   */
  getNearMissThreshold(agentHeight = null) {
    if (!agentHeight || !Number.isFinite(agentHeight)) {
      return this._defaultNearMissThreshold;
    }
    return this._nearMissBaseThreshold + agentHeight * this._nearMissHeightCoeff;
  }

  /**
   * Record a simulation event.
   * @param {'collision'|'fall'|'tantrum'|'near_miss'|'startle'|'grasp_fail'|'depth_misjudge'} type
   * @param {number[]} position [x, y, z]
   * @param {object} details { agentId, ageGroup, severity, reason, objectId, ... }
   */
  recordEvent(type, position, details = {}) {
    const entry = {
      type,
      position: position ? [...position] : [0, 0, 0],
      time: Date.now(),
      agentId: details.agentId || 'unknown',
      ageGroup: details.ageGroup || 'unknown',
      ...details,
    };

    if (type === 'near_miss') {
      this.nearMissEvents.push(entry);
      if (this.nearMissEvents.length > this.maxEvents) {
        this.nearMissEvents.shift();
      }
    } else {
      this.accidentEvents.push(entry);
      if (this.accidentEvents.length > this.maxEvents) {
        this.accidentEvents.shift();
      }

      // Update heatmap
      const key = this._getGridKey(position);
      const cell = this.collisionHeatmap.get(key) || { count: 0, totalSeverity: 0 };
      cell.count++;
      cell.totalSeverity += (details.severity || 1);
      this.collisionHeatmap.set(key, cell);
    }
  }

  /**
   * Get heatmap data for frontend visualization.
   * @returns {{ x: number, z: number, intensity: number, count: number }[]}
   */
  getHeatmapData() {
    const data = [];
    for (const [key, cell] of this.collisionHeatmap) {
      const [gx, gz] = key.split('_').map(Number);
      data.push({
        x: gx * this.gridResolution,
        z: gz * this.gridResolution,
        intensity: Math.min(cell.count / 10, 1.0),
        count: cell.count,
        avgSeverity: cell.count > 0 ? cell.totalSeverity / cell.count : 0,
      });
    }
    return data.sort((a, b) => b.intensity - a.intensity);
  }

  /**
   * Generate near-miss report.
   * @returns {{ total: number, byType: object, topZones: object[], events: object[] }}
   */
  getNearMissReport() {
    return {
      total: this.nearMissEvents.length,
      byReason: this._groupBy(this.nearMissEvents, 'reason'),
      byAgeGroup: this._groupBy(this.nearMissEvents, 'ageGroup'),
      topZones: this._getTopZones(this.nearMissEvents, 5),
      recentEvents: this.nearMissEvents.slice(-20),
    };
  }

  /**
   * Generate full risk report for export/API.
   */
  generateRiskReport() {
    return {
      timestamp: new Date().toISOString(),
      heatmap: this.getHeatmapData(),
      nearMisses: this.getNearMissReport(),
      accidents: {
        total: this.accidentEvents.length,
        byType: this._groupBy(this.accidentEvents, 'type'),
        byAgeGroup: this._groupBy(this.accidentEvents, 'ageGroup'),
        bySeverity: {
          low: this.accidentEvents.filter(e => (e.severity || 1) <= 2).length,
          medium: this.accidentEvents.filter(e => (e.severity || 1) > 2 && (e.severity || 1) <= 5).length,
          high: this.accidentEvents.filter(e => (e.severity || 1) > 5).length,
        },
      },
      recommendations: this._generateRecommendations(),
    };
  }

  /**
   * Reset all analytics data (e.g., between simulations).
   */
  reset() {
    this.collisionHeatmap.clear();
    this.nearMissEvents = [];
    this.accidentEvents = [];
  }

  // ── Private helpers ───────────────────────────────────────────────────

  _getGridKey(position) {
    if (!position) return '0_0';
    const gx = Math.round(position[0] / this.gridResolution);
    const gz = Math.round(position[2] / this.gridResolution);
    return `${gx}_${gz}`;
  }

  _groupBy(events, field) {
    const groups = {};
    for (const e of events) {
      const key = e[field] || 'unknown';
      groups[key] = (groups[key] || 0) + 1;
    }
    return groups;
  }

  _getTopZones(events, limit) {
    const zoneCounts = new Map();
    for (const e of events) {
      const key = this._getGridKey(e.position);
      zoneCounts.set(key, (zoneCounts.get(key) || 0) + 1);
    }
    return [...zoneCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => {
        const [gx, gz] = key.split('_').map(Number);
        return {
          x: gx * this.gridResolution,
          z: gz * this.gridResolution,
          count,
        };
      });
  }

  _generateRecommendations() {
    const recs = [];
    const hotspots = this.getHeatmapData().slice(0, 5);

    for (const spot of hotspots) {
      const risk = spot.intensity > 0.7 ? 'HIGH' : spot.intensity > 0.3 ? 'MEDIUM' : 'LOW';
      recs.push({
        zone: { x: spot.x, z: spot.z },
        risk,
        accidentCount: spot.count,
        avgSeverity: spot.avgSeverity.toFixed(1),
        suggestion: `Zone (${spot.x.toFixed(1)}, ${spot.z.toFixed(1)}): ${spot.count} incidents — consider adding barriers or relocating hazards.`,
      });
    }

    // Near-miss patterns
    const nms = this.getNearMissReport();
    if (nms.total > 10) {
      recs.push({
        type: 'pattern',
        risk: 'WARNING',
        suggestion: `${nms.total} near-miss events detected. Most common cause: ${Object.entries(nms.byReason || {}).sort((a,b) => b[1]-a[1])[0]?.[0] || 'unknown'}.`,
      });
    }

    return recs;
  }
}

// Singleton
const riskAnalytics = new RiskAnalytics();
export { riskAnalytics, RiskAnalytics };