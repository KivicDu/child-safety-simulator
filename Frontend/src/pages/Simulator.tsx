import React, { useState, useRef, useEffect } from "react";
import { generateSafetyReport } from "../utils/ReportGenerator";
import Canvas3D from "../components/Canvas3D";
import Header from "../components/Header";
import Footer from "../components/Footer";

interface CollisionEvent {
  time: number;
  agentId: number;
  objectId: string;
  objectName: string;
  position: number[];
  normal?: number[];
  velocity: number;
  impactSpeed: number;
  injury?: {
    injuryScore: number;
    riskTier: string;
    riskColor: string;
    bodyPart: string;
    specificInjury?: string;
    gForce?: number;
    gForceTier?: string;
    gForceColor?: string;
    gForceAction?: string;
    gForceIcon?: string;
    hic15?: number;
    impactForceN?: number;
    collisionDurationMs?: number;
    components?: any;
    metadata?: any;
  };
}

interface HeatmapObject {
  objectId: string;
  objectName: string;
  boundingBox?: any;
  totalHits: number;
  collisionPositions: number[][];
  maxInjuryScore: number;
  avgInjuryScore: number;
  maxGForce: number;
  avgGForce: number;
  worstGForceTier: string;
  primaryBodyPart: string;
  heatColor: number[];
  intensity: number;
  recommendations: {
    product: string;
    reason: string;
    searchUrl: string;
    priority: string;
  }[];
  fractureCount?: number;
  specificInjuries?: string[];
  maxHIC?: number;
  maxImpactForceN?: number;
  avgCollisionDurationMs?: number;
  bodyPartDistribution?: Record<string, number>;
}

interface SimulationResult {
  id: string;
  progress: number;
  status: "running" | "complete" | "error";
  totalEvents: number;
  events: CollisionEvent[];
  heatmapData?: any;
  timestamp?: number;
  roomSafetyIndex?: {
    score: number;
    grade: string;
    breakdown: any;
  };
}

const Simulator = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [modelPath, setModelPath] = useState<string>("");
  const [sceneData, setSceneData] = useState<any>(null);
  const [simulationPlayback, setSimulationPlayback] = useState<any>(null);
  const [ageGroup, setAgeGroup] = useState<string>("Early Toddler (1-2y)");
  const [agentCount, setAgentCount] = useState<number>(10);
  const [duration, setDuration] = useState<number>(30);
  const [running, setRunning] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string>("");
  const [isBabyView, setIsBabyView] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Debug logging for RSI data
  useEffect(() => {
    if (simResult?.roomSafetyIndex) {
      console.log("RSI Data Updated:", simResult.roomSafetyIndex);
    }
  }, [simResult]);
  const [pollInterval, setPollInterval] = useState<ReturnType<
    typeof setInterval
  > | null>(null);

  const [heatmapData, setHeatmapData] = useState<HeatmapObject[] | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(false);
  const [zoneAnalysis, setZoneAnalysis] = useState<any>(null);

  const [liveAgentPositions, setLiveAgentPositions] = useState<
    { agentId: number; position: number[] }[] | null
  >(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [playbackSeek, setPlaybackSeek] = useState<number | null>(null);
  const [playbackInfo, setPlaybackInfo] = useState<{
    progress: number;
    action: string;
    time: number;
  }>({ progress: 0, action: "idle", time: 0 });

  const token = localStorage.getItem("token");

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.name.endsWith(".glb") || file.name.endsWith(".gltf"))) {
      setUploadedFile(file);
      setFileName(file.name);
      setError("");
    } else {
      setError("Please upload a valid GLB or GLTF file");
    }
  };

  const uploadModel = async (): Promise<string | null> => {
    if (!uploadedFile) {
      setError("Please select a file");
      return null;
    }

    try {
      const formData = new FormData();
      formData.append("model", uploadedFile);

      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      const sceneId = data.sceneId;
      setModelPath(data.filePath); // For 3D preview
      // Validate scene data before setting
      if (data.scene && typeof data.scene === "object") {
        setSceneData(data.scene);
      } else {
        setSceneData(null);
      }
      return sceneId;
    } catch (err) {
      setError(
        "Failed to upload file: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
      return null;
    }
  };

  const startSimulation = async () => {
    // TEMPORARY: Allow starting without file for quick dev testing
    if (!uploadedFile) {
      console.warn(
        "No file uploaded, attempting to start with default scene for testing.",
      );
    }

    setError("");
    setRunning(true);

    try {
      // Upload model first if one is chosen, otherwise fallback to a default mock scene ID
      let sceneId = "mock-scene-id";
      if (uploadedFile) {
        const sid = await uploadModel();
        if (sid) sceneId = sid;
      }

      // Map ageGroup to ageGroupId
      const ageGroupMap: { [key: string]: string } = {
        "Infant (0-1y)": "infant",
        "Early Toddler (1-2y)": "early_toddler",
        "Late Toddler (2-3y)": "late_toddler",
        "Preschool (3-5y)": "preschool",
        "Child (6-10y)": "child",
      };

      // Start simulation
      console.log("[Simulator] Starting simulation...");
      const response = await fetch("/api/simulate/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sceneId,
          ageGroupId: ageGroupMap[ageGroup] || "early_toddler",
          duration,
          agentCount,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to start simulation");
      }

      const data = await response.json();
      const simId = data.simulationId || data.id;

      // Start polling
      pollSimulation(simId);
    } catch (err) {
      setError(
        "Error: " + (err instanceof Error ? err.message : "Unknown error"),
      );
      setRunning(false);
    }
  };

  const pollSimulation = (simId: string) => {
    const newPollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/simulate/${simId}/status`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to get status");
        }

        const status = await response.json();

        // Check if simulation failed on backend
        if (status.status === "error") {
          clearInterval(newPollInterval);
          setRunning(false);
          setPollInterval(null);
          setError(status.error || "Simulation failed on server");
          return;
        }

        // Get collision events
        const eventsResponse = await fetch(`/api/simulate/${simId}/events`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        let events: CollisionEvent[] = [];
        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json();
          // Backend returns { success, events: [...] } — extract the array
          events = Array.isArray(eventsData)
            ? eventsData
            : eventsData.events || [];
        }

        setSimResult({
          id: simId,
          progress: status.progress || 0,
          status: status.status || "running",
          // FIX-C3: Use collisionEventsCount consistently — it counts ALL collisions,
          // whereas events array from /events endpoint only contains hazard events (score≥15).
          totalEvents: status.collisionEventsCount || events.length,
          events,
          timestamp: Date.now(),
        });

        // Update live agent positions and scale during simulation
        if (status.agentPositions && Array.isArray(status.agentPositions)) {
          setLiveAgentPositions(status.agentPositions);
        }

        // Stop polling when complete
        if (status.status === "complete" || status.progress >= 100) {
          clearInterval(newPollInterval);
          setRunning(false);
          setPollInterval(null);
          setLiveAgentPositions(null); // Clear live agents — simulation done

          // Re-fetch collision events now that simulation is complete
          // (During polling, the backend returns 202 with no events while running)
          try {
            const finalEventsResponse = await fetch(
              `/api/simulate/${simId}/events`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            if (finalEventsResponse.ok) {
              const finalEventsData = await finalEventsResponse.json();
              const finalEvents = Array.isArray(finalEventsData)
                ? finalEventsData
                : finalEventsData.events || [];
              setSimResult((prev) =>
                prev
                  ? {
                      ...prev,
                      events: finalEvents,
                      totalEvents: finalEvents.length,
                    }
                  : prev,
              );
            }
          } catch (e) {
            console.warn("Could not re-fetch collision events:", e);
          }

          // Fetch full simulation data for agent playback
          try {
            const simResponse = await fetch(`/api/simulate/${simId}/status`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (simResponse.ok) {
              const simData = await simResponse.json();
              // Validate simulation data structure
              if (simData && typeof simData === "object") {
                // Ensure trajectories is array, provide default if missing
                const validSimData = {
                  ...simData,
                  trajectories: Array.isArray(simData.trajectories)
                    ? simData.trajectories
                    : [],
                  config: simData.config || { fps: 60, duration: 30 },
                };
                setSimulationPlayback(validSimData);
              } else {
                console.warn(
                  "[Simulator] Invalid simulation data structure:",
                  simData,
                );
              }
            }
          } catch (e) {
            console.warn("Could not load playback data", e);
          }

          // Fetch heatmap data
          try {
            const heatmapResponse = await fetch(
              `/api/simulate/${simId}/heatmap`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            if (heatmapResponse.ok) {
              const heatData = await heatmapResponse.json();
              if (
                heatData.success &&
                heatData.heatmap &&
                Array.isArray(heatData.heatmap)
              ) {
                setHeatmapData(heatData.heatmap);
                setShowHeatmap(true); // Auto-show heatmap when data arrives
                // Extract Room Safety Index from heatmap response
                if (heatData.roomSafetyIndex) {
                  setSimResult((prev) =>
                    prev
                      ? { ...prev, roomSafetyIndex: heatData.roomSafetyIndex }
                      : prev,
                  );
                }
                // Extract Zone Analysis data
                if (heatData.zoneAnalysis) {
                  setZoneAnalysis(heatData.zoneAnalysis);
                }
              }
            }
          } catch (e) {
            console.warn("Could not load heatmap data", e);
          }
        }
      } catch (err) {
        console.error("Poll error:", err);
        if (newPollInterval) clearInterval(newPollInterval);
        setRunning(false);
        setError("Simulation connection lost. Please try again.");
        setPollInterval(null);
      }
    }, 2000);

    setPollInterval(newPollInterval);
  };

  const exportToExcel = () => {
    if (!simResult) return;

    try {
      const headers = [
        "Time (s)",
        "Agent",
        "Object",
        "Position",
        "Impact Speed",
        "Body Part",
        "Injury Score",
        "Risk",
      ];
      const rows = simResult.events.map((evt) => [
        (evt.time ?? 0).toFixed(2),
        `Agent ${evt.agentId}`,
        evt.objectName || evt.objectId || "Unknown",
        evt.position
          ? `(${evt.position[0]?.toFixed(2)}, ${evt.position[1]?.toFixed(2)}, ${evt.position[2]?.toFixed(2)})`
          : "(0,0,0)",
        (evt.impactSpeed ?? 0).toFixed(2),
        evt.injury?.bodyPart || "unknown",
        evt.injury?.injuryScore ?? 0,
        evt.injury?.riskTier || "safe",
      ]);

      const csv = [headers, ...rows]
        .map((row: any) => row.map((cell: any) => `"${cell}"`).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `simulation-${simResult.id}-${Date.now()}.csv`;
      a.click();
    } catch (err) {
      setError(
        "Export failed: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
    }
  };

  const handleScreenshot = () => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const canvas = container.querySelector("canvas");
    if (!canvas) return;
    try {
      const link = document.createElement("a");
      link.download = `safehome-screenshot-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.warn("Screenshot failed:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1D] text-[#FDFDFD] font-sans selection:bg-[#FFE4A0]/30 selection:text-[#FFE4A0] relative overflow-hidden">
      {/* MAGICAL FAIRY DUST BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj4KICA8ZyBmaWxsPSIjRkZFNEEwIj4KICAgIDxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjEiIG9wYWNpdHk9IjAuOCIgLz4KICAgIDxjaXJjbGUgY3g9IjE1MCIgY3k9IjI1MCIgcj0iMS41IiBvcGFjaXR5PSIwLjUiIC8+CiAgICA8Y2lyY2xlIGN4PSIyNTAiIGN5PSIxMjAiIHI9IjIiIG9wYWNpdHk9IjAuMyIgLz4KICAgIDxjaXJjbGUgY3g9IjMzMCIgY3k9IjMyMCIgcj0iMSIgb3BhY2l0eT0iMC42IiAvPgogICAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMzUwIiByPSIwLjUiIG9wYWNpdHk9IjAuOSIgLz4KICA8L2c+Cjwvc3ZnPg==')] [background-size:200px_200px] animate-[pulse_4s_ease-in-out_infinite] z-0" />
      
      <div className="relative z-20">
        <Header />
      </div>

      {/* --- Main Simulator Interface --- */}
      <section
        id="simulator"
        className="relative z-10 min-h-screen pt-24 pb-16 px-5"
      >
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <span 
              className="text-xs font-bold text-[#FFE4A0]/70 tracking-widest uppercase italic"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Configuration Panel
            </span>
            <h2 
              className="text-3xl font-black text-[#FFE4A0] mt-1"
              style={{ fontFamily: "'Cinzel Decorative', serif", textShadow: "0 2px 10px rgba(255,228,160,0.2)" }}
            >
              Simulation Controls
            </h2>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/40 border border-red-500 rounded-xl text-red-200 font-bold backdrop-blur-sm shadow-[0_0_15px_rgba(255,0,0,0.2)]">
              ❌ {error}
            </div>
          )}

          {/* Control Panel */}
          <div className="p-5 mb-6 space-y-4 bg-[#0A0F1D]/60 backdrop-blur-md border border-[#FFE4A0]/30 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            <div className="flex flex-wrap gap-4 items-end">
              {/* File Upload */}
              <div>
                <label 
                  className="block text-sm font-bold text-[#FFE4A0]/90 mb-1.5 italic"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  📂 Environment Model (GLB/GLTF)
                </label>
                <label className="cursor-pointer bg-[#0A0F1D]/80 px-4 py-2 flex items-center justify-center rounded-xl shadow-inner border border-[#FFE4A0]/40 hover:border-[#FFE4A0] hover:shadow-[0_0_10px_rgba(255,228,160,0.2)] transition-all font-bold text-sm min-w-[160px] h-11 group">
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="text-[#FDFDFD] group-hover:text-[#FFE4A0] transition-colors truncate max-w-[200px]">
                    {fileName || "Select File..."}
                  </span>
                </label>
              </div>

              {/* Age Group */}
              <div>
                <label 
                  className="block text-sm font-bold text-[#FFE4A0]/90 mb-1.5 italic"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  👶 Subject Age Group
                </label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#FFE4A0]/40 bg-[#0A0F1D]/80 text-[#FDFDFD] font-bold text-sm h-11 shadow-inner focus:border-[#FFE4A0] outline-none hover:border-[#FFE4A0]/70 transition-all cursor-pointer"
                >
                  <option className="bg-[#0A0F1D] text-[#FDFDFD]">Infant (0-1y)</option>
                  <option className="bg-[#0A0F1D] text-[#FDFDFD]">Early Toddler (1-2y)</option>
                  <option className="bg-[#0A0F1D] text-[#FDFDFD]">Late Toddler (2-3y)</option>
                  <option className="bg-[#0A0F1D] text-[#FDFDFD]">Preschool (3-5y)</option>
                  <option className="bg-[#0A0F1D] text-[#FDFDFD]">Child (6-10y)</option>
                </select>
              </div>

              {/* Agent Count */}
              <div>
                <label 
                  className="block text-sm font-bold text-[#FFE4A0]/90 mb-1.5 italic"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  👥 Agent Count
                </label>
                <input
                  type="number"
                  min="5"
                  max="20"
                  value={agentCount}
                  onChange={(e) => setAgentCount(Number(e.target.value))}
                  className="w-24 px-4 py-2 rounded-xl border border-[#FFE4A0]/40 bg-[#0A0F1D]/80 text-[#FDFDFD] font-bold text-sm h-11 shadow-inner focus:border-[#FFE4A0] outline-none hover:border-[#FFE4A0]/70 transition-all text-center"
                />
              </div>

              {/* Duration */}
              <div>
                <label 
                  className="block text-sm font-bold text-[#FFE4A0]/90 mb-1.5 italic"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  ⏱️ Duration (seconds)
                </label>
                <input
                  type="number"
                  min="5"
                  max="30"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-24 px-4 py-2 rounded-xl border border-[#FFE4A0]/40 bg-[#0A0F1D]/80 text-[#FDFDFD] font-bold text-sm h-11 shadow-inner focus:border-[#FFE4A0] outline-none hover:border-[#FFE4A0]/70 transition-all text-center"
                />
              </div>

              {/* Run Button */}
              <button
                onClick={startSimulation}
                disabled={running || !uploadedFile}
                className="px-8 h-11 rounded-xl font-black shadow-[0_0_15px_rgba(212,175,55,0.3)] bg-gradient-to-br from-[#FFE4A0] via-[#D4AF37] to-[#996515] text-[#3A2B00] hover:shadow-[0_0_25px_rgba(212,175,55,0.5)] hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm uppercase tracking-wider relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 -skew-x-12 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                <span className="relative z-10">{running ? "⏳ Processing..." : "▶ Run Simulation"}</span>
              </button>
            </div>

            {/* View Tools Row */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-[#FFE4A0]/20 mt-2">
              <button
                onClick={() => setIsBabyView(!isBabyView)}
                className={`px-5 py-2 rounded-xl font-bold text-xs transition-all border ${
                  isBabyView
                    ? "bg-[#FFE4A0]/20 border-[#FFE4A0] text-[#FFE4A0] shadow-[0_0_15px_rgba(255,228,160,0.3)]"
                    : "bg-[#0A0F1D] border-[#FFE4A0]/30 text-[#FDFDFD] hover:border-[#FFE4A0]/70 hover:bg-[#FFE4A0]/10 hover:shadow-[0_0_10px_rgba(255,228,160,0.1)]"
                }`}
              >
                {isBabyView ? "👁️ Child-Eye View Active" : "👁️ Child-Eye View"}
              </button>
              <button
                onClick={handleScreenshot}
                className="px-5 py-2 rounded-xl font-bold text-xs bg-[#0A0F1D] border border-[#FFE4A0]/30 text-[#FDFDFD] hover:border-[#FFE4A0]/70 hover:bg-[#FFE4A0]/10 hover:shadow-[0_0_10px_rgba(255,228,160,0.1)] transition-all"
              >
                📸 Screenshot
              </button>
            </div>
          </div>

          {/* --- Progress Indicator --- */}
          {running && simResult && (
            <div className="mb-5 p-4 bg-[#0A0F1D]/60 backdrop-blur-md border border-[#FFE4A0]/30 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
              <div className="flex justify-between items-center mb-2">
                <span 
                  className="font-bold text-[#FFE4A0] text-sm italic tracking-wide"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  Running Simulation...
                </span>
                <span className="font-black text-lg text-[#D4AF37]" style={{ textShadow: "0 0 10px rgba(212,175,55,0.5)" }}>
                  {simResult.progress}%
                </span>
              </div>
              <div className="w-full h-3 bg-[#0A0F1D] border border-[#FFE4A0]/20 rounded-full overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-[#D4AF37] to-[#FFE4A0] shadow-[0_0_15px_rgba(255,228,160,0.8)] transition-all duration-300 relative"
                  style={{ width: `${simResult.progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite] -skew-x-12" />
                </div>
              </div>
            </div>
          )}

          {/* --- 3D Visualization --- */}
          <div
            ref={canvasContainerRef}
            className="h-[420px] rounded-2xl border-2 border-[#D4AF37] shadow-[0_0_30px_rgba(212,175,55,0.2)] bg-[#0A0F1D] relative overflow-hidden mb-6"
          >
            <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-[#FFE4A0]/20 rounded-2xl z-10" />
            
            {isBabyView && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-5 py-2 rounded-full bg-[#0A0F1D]/90 border border-[#FFE4A0] text-[#FFE4A0] text-sm font-bold backdrop-blur-md shadow-[0_0_15px_rgba(255,228,160,0.3)] animate-pulse-glow italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                👁️ Child-Eye View — Camera at eye level (~60cm)
              </div>
            )}
            <Canvas3D
              modelPath={modelPath}
              sceneData={sceneData}
              sceneUnitScale={
                simulationPlayback?.config?.scaleFactor ||
                sceneData?._scaleFactor ||
                1.0
              }
              simulationPlayback={simulationPlayback}
              heatmapData={heatmapData}
              showHeatmap={showHeatmap}
              liveAgentPositions={liveAgentPositions}
              selectedAgentId={selectedAgentId}
              onPlaybackUpdate={setPlaybackInfo}
              playbackPaused={playbackPaused}
              playbackSeek={playbackSeek}
              showBoundingBoxes={showBoundingBoxes}
              isBabyView={isBabyView}
            />
          </div>

          {/* ── Agent Selector Bar ── */}
          {simulationPlayback?.trajectories &&
            simulationPlayback.trajectories.length > 0 && (
              <div className="p-4 mb-5 bg-[#0A0F1D]/60 backdrop-blur-md border border-[#FFE4A0]/30 rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 
                    className="text-lg font-black text-[#FFE4A0]"
                    style={{ fontFamily: "'Cinzel Decorative', serif" }}
                  >
                    🔍 Agent Inspector
                  </h3>
                  {selectedAgentId !== null && (
                     <button
                       onClick={() => setSelectedAgentId(null)}
                       className="text-xs px-4 py-1.5 rounded-full bg-transparent border border-[#FFE4A0]/30 text-[#FDFDFD] hover:bg-[#FFE4A0]/20 hover:border-[#FFE4A0] font-bold transition-all"
                     >
                       Show All Agents
                     </button>
                   )}
                </div>
                <div
                  className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar"
                >
                  {simulationPlayback.trajectories.map(
                    (traj: any, i: number) => {
                      const agentColors = [
                        "#00bcd4",
                        "#4caf50",
                        "#ff9800",
                        "#e91e63",
                        "#9c27b0",
                        "#2196f3",
                        "#cddc39",
                        "#ff5722",
                        "#00e676",
                        "#f44336",
                      ];
                      const color = agentColors[i % agentColors.length];
                      const isSelected =
                        selectedAgentId === (traj.agentId ?? i);
                      const collisions = Array.isArray(traj.collisions)
                        ? traj.collisions.length
                        : (traj.collisions ?? 0);
                      const distance = traj.finalState?.totalDistance ?? 0;
                      return (
                        <button
                          type="button"
                          key={traj.agentId ?? i}
                          onClick={() =>
                            setSelectedAgentId(
                              isSelected ? null : (traj.agentId ?? i),
                            )
                          }
                          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 cursor-pointer ${
                            isSelected
                              ? "border-[#FFE4A0] bg-[#FFE4A0]/20 shadow-[0_0_15px_rgba(255,228,160,0.3)] scale-105"
                              : selectedAgentId !== null
                                ? "border-[#FFE4A0]/10 bg-[#0A0F1D]/40 opacity-50 hover:opacity-80 text-[#FDFDFD]"
                                : "border-[#FFE4A0]/30 bg-[#0A0F1D] text-[#FDFDFD] hover:border-[#FFE4A0]/70 hover:bg-[#FFE4A0]/10"
                          }`}
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0 shadow-[0_0_5px_currentColor]"
                            style={{ backgroundColor: color, color: color }}
                          />
                          <span className={`font-bold text-sm ${isSelected ? "text-[#FFE4A0]" : "text-[#FDFDFD]"}`}>
                            Agent {traj.agentId ?? i}
                          </span>
                          {collisions > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-900/60 border border-red-500/50 text-red-200 font-bold">
                              {collisions}
                            </span>
                          )}
                          <span className="text-[10px] text-[#FFE4A0]/50 ml-1">
                            {distance.toFixed(1)}m
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>

                {/* Agent Detail Panel */}
                {selectedAgentId !== null &&
                  (() => {
                    const traj = simulationPlayback.trajectories.find(
                      (t: any) => (t.agentId ?? 0) === selectedAgentId,
                    );
                    if (!traj) return null;
                    const fs = traj.finalState || {};
                    const agentColors = [
                      "#00bcd4",
                      "#4caf50",
                      "#ff9800",
                      "#e91e63",
                      "#9c27b0",
                      "#2196f3",
                      "#cddc39",
                      "#ff5722",
                      "#00e676",
                      "#f44336",
                    ];
                    const color =
                      agentColors[(traj.agentId ?? 0) % agentColors.length];
                    // Count this agent's non-safe events from simResult
                    const agentEvents =
                      simResult?.events?.filter(
                        (e) => e.agentId === selectedAgentId,
                      ) || [];
                    const nonSafeEvents = agentEvents.filter(
                      (e) =>
                        (e.injury?.riskTier || "safe").toLowerCase() !== "safe",
                    );

                    // Age group properties lookup — dùng đúng ID mới (v5)
                    const ageGroupNames: Record<
                      string,
                      {
                        label: string;
                        height: string;
                        speed: string;
                        capabilities: string;
                        attracted: string;
                      }
                    > = {
                      infant: {
                        label: "Infant (0-1y)",
                        height: "0.70m",
                        speed: "0.1-0.3 m/s (crawl)",
                        capabilities: "Crawl, Roll",
                        attracted: "Bright lights, Faces, Rattles",
                      },
                      early_toddler: {
                        label: "Early Toddler (1-2y)",
                        height: "0.82m",
                        speed: "0.3-0.8 m/s (walk unsteady)",
                        capabilities: "Walk (unsteady), Crawl, Climb low",
                        attracted: "Colorful objects, Doors, Stairs",
                      },
                      late_toddler: {
                        label: "Late Toddler (2-3y)",
                        height: "0.94m",
                        speed: "0.5-1.2 m/s (walk/run burst)",
                        capabilities: "Walk, Run (burst), Climb, Push",
                        attracted: "Furniture edges, Windows, Moving objects",
                      },
                      preschool: {
                        label: "Preschool (3-5y)",
                        height: "1.10m",
                        speed: "0.5-1.5 m/s (walk/run)",
                        capabilities: "Walk, Run, Climb, Jump",
                        attracted: "Toys, Furniture edges, Windows",
                      },
                      child: {
                        label: "Child (6-10y)",
                        height: "1.30m",
                        speed: "0.8-2.5 m/s (run)",
                        capabilities: "Walk, Run, Sprint, Climb, Jump",
                        attracted: "Electronics, High surfaces, Doors",
                      },
                    };
                    const ageId =
                      traj.ageGroupId ||
                      simulationPlayback.config?.ageGroupId ||
                      "early_toddler";
                    const ageMeta =
                      ageGroupNames[ageId] || ageGroupNames["early_toddler"];

                    return (
                      <div className="mt-5 p-5 rounded-2xl border border-[#D4AF37]/50 bg-[#0A0F1D]/80 shadow-[inset_0_0_20px_rgba(212,175,55,0.05)] text-[#FDFDFD]">
                        <div className="flex items-center gap-3 mb-4 border-b border-[#FFE4A0]/20 pb-3">
                          <div
                            className="w-5 h-5 rounded-full shadow-[0_0_10px_currentColor]"
                            style={{ backgroundColor: color, color: color }}
                          />
                          <h4 
                            className="font-black text-xl text-[#FFE4A0]"
                            style={{ fontFamily: "'Cinzel Decorative', serif" }}
                          >
                            Agent {selectedAgentId} — <span className="text-[#FDFDFD] text-lg font-sans font-medium">{ageMeta.label}</span>
                          </h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                          <div className="bg-[#0A0F1D] rounded-xl p-3 border border-[#FFE4A0]/20 shadow-inner">
                            <div className="text-xs text-[#FFE4A0]/70 font-bold uppercase tracking-wider mb-1">
                              Height
                            </div>
                            <div className="font-black text-[#FDFDFD] text-lg">
                              {ageMeta.height}
                            </div>
                          </div>
                          <div className="bg-[#0A0F1D] rounded-xl p-3 border border-[#FFE4A0]/20 shadow-inner">
                            <div className="text-xs text-[#FFE4A0]/70 font-bold uppercase tracking-wider mb-1">
                              Speed Range
                            </div>
                            <div className="font-bold text-[#FDFDFD] text-sm">
                              {ageMeta.speed}
                            </div>
                          </div>
                          <div className="bg-[#0A0F1D] rounded-xl p-3 border border-[#FFE4A0]/20 shadow-inner">
                            <div className="text-xs text-[#FFE4A0]/70 font-bold uppercase tracking-wider mb-1">
                              Distance
                            </div>
                            <div className="font-black text-[#D4AF37] text-lg">
                              {(fs.totalDistance ?? 0).toFixed(1)}m
                            </div>
                          </div>
                          <div className="bg-[#0A0F1D] rounded-xl p-3 border border-[#FFE4A0]/20 shadow-inner">
                            <div className="text-xs text-[#FFE4A0]/70 font-bold uppercase tracking-wider mb-1">
                              Fatigue
                            </div>
                            <div className="font-black text-orange-400 text-lg">
                              {((fs.fatigue ?? 0) * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                          <div className="bg-[#0A0F1D] rounded-xl p-4 border border-[#FFE4A0]/20 shadow-inner">
                            <div className="text-xs text-[#FFE4A0]/70 font-bold uppercase tracking-wider mb-1">
                              Capabilities
                            </div>
                            <div className="text-sm text-[#FDFDFD]/90">
                              {ageMeta.capabilities}
                            </div>
                          </div>
                          <div className="bg-[#0A0F1D] rounded-xl p-4 border border-[#FFE4A0]/20 shadow-inner">
                            <div className="text-xs text-[#FFE4A0]/70 font-bold uppercase tracking-wider mb-1">
                              Attracted To
                            </div>
                            <div className="text-sm text-[#FDFDFD]/90">
                              {ageMeta.attracted}
                            </div>
                          </div>
                        </div>
                        {nonSafeEvents.length > 0 && (
                          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
                            <div className="text-sm font-bold text-red-300 mb-3">
                              Risk Events Encountered ({nonSafeEvents.length})
                            </div>
                            <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                              {nonSafeEvents.slice(0, 8).map((evt, idx) => {
                                const rawName = evt.objectName || "Unknown";
                                const cleanName =
                                  rawName.replace(/[^\x20-\x7E]/g, "").trim() ||
                                  `Object_${idx}`;
                                const tier = (
                                  evt.injury?.riskTier || "safe"
                                ).toLowerCase();
                                const tierColor =
                                  tier === "critical"
                                    ? "text-red-400"
                                    : tier === "dangerous"
                                      ? "text-orange-400"
                                      : tier === "warning"
                                        ? "text-yellow-400"
                                        : "text-amber-400";
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-3 text-xs bg-[#0A0F1D] border border-red-500/20 rounded-lg px-4 py-2"
                                  >
                                    <span className="text-[#FFE4A0]/50 font-mono">
                                      {(evt.time ?? 0).toFixed(2)}s
                                    </span>
                                    <span className="font-bold text-[#FDFDFD]">
                                      {cleanName}
                                    </span>
                                    <span className="text-[#FDFDFD]/70 italic hidden sm:inline">
                                      ({evt.injury?.bodyPart})
                                    </span>
                                    <span className={`font-black uppercase tracking-wider ${tierColor} ml-auto`}>
                                      {evt.injury?.riskTier}
                                    </span>
                                    <span className="text-[#FFE4A0]/50">
                                      Score: {evt.injury?.injuryScore ?? 0}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {nonSafeEvents.length === 0 && (
                          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 text-sm text-green-400 font-bold">
                            No risk events detected for this agent
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* ── Film Reel Playback Controls ── */}
                {selectedAgentId !== null &&
                  simulationPlayback?.trajectories && (
                    <div className="mt-5 p-5 rounded-2xl border border-[#FFE4A0]/30 bg-[#0A0F1D] shadow-[0_0_20px_rgba(0,0,0,0.8)] relative overflow-hidden">
                      <div className="absolute inset-x-0 -top-10 h-20 bg-[#FFE4A0]/5 blur-[50px] pointer-events-none" />
                      <div className="flex items-center gap-3 mb-4">
                        <h4 
                          className="font-black text-sm text-[#FFE4A0] tracking-widest uppercase italic"
                          style={{ fontFamily: "'Cormorant Garamond', serif" }}
                        >
                          ▶ Trajectory Playback
                        </h4>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        {/* Play/Pause Button */}
                        <button
                          onClick={() => setPlaybackPaused(!playbackPaused)}
                          className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-xl font-black transition-all border-2 ${
                            playbackPaused
                              ? "bg-transparent border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/20 shadow-[0_0_15px_rgba(212,175,55,0.4)]"
                              : "bg-[#D4AF37] border-[#D4AF37] text-[#3A2B00] hover:brightness-110 shadow-[0_0_20px_rgba(212,175,55,0.6)]"
                          }`}
                        >
                          {playbackPaused ? "▶" : "⏸"}
                        </button>

                        {/* Timeline Scrubber */}
                        <div className="flex-1">
                          <input
                            type="range"
                            min={0}
                            max={1000}
                            value={Math.round(playbackInfo.progress * 1000)}
                            onChange={(e) => {
                              const val = Number(e.target.value) / 1000;
                              setPlaybackSeek(val);
                              // Clear seek after a frame so it doesn't re-seek
                              requestAnimationFrame(() =>
                                setPlaybackSeek(null),
                              );
                            }}
                            className="w-full h-2.5 rounded-full appearance-none bg-[#0A0F1D] border border-[#FFE4A0]/30 cursor-pointer shadow-inner relative z-10"
                            style={{
                              background: `linear-gradient(to right, #D4AF37 ${playbackInfo.progress * 100}%, rgba(10,15,30,0.8) ${playbackInfo.progress * 100}%)`,
                            }}
                          />
                        </div>

                        {/* Action + Timestamp */}
                        <div className="flex-shrink-0 flex items-center gap-2 bg-[#0A0F1D]/80 rounded-xl px-4 py-2 border border-[#FFE4A0]/40 shadow-[0_0_10px_rgba(255,228,160,0.1)]">
                          <span className="text-lg">
                            {{
                              crawl: "🐛",
                              walk: "🚶",
                              run: "🏃",
                              sprint: "💨",
                              climb: "🧗",
                              stumble: "⚠️",
                              fall: "💥",
                              idle: "😴",
                              reach: "🤚",
                              explore: "👀",
                              interact: "🖐️",
                              pull: "🔧",
                              push: "💪",
                              roll: "🔄",
                            }[playbackInfo.action] || "🔹"}
                          </span>
                          <span className="font-bold text-sm text-[#FDFDFD] capitalize w-16">
                            {playbackInfo.action}
                          </span>
                          <span className="text-xs text-[#FFE4A0]/70 font-mono w-10 text-right">
                            {playbackInfo.time.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}

          {/* --- Simulation Results --- */}
          {simResult && (
            <div className="space-y-5">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#0A0F1D]/80 border border-[#FFE4A0]/20 shadow-[inset_0_0_15px_rgba(255,228,160,0.05)] rounded-2xl p-4 text-center">
                  <div className="text-3xl font-black text-[#D4AF37]" style={{ textShadow: "0 0 15px rgba(212,175,55,0.4)" }}>
                    {simResult.progress}%
                  </div>
                  <div className="text-xs font-bold text-[#FFE4A0]/70 mt-1 uppercase tracking-widest italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    Progress
                  </div>
                </div>
                <div className="bg-[#0A0F1D]/80 border border-[#FFE4A0]/20 shadow-[inset_0_0_15px_rgba(255,228,160,0.05)] rounded-2xl p-4 text-center">
                  <div className="text-3xl font-black text-[#FDFDFD]">
                    {simResult.totalEvents}
                  </div>
                  <div className="text-xs font-bold text-[#FFE4A0]/70 mt-1 uppercase tracking-widest italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    Collision Events
                  </div>
                </div>
                <div className="bg-[#0A0F1D]/80 border border-[#FFE4A0]/20 shadow-[inset_0_0_15px_rgba(255,228,160,0.05)] rounded-2xl p-4 text-center">
                  <div
                    className={
                      "text-3xl font-black " +
                      (simResult.status === "complete"
                        ? "text-[#FFE4A0]"
                        : "text-[#D4AF37] animate-pulse")
                    }
                    style={{ textShadow: "0 0 10px currentColor" }}
                  >
                    {simResult.status === "complete" ? "Done" : "..."}
                  </div>
                  <div className="text-xs font-bold text-[#FFE4A0]/70 mt-1 uppercase tracking-widest italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    {simResult.status === "complete" ? "Complete" : "Processing..."}
                  </div>
                </div>
              </div>

              {/* Collision Events Table */}
              {simResult.events.length > 0 && (
                <div className="bg-[#0A0F1D]/90 border border-[#FFE4A0]/30 shadow-[0_0_30px_rgba(0,0,0,0.6)] rounded-2xl p-6">
                  <h3 
                    className="text-xl font-black text-[#FFE4A0] mb-4"
                    style={{ fontFamily: "'Cinzel Decorative', serif" }}
                  >
                    Collision Event Log
                  </h3>
                  <div className="overflow-x-auto custom-scrollbar pb-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#FFE4A0]/30">
                          <th className="text-left py-3 px-4 font-bold text-[#FFE4A0] uppercase tracking-wider text-xs">
                            Time
                          </th>
                          <th className="text-left py-3 px-4 font-bold text-[#FFE4A0] uppercase tracking-wider text-xs">
                            Agent
                          </th>
                          <th className="text-left py-3 px-4 font-bold text-[#FFE4A0] uppercase tracking-wider text-xs">
                            Object
                          </th>
                          <th className="text-left py-3 px-4 font-bold text-[#FFE4A0] uppercase tracking-wider text-xs hidden md:table-cell">
                            Position
                          </th>
                          <th className="text-left py-3 px-4 font-bold text-[#FFE4A0] uppercase tracking-wider text-xs">
                            Injury Score
                          </th>
                          <th className="text-left py-3 px-4 font-bold text-[#FFE4A0] uppercase tracking-wider text-xs">
                            Risk Level
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {simResult.events
                          .filter((evt) => !!evt)
                          .sort((a, b) => {
                            // Sort by severity: critical > dangerous > warning > watch > safe
                            const tierOrder: Record<string, number> = {
                              critical: 0,
                              dangerous: 1,
                              warning: 2,
                              watch: 3,
                              safe: 4,
                            };
                            const aTier = (
                              a.injury?.riskTier || "safe"
                            ).toLowerCase();
                            const bTier = (
                              b.injury?.riskTier || "safe"
                            ).toLowerCase();
                            return (
                              (tierOrder[aTier] ?? 5) - (tierOrder[bTier] ?? 5)
                            );
                          })
                          .slice(0, 30)
                          .map((evt, idx) => {
                            const riskTierRaw = evt.injury?.riskTier || "Safe";
                            const riskTier = riskTierRaw.toLowerCase();
                            const gForceTier =
                              evt.injury?.gForceTier || "Observe";
                            const riskColor =
                              riskTier === "critical"
                                ? "bg-red-900/50 text-red-300 border border-red-500/50"
                                : riskTier === "dangerous"
                                  ? "bg-orange-900/50 text-orange-300 border border-orange-500/50"
                                  : riskTier === "warning"
                                    ? "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50"
                                    : riskTier === "watch"
                                      ? "bg-amber-900/30 text-amber-400 border border-amber-500/30"
                                      : "bg-[#0A0F1D] text-[#FFE4A0] border border-[#FFE4A0]/20";
                            const gForceColor =
                              gForceTier === "Serious Injury"
                                ? "text-red-400"
                                : gForceTier === "Soft Injury"
                                  ? "text-orange-400"
                                  : "text-[#FFE4A0]/70";
                            // Clean object name: replace unreadable characters with readable fallback
                            const rawName =
                              evt.objectName || evt.objectId || "Unknown";
                            const cleanObjectName =
                              rawName.replace(/[^\x20-\x7E]/g, "").trim() ||
                              `Object_${idx}`;
                            return (
                              <tr
                                key={idx}
                                className="border-b border-[#FFE4A0]/10 hover:bg-[#FFE4A0]/5 transition-colors"
                              >
                                <td className="py-4 px-4 text-[#FFE4A0]/70 font-mono">
                                  {(evt.time ?? 0).toFixed(2)}s
                                </td>
                                <td className="py-4 px-4 font-bold text-[#FDFDFD]">
                                  Agent {evt.agentId}
                                </td>
                                <td className="py-4 px-4 font-medium text-[#FFE4A0]">
                                  {cleanObjectName}
                                </td>
                                <td className="py-4 px-4 text-xs font-mono text-[#FDFDFD]/50 hidden md:table-cell">
                                  ({evt.position?.[0]?.toFixed(1) ?? 0},{" "}
                                  {evt.position?.[1]?.toFixed(1) ?? 0},{" "}
                                  {evt.position?.[2]?.toFixed(1) ?? 0})
                                </td>
                                <td className="py-4 px-4">
                                  <span className="font-bold text-[#FDFDFD]">
                                    {evt.injury?.injuryScore ?? 0}
                                  </span>
                                  <span className="text-xs text-[#FFE4A0]/50 ml-2 italic">
                                    ({evt.injury?.bodyPart})
                                  </span>
                                  {evt.injury?.gForce != null && (
                                    <span
                                      className={`text-xs w-16 inline-block font-bold ml-3 ${gForceColor}`}
                                    >
                                      {evt.injury.gForce.toFixed(1)}g
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 px-4">
                                  <span
                                    className={`px-3 py-1.5 rounded-md text-[11px] uppercase tracking-wider font-bold ${riskColor}`}
                                  >
                                    {riskTierRaw}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  {(() => {
                    const total = simResult.events.filter((e) => !!e).length;
                    const nonSafeCount = simResult.events.filter(
                      (e) =>
                        e &&
                        (e.injury?.riskTier || "safe").toLowerCase() !== "safe",
                    ).length;
                    return (
                      <p className="text-[#FFE4A0]/50 mt-5 text-sm italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                        Showing {Math.min(total, 30)} of {total} events
                        {nonSafeCount > 0 && (
                          <span className="font-bold text-orange-400 ml-2 not-italic font-sans">
                            ({nonSafeCount} elevated risk events)
                          </span>
                        )}
                        {nonSafeCount === 0 && (
                          <span className="text-green-400 ml-2 not-italic font-sans">
                            (All events within safe range)
                          </span>
                        )}
                      </p>
                    );
                  })()}
                </div>
              )}

              {/* No Events Message */}
              {simResult.events.length === 0 &&
                simResult.status === "complete" && (
                  <div className="bg-[#0A0F1D]/80 border border-[#D4AF37]/50 shadow-[inset_0_0_30px_rgba(212,175,55,0.1)] rounded-2xl p-10 text-center">
                    <p 
                      className="text-3xl font-black text-[#FFE4A0]"
                      style={{ fontFamily: "'Cinzel Decorative', serif", textShadow: "0 0 15px rgba(255,228,160,0.4)" }}
                    >
                      No Hazards Detected
                    </p>
                    <p 
                      className="text-[#FDFDFD]/90 mt-3 text-lg italic"
                      style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    >
                      The simulation detected no collision hazards. The environment is safe for this age group.
                    </p>
                  </div>
                )}
            </div>
          )}

          {/* ── RESULTS DASHBOARD ────────────────────────────────────── */}
          {simResult && (
            <div className="bg-[#0A0F1D]/80 rounded-2xl shadow-[0_0_30px_rgba(212,175,55,0.2)] border border-[#D4AF37]/50 overflow-hidden animate-fade-in-up mt-8 relative">
              <div className="absolute inset-0 bg-[#FFE4A0]/5 pointer-events-none" />
              <div className="bg-gradient-to-r from-[#0A0F1D] via-[#FFE4A0]/10 to-[#0A0F1D] border-b border-[#FFE4A0]/30 px-5 py-4 flex flex-wrap justify-between items-center gap-4 relative z-10">
                <h2 
                  className="text-xl font-black flex items-center gap-3 text-[#FFE4A0] style={{ textShadow: '0 0 10px rgba(255,228,160,0.3)' }}"
                  style={{ fontFamily: "'Cinzel Decorative', serif" }}
                >
                  Safety Analysis Report
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      showHeatmap
                        ? "bg-[#FFE4A0]/20 border-[#FFE4A0] text-[#FFE4A0] shadow-[0_0_15px_rgba(255,228,160,0.3)]"
                        : "bg-transparent border-[#FFE4A0]/30 text-[#FDFDFD] hover:bg-[#FFE4A0]/10"
                    }`}
                  >
                    {showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
                  </button>
                  <button
                    onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      showBoundingBoxes
                        ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                        : "bg-transparent border-[#FFE4A0]/30 text-[#FDFDFD] hover:bg-[#FFE4A0]/10"
                    }`}
                  >
                    {showBoundingBoxes ? "Hide Bounding Boxes" : "Show Bounding Boxes"}
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="px-4 py-2 bg-[#0A0F1D] border border-[#FFE4A0]/30 hover:border-[#FFE4A0] hover:bg-[#FFE4A0]/10 rounded-xl text-xs font-bold text-[#FDFDFD] transition-all"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => {
                      if (simResult && simResult.roomSafetyIndex) {
                        generateSafetyReport({
                          id: simResult.id,
                          roomSafetyIndex: simResult.roomSafetyIndex,
                          heatmap: heatmapData || [],
                          config: { ageGroup, duration },
                          stats: { totalEvents: simResult.totalEvents },
                        });
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-br from-[#FFE4A0] to-[#D4AF37] hover:brightness-110 text-[#3A2B00] rounded-xl text-xs font-black shadow-[0_0_15px_rgba(212,175,55,0.3)] transition-all"
                  >
                    Generate PDF Report
                  </button>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-5 relative z-10">
                {/* RSI Score Card */}
                <div className="col-span-1 md:col-span-2 bg-[#0A0F1D] rounded-2xl p-6 border border-[#FFE4A0]/30 shadow-inner relative overflow-hidden flex flex-col justify-center">
                  <div className="absolute -right-4 -top-8 text-8xl opacity-5 pointer-events-none grayscale sepia hue-rotate-[30deg]">
                    🛡️
                  </div>
                  <h3 
                    className="text-[#FFE4A0] text-sm font-bold uppercase tracking-widest italic mb-2"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    Room Safety Grade
                  </h3>
                  <div className="flex items-end gap-3 gap-y-1 flex-wrap mb-4">
                    <span
                      className="text-6xl font-black leading-none drop-shadow-[0_0_20px_currentColor]"
                      style={{
                        fontFamily: "'Cinzel Decorative', serif",
                        color: simResult.roomSafetyIndex?.grade === "S" ||
                        simResult.roomSafetyIndex?.grade === "A"
                          ? "#FFE4A0" // Gold for safe
                          : simResult.roomSafetyIndex?.grade === "B"
                            ? "#F4C842" 
                            : "#FF5722" // Orange/Red for dangerous
                      }}
                    >
                      {simResult.roomSafetyIndex?.grade || "-"}
                    </span>
                    <span className="text-xl font-black text-[#FFE4A0]/50 mb-1">
                      / {simResult.roomSafetyIndex?.score ?? 0}
                    </span>
                  </div>
                  <div className="flex gap-6 mt-auto border-t border-[#FFE4A0]/10 pt-4">
                    <div className="flex-1">
                      <div className="text-xs text-[#FFE4A0]/70 uppercase tracking-wider mb-1">Critical Events</div>
                      <div className="font-black text-red-400 text-lg">
                        {simResult.roomSafetyIndex?.breakdown?.critical ?? 0}
                      </div>
                    </div>
                    <div className="flex-1 border-l border-[#FFE4A0]/10 pl-6">
                      <div className="text-xs text-[#FFE4A0]/70 uppercase tracking-wider mb-1">Serious Events</div>
                      <div className="font-black text-orange-400 text-lg">
                        {simResult.roomSafetyIndex?.breakdown?.serious ?? 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total Events */}
                <div className="md:col-span-1 bg-[#0A0F1D] rounded-2xl p-6 border border-[#FFE4A0]/20 shadow-inner flex flex-col justify-center text-center">
                  <h3 
                    className="text-[#FFE4A0] text-sm font-bold uppercase tracking-widest italic mb-2"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    Total Incidents
                  </h3>
                  <div className="text-4xl font-black text-[#D4AF37] my-3 drop-shadow-[0_0_10px_rgba(212,175,55,0.4)]">
                    {simResult.events.length}
                  </div>
                  <div className="text-xs text-[#FFE4A0]/50 leading-relaxed max-w-[120px] mx-auto">
                    Collision events detected
                  </div>
                </div>
                
                <div className="md:col-span-1 bg-[#0A0F1D] rounded-2xl p-6 border border-[#FFE4A0]/20 shadow-inner flex flex-col justify-center text-center">
                  <h3 
                    className="text-[#FFE4A0] text-sm font-bold uppercase tracking-widest italic mb-2"
                    style={{ fontFamily: "'Cormorant Garamond', serif" }}
                  >
                    Age Group
                  </h3>
                  <div className="text-xl font-bold text-[#FDFDFD] my-3 leading-tight uppercase font-serif tracking-wide py-2">
                    {ageGroup.split('(')[0].trim() || "Unknown"}
                  </div>
                  <div className="text-xs text-[#FFE4A0]/50 leading-relaxed font-mono">
                    {ageGroup.match(/\((.*?)\)/)?.[1] || ""}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Heatmap Legend */}
          {simResult &&
            simResult.status === "complete" &&
            heatmapData &&
            heatmapData.length > 0 && (
              <div className="bg-[#0A0F1D]/60 backdrop-blur-md rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-[#FFE4A0]/30 p-5 mt-6">
                <h3 
                  className="text-lg font-black text-[#FFE4A0] mb-5 uppercase tracking-widest italic"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  Hazard Object Analysis
                </h3>

                {/* Color Legend */}
                <div className="flex flex-wrap items-center gap-6 mb-4 bg-[#0A0F1D] rounded-xl p-4 border border-[#FFE4A0]/10 shadow-inner">
                  <span className="text-sm font-bold text-[#FFE4A0]/70 uppercase">
                    Risk Scale:
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                    <span className="text-xs font-bold text-[#FDFDFD]">
                      Safe
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-2 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]"></div>
                    <span className="text-xs font-bold text-[#FDFDFD]">
                      Watch
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-2 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"></div>
                    <span className="text-xs font-bold text-[#FDFDFD]">
                      Warning
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-2 rounded-full bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]"></div>
                    <span className="text-xs font-bold text-[#FDFDFD]">
                      Critical
                    </span>
                  </div>
                </div>

                {/* G-Force Thresholds Legend */}
                <div className="flex flex-wrap items-center gap-6 bg-[#0A0F1D] rounded-xl p-4 border border-[#FFE4A0]/10 shadow-inner">
                  <span className="text-sm font-bold text-[#FFE4A0]/70 uppercase">
                    Impact Force:
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400"></div>
                    <span className="text-xs font-bold text-green-400">
                      &lt;20g Observe
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                    <span className="text-xs font-bold text-orange-400">
                      20-50g Soft Injury
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="text-xs font-bold text-red-500">
                      &ge;50g Serious
                    </span>
                  </div>
                </div>
              </div>
            )}

          {/* Safety Recommendations Panel */}
          {simResult &&
            simResult.status === "complete" &&
            heatmapData &&
            heatmapData.some((h) => h.recommendations.length > 0) && (
              <div className="bg-[#0A0F1D]/80 backdrop-blur-md rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-[#FFE4A0]/30 p-6 mt-6">
                <h3 
                  className="text-xl font-black text-[#FFE4A0] mb-5 uppercase tracking-widest italic"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  Safety Recommendations
                </h3>
                <div className="space-y-4">
                  {heatmapData
                    .filter((obj) => obj.recommendations.length > 0)
                    .map((obj, idx) => {
                      const tierStyle =
                        obj.worstGForceTier === "Serious Injury"
                          ? "border-red-500/50 bg-red-900/30 shadow-[inset_0_0_15px_rgba(220,38,38,0.1)]"
                          : obj.worstGForceTier === "Soft Injury"
                            ? "border-orange-500/50 bg-orange-900/30 shadow-[inset_0_0_15px_rgba(249,115,22,0.1)]"
                            : "border-green-500/50 bg-green-900/20 shadow-[inset_0_0_15px_rgba(34,197,94,0.1)]";
                      const tierTextColor =
                        obj.worstGForceTier === "Serious Injury"
                          ? "text-red-400"
                          : obj.worstGForceTier === "Soft Injury"
                            ? "text-orange-400"
                            : "text-green-400";

                      return (
                        <div
                          key={idx}
                          className={`rounded-2xl border-2 p-6 ${tierStyle}`}
                        >
                          {/* Object Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-xl font-black text-[#FDFDFD]">
                                {obj.objectName}
                              </h4>
                              <p className="text-sm text-[#FFE4A0]/60 mt-1">
                                {obj.totalHits} encounter
                                {obj.totalHits !== 1 ? "s" : ""} • Max Force:{" "}
                                <span className={`font-bold ${tierTextColor}`}>
                                  {obj.maxGForce.toFixed(1)}g
                                </span>{" "}
                                • Target:{" "}
                                <span className="font-bold text-[#FDFDFD]">
                                  {obj.primaryBodyPart}
                                </span>
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-3xl font-black ${tierTextColor}`}
                              >
                                {obj.maxInjuryScore}
                              </div>
                              <div
                                className={`text-xs font-bold uppercase tracking-wider ${tierTextColor}`}
                              >
                                {obj.worstGForceTier}
                              </div>
                            </div>
                          </div>

                          {/* Action Required */}
                          <div
                            className={`text-sm font-bold ${tierTextColor} mb-5 bg-[#0A0F1D]/60 border border-[#FFE4A0]/20 rounded-xl p-4`}
                          >
                            {obj.worstGForceTier === "Serious Injury"
                              ? "REQUIRED — High risk of serious injury, immediate protection needed"
                              : obj.worstGForceTier === "Soft Injury"
                                ? "PREVENTIVE — Padding or relocation strongly recommended"
                                : "MONITOR — No significant risk detected"}
                          </div>

                          {/* Biomechanics Detail Panel */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                            {/* Fracture Risk */}
                            <div className={`rounded-xl p-3 border ${(obj.fractureCount ?? 0) > 0 ? 'bg-red-900/30 border-red-500/40' : 'bg-[#0A0F1D] border-[#FFE4A0]/15'}`}>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FFE4A0]/60 mb-1">Bone Fracture Risk</div>
                              <div className={`text-sm font-black leading-tight ${(obj.fractureCount ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {(obj.fractureCount ?? 0) > 0
                                  ? `Possible (${obj.fractureCount} case${(obj.fractureCount ?? 0) > 1 ? 's' : ''})`
                                  : 'No fracture risk'}
                              </div>
                              {obj.specificInjuries && obj.specificInjuries.length > 0 && (
                                <div className="text-[10px] text-red-300/80 mt-1 leading-tight">
                                  {obj.specificInjuries.map((s: string) => {
                                    const injuryLabels: Record<string, string> = {
                                      skull_fracture: 'skull fracture',
                                      wrist_fracture: 'wrist fracture',
                                      clavicle_fracture: 'collarbone fracture',
                                      arm_fracture: 'arm fracture',
                                      leg_fracture: 'leg fracture',
                                      rib_fracture: 'rib fracture',
                                      spine_fracture: 'spine fracture',
                                      hip_fracture: 'hip fracture',
                                      femur_fracture: 'thigh bone fracture',
                                      tibia_fracture: 'shin fracture',
                                    };
                                    return injuryLabels[s] || s.replace(/_/g, ' ');
                                  }).join(', ')}
                                </div>
                              )}
                            </div>
                            {/* HIC₁₅ */}
                            <div className="rounded-xl p-3 border bg-[#0A0F1D] border-[#FFE4A0]/15">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FFE4A0]/60 mb-1">Head Impact Score</div>
                              <div className={`text-lg font-black ${(obj.maxHIC ?? 0) > 700 ? 'text-red-400' : (obj.maxHIC ?? 0) > 200 ? 'text-orange-400' : 'text-green-400'}`}>
                                {(obj.maxHIC ?? 0).toFixed(0)}
                              </div>
                              <div className="text-[10px] text-[#FFE4A0]/40 mt-0.5">
                                {(obj.maxHIC ?? 0) > 700 ? 'Dangerous — seek help' : (obj.maxHIC ?? 0) > 200 ? 'Caution — monitor closely' : 'Normal range'}
                              </div>
                            </div>
                            {/* Impact Force */}
                            <div className="rounded-xl p-3 border bg-[#0A0F1D] border-[#FFE4A0]/15">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FFE4A0]/60 mb-1">Peak Impact</div>
                              <div className={`text-sm font-black ${
                                (obj.maxImpactForceN ?? 0) > 5000 ? 'text-red-400' :
                                (obj.maxImpactForceN ?? 0) > 2000 ? 'text-orange-400' :
                                (obj.maxImpactForceN ?? 0) > 500 ? 'text-yellow-400' : 'text-green-400'
                              }`}>
                                {(obj.maxImpactForceN ?? 0) > 5000 ? 'Very High' :
                                 (obj.maxImpactForceN ?? 0) > 2000 ? 'High' :
                                 (obj.maxImpactForceN ?? 0) > 500 ? 'Moderate' : 'Low'}
                              </div>
                              <div className="text-[10px] text-[#FFE4A0]/40 mt-0.5">
                                {(obj.maxImpactForceN ?? 0)} N
                              </div>
                            </div>
                            {/* Collision Duration */}
                            <div className="rounded-xl p-3 border bg-[#0A0F1D] border-[#FFE4A0]/15">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FFE4A0]/60 mb-1">Avg Duration</div>
                              <div className="text-lg font-black text-[#FDFDFD]">
                                {(obj.avgCollisionDurationMs ?? 0).toFixed(1)} <span className="text-xs text-[#FFE4A0]/50">ms</span>
                              </div>
                            </div>
                          </div>

                          {/* Body Part Distribution */}
                          {obj.bodyPartDistribution && Object.keys(obj.bodyPartDistribution).length > 0 && (
                            <div className="mb-5 bg-[#0A0F1D]/60 border border-[#FFE4A0]/15 rounded-xl p-4">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FFE4A0]/60 mb-2">Body Part Impact Distribution</div>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(obj.bodyPartDistribution)
                                  .sort(([, a]: any, [, b]: any) => b - a)
                                  .map(([part, count]: [string, any], i: number) => (
                                    <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-[#FFE4A0]/10 border border-[#FFE4A0]/20 text-[#FDFDFD] font-bold">
                                      {part}: <span className="text-[#D4AF37]">{count}</span>
                                    </span>
                                  ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {obj.recommendations.map((rec, rIdx) => (
                              <a
                                key={rIdx}
                                href={rec.searchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-4 bg-[#0A0F1D] rounded-xl p-4 border border-[#FFE4A0]/20 hover:shadow-[0_0_15px_rgba(212,175,55,0.2)] hover:border-[#D4AF37] transition-all group cursor-pointer"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-[#FDFDFD] group-hover:text-[#FFE4A0] transition-colors leading-tight">
                                      {rec.product}
                                    </span>
                                    <span
                                      className={`text-[9px] font-black px-2 py-0.5 rounded-md tracking-wider ${
                                        rec.priority === "high"
                                          ? "bg-red-900/50 text-red-300 border border-red-500/30"
                                          : "bg-blue-900/50 text-blue-300 border border-blue-500/30"
                                      }`}
                                    >
                                      {rec.priority === "high"
                                        ? "CRITICAL"
                                        : "SUGGESTED"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#FFE4A0]/50 mt-1.5 leading-relaxed">
                                    {rec.reason}
                                  </p>
                                </div>
                                <div className="text-[#D4AF37]/50 group-hover:text-[#D4AF37] text-xl transition-colors self-center">
                                  ✧
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          {/* ── Zone Analysis Panel ── */}
          {simResult && simResult.status === "complete" && zoneAnalysis && (
            <div className="bg-[#0A0F1D]/80 backdrop-blur-md rounded-2xl shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-[#FFE4A0]/30 p-6 mt-6">
              <h3 
                className="text-xl font-black text-[#FFE4A0] mb-3 uppercase tracking-widest italic"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Zone Risk Analysis
              </h3>
              <p className="text-sm text-[#FFE4A0]/50 mb-5 italic" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                Room divided into a {zoneAnalysis.summary?.gridSize || 8}×
                {zoneAnalysis.summary?.gridSize || 8} grid. Each cell shows its aggregate risk level.
              </p>

              {/* Zone Summary Badges */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="rounded-2xl bg-green-900/20 border border-green-500/30 p-4 text-center shadow-inner">
                  <div className="text-3xl font-black text-green-400">
                    {zoneAnalysis.summary?.safe || 0}
                  </div>
                  <div className="text-xs font-bold text-green-500/80 mt-1 uppercase tracking-wider">
                    Safe Zones
                  </div>
                </div>
                <div className="rounded-2xl bg-yellow-900/20 border border-yellow-500/30 p-4 text-center shadow-inner">
                  <div className="text-3xl font-black text-yellow-400">
                    {zoneAnalysis.summary?.caution || 0}
                  </div>
                  <div className="text-xs font-bold text-yellow-500/80 mt-1 uppercase tracking-wider">
                    Caution 
                  </div>
                </div>
                <div className="rounded-2xl bg-orange-900/20 border border-orange-500/30 p-4 text-center shadow-inner">
                  <div className="text-3xl font-black text-orange-400">
                    {zoneAnalysis.summary?.hazard || 0}
                  </div>
                  <div className="text-xs font-bold text-orange-500/80 mt-1 uppercase tracking-wider">
                    Hazard Zones
                  </div>
                </div>
                <div className="rounded-2xl bg-red-900/20 border border-red-500/30 p-4 text-center shadow-inner">
                  <div className="text-3xl font-black text-red-500">
                    {zoneAnalysis.summary?.danger || 0}
                  </div>
                  <div className="text-xs font-bold text-red-500/80 mt-1 uppercase tracking-wider">
                    Danger Zones
                  </div>
                </div>
              </div>

              {/* Danger Zone Details */}
              {zoneAnalysis.zones &&
                zoneAnalysis.zones.filter(
                  (z: any) =>
                    z.classification === "danger" ||
                    z.classification === "hazard",
                ).length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-[#FFE4A0]/80 uppercase tracking-widest pb-2 border-b border-[#FFE4A0]/10 mb-3">
                      Focus Points
                    </h4>
                    {zoneAnalysis.zones
                      .filter(
                        (z: any) =>
                          z.classification === "danger" ||
                          z.classification === "hazard",
                      )
                      .sort((a: any, b: any) => b.avgScore - a.avgScore)
                      .slice(0, 8)
                      .map((zone: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between rounded-xl p-4 border transition-colors hover:bg-[#FFE4A0]/5 ${
                            zone.classification === "danger"
                              ? "bg-red-900/10 border-red-500/20"
                              : "bg-orange-900/10 border-orange-500/20"
                          }`}
                        >
                          <div>
                            <span
                              className={`text-sm font-black uppercase tracking-wider ${zone.classification === "danger" ? "text-red-400" : "text-orange-400"}`}
                            >
                              Coordinate [{zone.row},{zone.col}]
                            </span>
                            <p className="text-xs text-[#FDFDFD]/70 mt-1.5">
                              {zone.events} encounter
                              {zone.events !== 1 ? "s" : ""} • Base Severity:{" "}
                              {zone.avgScore} • Peak: {zone.maxScore}
                            </p>
                            {zone.objects && zone.objects.length > 0 && (
                              <p className="text-[11px] text-[#FFE4A0]/50 mt-1 italic">
                                Elements: {zone.objects.slice(0, 3).join(", ")}
                                {zone.objects.length > 3
                                  ? ` and ${zone.objects.length - 3} more`
                                  : ""}
                              </p>
                            )}
                          </div>
                          <div
                            className={`text-2xl font-black ${zone.classification === "danger" ? "text-red-500" : "text-orange-500"}`}
                            style={{ textShadow: "0 0 10px currentColor" }}
                          >
                            {zone.avgScore}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Simulator;