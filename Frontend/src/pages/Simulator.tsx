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
    gForce?: number;
    gForceTier?: string;
    gForceColor?: string;
    gForceAction?: string;
    gForceIcon?: string;
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
  const [ageGroup, setAgeGroup] = useState<string>("Toddler (1-3y)");
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
        "Toddler (1-3y)": "toddler",
        "Preschool (3-5y)": "preschool",
        "School (6-10y)": "school_age",
        "Preteen (10-14y)": "preteen",
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
          ageGroupId: ageGroupMap[ageGroup] || "toddler",
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
          // FIX: Use live collisionEventsCount from status during simulation since events array is 202-empty
          totalEvents:
            status.status === "complete"
              ? events.length
              : status.collisionEventsCount || 0,
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
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-rose-50 text-gray-700 font-sans selection:bg-pink-200 selection:text-pink-900">
      <Header />

      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      {/* --- Main Simulator Interface --- */}
      <section
        id="simulator"
        className="relative z-10 min-h-screen pt-24 pb-20 px-8"
      >
        <div className="max-w-7xl mx-auto">
          <div className="mb-10">
            <span className="text-sm font-bold text-pink-400 tracking-widest uppercase">
              3D Environment
            </span>
            <h2 className="text-4xl font-black text-slate-700 mt-1">
              Simulator Controls
            </h2>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-100 border-2 border-red-400 rounded-xl text-red-700 font-bold">
              ❌ {error}
            </div>
          )}

          {/* Control Panel */}
          <div className="glass-panel p-8 mb-8 space-y-4">
            <div className="flex flex-wrap gap-6 items-end">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">
                  📂 3D Model (GLB/GLTF)
                </label>
                <label className="cursor-pointer bg-white px-6 py-3 rounded-xl shadow-sm border-2 border-dashed border-pink-300 hover:border-pink-500 transition font-bold inline-block">
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="text-gray-600">
                    {fileName || "📂 Choose File"}
                  </span>
                </label>
              </div>

              {/* Age Group */}
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">
                  👶 Age Group
                </label>
                <select
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  className="px-4 py-3 rounded-xl border-2 border-pink-200 font-bold bg-white"
                >
                  <option>Infant (0-1y)</option>
                  <option>Toddler (1-3y)</option>
                  <option>Preschool (3-5y)</option>
                  <option>School (6-10y)</option>
                  <option>Preteen (10-14y)</option>
                </select>
              </div>

              {/* Agent Count */}
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">
                  🤖 Agents
                </label>
                <input
                  type="number"
                  min="5"
                  max="20"
                  value={agentCount}
                  onChange={(e) => setAgentCount(Number(e.target.value))}
                  className="w-32 px-4 py-3 rounded-xl border-2 border-pink-200 font-bold bg-white"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">
                  ⏱️ Duration (s)
                </label>
                <input
                  type="number"
                  min="5"
                  max="30"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-32 px-4 py-3 rounded-xl border-2 border-pink-200 font-bold bg-white"
                />
              </div>

              {/* Run Button */}
              <button
                onClick={startSimulation}
                disabled={running || !uploadedFile}
                className="px-8 py-4 rounded-xl font-black shadow-lg bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:from-yellow-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? "⏳ Running..." : "🚀 Run Simulation"}
              </button>
            </div>

            {/* View Tools Row */}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-pink-100">
              <button
                onClick={() => setIsBabyView(!isBabyView)}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  isBabyView
                    ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-purple-200/50"
                    : "bg-white/80 text-gray-600 hover:bg-violet-50 hover:text-violet-600 border border-gray-200"
                }`}
              >
                {isBabyView ? "👶 Baby View ON" : "👁️ Baby View"}
              </button>
              <button
                onClick={handleScreenshot}
                className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white/80 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 border border-gray-200 transition-all"
              >
                📸 Screenshot
              </button>
            </div>
          </div>

          {/* --- Progress Indicator --- */}
          {running && simResult && (
            <div className="mb-8 p-6 bg-white/60 rounded-2xl shadow-lg backdrop-blur">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-700">Progress</span>
                <span className="font-black text-2xl text-pink-500">
                  {simResult.progress}%
                </span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-400 to-orange-500 transition-all duration-300"
                  style={{ width: `${simResult.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* --- 3D Visualization --- */}
          <div
            ref={canvasContainerRef}
            className="h-[500px] rounded-3xl border-4 border-gray-800 relative overflow-hidden shadow-2xl mb-8"
          >
            {isBabyView && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-violet-500/90 text-white text-sm font-bold backdrop-blur-sm shadow-lg animate-pulse-glow">
                👶 Baby View — Camera at child eye level (~60cm)
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
              <div className="glass-panel p-4 mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-black text-slate-700">
                    👶 Agent Inspector
                  </h3>
                  {selectedAgentId !== null && (
                    <button
                      onClick={() => setSelectedAgentId(null)}
                      className="text-xs px-3 py-1 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 font-bold transition-colors"
                    >
                      Show All Agents
                    </button>
                  )}
                </div>
                <div
                  className="flex gap-2 overflow-x-auto pb-2"
                  style={{ scrollbarWidth: "thin" }}
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
                          key={traj.agentId ?? i}
                          onClick={() =>
                            setSelectedAgentId(
                              isSelected ? null : (traj.agentId ?? i),
                            )
                          }
                          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "border-pink-400 bg-pink-50 shadow-lg scale-105"
                              : selectedAgentId !== null
                                ? "border-gray-200 bg-gray-50 opacity-50 hover:opacity-80"
                                : "border-gray-200 bg-white hover:border-pink-300 hover:bg-pink-50"
                          }`}
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-bold text-sm text-slate-700">
                            Agent {traj.agentId ?? i}
                          </span>
                          {collisions > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">
                              {collisions} 💥
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
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

                    // Age group properties lookup
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
                        height: "0.45m",
                        speed: "0.1-0.3 m/s (crawl)",
                        capabilities: "Crawl, Roll",
                        attracted: "Bright lights, Faces, Rattles",
                      },
                      toddler: {
                        label: "Toddler (1-3y)",
                        height: "0.80m",
                        speed: "0.3-1.0 m/s (walk)",
                        capabilities: "Walk, Crawl, Climb (low)",
                        attracted: "Colorful objects, Doors, Stairs",
                      },
                      preschool: {
                        label: "Preschool (3-5y)",
                        height: "1.00m",
                        speed: "0.5-1.5 m/s (walk/run)",
                        capabilities: "Walk, Run, Climb, Jump",
                        attracted: "Toys, Furniture edges, Windows",
                      },
                      school_age: {
                        label: "School Age (5-8y)",
                        height: "1.20m",
                        speed: "0.8-2.5 m/s (run)",
                        capabilities: "Walk, Run, Sprint, Climb, Jump",
                        attracted: "Electronics, High surfaces, Doors",
                      },
                      preteen: {
                        label: "Pre-teen (8-12y)",
                        height: "1.45m",
                        speed: "1.0-3.0 m/s (sprint)",
                        capabilities: "All movement types",
                        attracted: "High places, Heavy objects",
                      },
                    };
                    const ageId =
                      traj.ageGroupId ||
                      simulationPlayback.config?.ageGroupId ||
                      "toddler";
                    const ageMeta =
                      ageGroupNames[ageId] || ageGroupNames.toddler;

                    return (
                      <div className="mt-4 p-4 rounded-2xl border-2 border-pink-200 bg-gradient-to-br from-white to-pink-50">
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className="w-5 h-5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <h4 className="font-black text-lg text-slate-700">
                            Agent {selectedAgentId} — {ageMeta.label}
                          </h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 font-bold">
                              Height
                            </div>
                            <div className="font-black text-slate-700">
                              {ageMeta.height}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 font-bold">
                              Speed Range
                            </div>
                            <div className="font-black text-slate-700 text-sm">
                              {ageMeta.speed}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 font-bold">
                              Distance
                            </div>
                            <div className="font-black text-blue-500">
                              {(fs.totalDistance ?? 0).toFixed(1)}m
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 font-bold">
                              Fatigue
                            </div>
                            <div className="font-black text-orange-500">
                              {((fs.fatigue ?? 0) * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 font-bold">
                              Capabilities
                            </div>
                            <div className="text-sm text-slate-600">
                              {ageMeta.capabilities}
                            </div>
                          </div>
                          <div className="bg-white rounded-xl p-3 border border-gray-100">
                            <div className="text-xs text-gray-400 font-bold">
                              Attracted To
                            </div>
                            <div className="text-sm text-slate-600">
                              {ageMeta.attracted}
                            </div>
                          </div>
                        </div>
                        {nonSafeEvents.length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-gray-400 mb-2">
                              ⚠️ Risk Events ({nonSafeEvents.length})
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
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
                                    ? "text-red-600"
                                    : tier === "dangerous"
                                      ? "text-orange-600"
                                      : tier === "warning"
                                        ? "text-yellow-600"
                                        : "text-amber-500";
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5"
                                  >
                                    <span className="text-gray-400">
                                      {(evt.time ?? 0).toFixed(2)}s
                                    </span>
                                    <span className="font-bold text-slate-600">
                                      {cleanName}
                                    </span>
                                    <span className="font-bold text-slate-500">
                                      ({evt.injury?.bodyPart})
                                    </span>
                                    <span className={`font-black ${tierColor}`}>
                                      {evt.injury?.riskTier}
                                    </span>
                                    <span className="text-gray-400">
                                      Score: {evt.injury?.injuryScore ?? 0}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {nonSafeEvents.length === 0 && (
                          <div className="text-sm text-green-600 font-bold">
                            ✅ No risk events for this agent
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* ── Film Reel Playback Controls ── */}
                {selectedAgentId !== null &&
                  simulationPlayback?.trajectories && (
                    <div className="mt-4 p-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
                      <div className="flex items-center gap-3 mb-3">
                        <h4 className="font-black text-sm text-indigo-700">
                          🎬 Film Reel Playback
                        </h4>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Play/Pause Button */}
                        <button
                          onClick={() => setPlaybackPaused(!playbackPaused)}
                          className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black shadow-md transition-all ${
                            playbackPaused
                              ? "bg-green-500 hover:bg-green-600 text-white shadow-green-200"
                              : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-200"
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
                            className="w-full h-2 rounded-full appearance-none bg-indigo-100 cursor-pointer"
                            style={{
                              background: `linear-gradient(to right, #818cf8 ${playbackInfo.progress * 100}%, #e0e7ff ${playbackInfo.progress * 100}%)`,
                            }}
                          />
                        </div>

                        {/* Action + Timestamp */}
                        <div className="flex-shrink-0 flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 border border-indigo-100 shadow-sm">
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
                          <span className="font-bold text-sm text-slate-700">
                            {playbackInfo.action}
                          </span>
                          <span className="text-xs text-gray-400 font-mono">
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
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="glass-panel p-6 text-center">
                  <div className="text-4xl font-black text-pink-500">
                    {simResult.progress}%
                  </div>
                  <div className="text-sm font-bold text-gray-600 mt-2">
                    Progress
                  </div>
                </div>
                <div className="glass-panel p-6 text-center">
                  <div className="text-4xl font-black text-blue-500">
                    {simResult.totalEvents}
                  </div>
                  <div className="text-sm font-bold text-gray-600 mt-2">
                    Collision Events
                  </div>
                </div>
                <div className="glass-panel p-6 text-center">
                  <div
                    className={
                      "text-4xl font-black " +
                      (simResult.status === "complete"
                        ? "text-green-500"
                        : "text-yellow-500")
                    }
                  >
                    {simResult.status === "complete" ? "✅" : "⏳"}
                  </div>
                  <div className="text-sm font-bold text-gray-600 mt-2 capitalize">
                    {simResult.status}
                  </div>
                </div>
              </div>

              {/* Collision Events Table */}
              {simResult.events.length > 0 && (
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black text-slate-700 mb-4">
                    🎯 Collision Events
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-pink-200">
                          <th className="text-left py-2 px-4 font-black text-gray-700">
                            Time
                          </th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">
                            Agent
                          </th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">
                            Object
                          </th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">
                            Position
                          </th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">
                            Impact
                          </th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">
                            Risk
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
                                ? "bg-red-200 text-red-800 border border-red-300"
                                : riskTier === "dangerous"
                                  ? "bg-orange-200 text-orange-800 border border-orange-300"
                                  : riskTier === "warning"
                                    ? "bg-yellow-200 text-yellow-800 border border-yellow-300"
                                    : riskTier === "watch"
                                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                                      : "bg-green-100 text-green-700 border border-green-200";
                            const gForceIcon =
                              gForceTier === "Serious Injury"
                                ? "🚨"
                                : gForceTier === "Soft Injury"
                                  ? "⚠️"
                                  : "👀";
                            const gForceColor =
                              gForceTier === "Serious Injury"
                                ? "text-red-600"
                                : gForceTier === "Soft Injury"
                                  ? "text-orange-600"
                                  : "text-green-600";
                            // Clean object name: replace unreadable characters with readable fallback
                            const rawName =
                              evt.objectName || evt.objectId || "Unknown";
                            const cleanObjectName =
                              rawName.replace(/[^\x20-\x7E]/g, "").trim() ||
                              `Object_${idx}`;
                            return (
                              <tr
                                key={idx}
                                className="border-b border-pink-100 hover:bg-pink-50"
                              >
                                <td className="py-3 px-4">
                                  {(evt.time ?? 0).toFixed(2)}s
                                </td>
                                <td className="py-3 px-4 font-bold">
                                  Agent {evt.agentId}
                                </td>
                                <td className="py-3 px-4 font-medium text-slate-600">
                                  {cleanObjectName}
                                </td>
                                <td className="py-3 px-4 text-xs font-mono">
                                  ({evt.position?.[0]?.toFixed(1) ?? 0},{" "}
                                  {evt.position?.[1]?.toFixed(1) ?? 0},{" "}
                                  {evt.position?.[2]?.toFixed(1) ?? 0})
                                </td>
                                <td className="py-3 px-4">
                                  <span className="font-bold">
                                    {evt.injury?.injuryScore ?? 0}
                                  </span>
                                  <span className="text-xs text-gray-400 ml-1">
                                    ({evt.injury?.bodyPart})
                                  </span>
                                  {evt.injury?.gForce != null && (
                                    <span
                                      className={`text-xs font-bold ml-2 ${gForceColor}`}
                                    >
                                      {gForceIcon}{" "}
                                      {evt.injury.gForce.toFixed(1)}g
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`px-3 py-1 rounded-full text-xs font-bold ${riskColor}`}
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
                      <p className="text-gray-400 mt-4 text-sm">
                        Showing {Math.min(total, 30)} of {total} events
                        {nonSafeCount > 0 && (
                          <span className="font-bold text-orange-500 ml-1">
                            ({nonSafeCount} elevated risk)
                          </span>
                        )}
                        {nonSafeCount === 0 && (
                          <span className="text-green-500 ml-1">
                            (all events safe)
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
                  <div className="glass-panel p-8 text-center">
                    <p className="text-2xl font-black text-gray-600">
                      ✅ No collision events detected
                    </p>
                    <p className="text-gray-500 mt-2">
                      The environment appears safe for this age group
                    </p>
                  </div>
                )}
            </div>
          )}

          {/* ── RESULTS DASHBOARD ────────────────────────────────────── */}
          {simResult && (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in-up">
              <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-4 flex justify-between items-center text-white">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="text-2xl">📊</span> Simulation Report
                </h2>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      showHeatmap
                        ? "bg-white text-pink-600 shadow-lg"
                        : "bg-white/20 hover:bg-white/30"
                    }`}
                  >
                    {showHeatmap ? "Hide Heatmap" : "Show Heatmap"}
                  </button>
                  <button
                    onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      showBoundingBoxes
                        ? "bg-green-100 text-green-700 shadow-lg"
                        : "bg-white/20 hover:bg-white/30"
                    }`}
                  >
                    {showBoundingBoxes ? "Hide BBoxes" : "Show BBoxes"}
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold backdrop-blur-sm"
                  >
                    📊 Export CSV
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
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold backdrop-blur-sm"
                  >
                    📄 Export PDF
                  </button>
                </div>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* RSI Score Card */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl">
                    🛡️
                  </div>
                  <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-2">
                    Room Safety Grade
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-5xl font-black ${
                        simResult.roomSafetyIndex?.grade === "S" ||
                        simResult.roomSafetyIndex?.grade === "A"
                          ? "text-green-500"
                          : simResult.roomSafetyIndex?.grade === "B"
                            ? "text-yellow-500"
                            : "text-red-500"
                      }`}
                    >
                      {simResult.roomSafetyIndex?.grade || "-"}
                    </span>
                    <span className="text-2xl font-bold text-slate-400">
                      / {simResult.roomSafetyIndex?.score ?? 0}
                    </span>
                  </div>
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Critical Incidents:</span>
                      <span className="font-bold text-red-500">
                        {simResult.roomSafetyIndex?.breakdown?.critical ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Serious Injuries:</span>
                      <span className="font-bold text-orange-500">
                        {simResult.roomSafetyIndex?.breakdown?.serious ?? 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Events */}
                <div className="bg-pink-50 rounded-xl p-5 border border-pink-100">
                  <h3 className="text-pink-400 text-sm font-bold uppercase tracking-wider mb-1">
                    Total Incidents
                  </h3>
                  <div className="text-3xl font-black text-pink-600">
                    {simResult.events.length}
                  </div>
                  <div className="text-xs text-pink-400 mt-2">
                    Collision events recorded
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Heatmap Legend (no duplicate toggle — use the one in the Report header) */}
          {simResult &&
            simResult.status === "complete" &&
            heatmapData &&
            heatmapData.length > 0 && (
              <div className="glass-panel p-8">
                <h3 className="text-2xl font-black text-slate-700 mb-6">
                  🗺️ 3D Danger Heatmap
                </h3>

                {/* Color Legend */}
                <div className="flex items-center gap-6 mb-6 bg-white/60 rounded-xl p-4">
                  <span className="text-sm font-bold text-gray-500">
                    Danger Scale:
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-4 rounded bg-green-400"></div>
                    <span className="text-xs font-bold text-gray-500">
                      Safe
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-4 rounded bg-yellow-400"></div>
                    <span className="text-xs font-bold text-gray-500">
                      Watch
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-4 rounded bg-orange-400"></div>
                    <span className="text-xs font-bold text-gray-500">
                      Warning
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-4 rounded bg-red-500"></div>
                    <span className="text-xs font-bold text-gray-500">
                      Critical
                    </span>
                  </div>
                </div>

                {/* G-Force Thresholds Legend */}
                <div className="flex items-center gap-6 bg-white/60 rounded-xl p-4">
                  <span className="text-sm font-bold text-gray-500">
                    G-Force Tiers:
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-lg">👀</span>
                    <span className="text-xs font-bold text-green-600">
                      &lt;20g Observe
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-lg">⚠️</span>
                    <span className="text-xs font-bold text-orange-600">
                      20-50g Soft Injury
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-lg">🚨</span>
                    <span className="text-xs font-bold text-red-600">
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
              <div className="glass-panel p-8">
                <h3 className="text-2xl font-black text-slate-700 mb-6">
                  🛡️ Safety Recommendations
                </h3>
                <div className="space-y-6">
                  {heatmapData
                    .filter((obj) => obj.recommendations.length > 0)
                    .map((obj, idx) => {
                      const tierStyle =
                        obj.worstGForceTier === "Serious Injury"
                          ? "border-red-300 bg-red-50/80"
                          : obj.worstGForceTier === "Soft Injury"
                            ? "border-orange-300 bg-orange-50/80"
                            : "border-green-300 bg-green-50/80";
                      const tierIcon =
                        obj.worstGForceTier === "Serious Injury"
                          ? "🚨"
                          : obj.worstGForceTier === "Soft Injury"
                            ? "⚠️"
                            : "👀";
                      const tierTextColor =
                        obj.worstGForceTier === "Serious Injury"
                          ? "text-red-700"
                          : obj.worstGForceTier === "Soft Injury"
                            ? "text-orange-700"
                            : "text-green-700";

                      return (
                        <div
                          key={idx}
                          className={`rounded-2xl border-2 p-6 ${tierStyle}`}
                        >
                          {/* Object Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-lg font-black text-gray-800">
                                {tierIcon} {obj.objectName}
                              </h4>
                              <p className="text-sm text-gray-500 mt-1">
                                {obj.totalHits} collision
                                {obj.totalHits !== 1 ? "s" : ""} • Max G-Force:{" "}
                                <span className={`font-bold ${tierTextColor}`}>
                                  {obj.maxGForce.toFixed(1)}g
                                </span>{" "}
                                • Body:{" "}
                                <span className="font-bold">
                                  {obj.primaryBodyPart}
                                </span>
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-2xl font-black ${tierTextColor}`}
                              >
                                {obj.maxInjuryScore}
                              </div>
                              <div
                                className={`text-xs font-bold ${tierTextColor}`}
                              >
                                {obj.worstGForceTier}
                              </div>
                            </div>
                          </div>

                          {/* Action Required */}
                          <div
                            className={`text-sm font-bold ${tierTextColor} mb-4 bg-white/60 rounded-xl p-3`}
                          >
                            {obj.worstGForceTier === "Serious Injury"
                              ? "🚨 MUST change environment — high risk of significant injury"
                              : obj.worstGForceTier === "Soft Injury"
                                ? "⚠️ Preventive measures needed — padding or relocation recommended"
                                : "👀 Monitor only — no injury expected"}
                          </div>

                          {/* Product Recommendations */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {obj.recommendations.map((rec, rIdx) => (
                              <a
                                key={rIdx}
                                href={rec.searchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 bg-white/80 rounded-xl p-4 border border-gray-200 hover:shadow-lg hover:border-blue-300 transition-all group cursor-pointer"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-sm text-gray-800 group-hover:text-blue-600 transition-colors">
                                      {rec.product}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        rec.priority === "high"
                                          ? "bg-red-100 text-red-600"
                                          : "bg-blue-100 text-blue-600"
                                      }`}
                                    >
                                      {rec.priority === "high"
                                        ? "HIGH"
                                        : "RECOMMENDED"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {rec.reason}
                                  </p>
                                </div>
                                <div className="text-blue-400 group-hover:text-blue-600 text-lg mt-1 transition-colors">
                                  🛍️
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
            <div className="glass-panel p-8">
              <h3 className="text-2xl font-black text-slate-700 mb-6">
                📍 Zone Analysis
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Room divided into {zoneAnalysis.summary?.gridSize || 8}×
                {zoneAnalysis.summary?.gridSize || 8} grid. Each cell classified
                by collision severity.
              </p>

              {/* Zone Summary Badges */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="rounded-xl bg-green-50 border-2 border-green-200 p-4 text-center">
                  <div className="text-3xl font-black text-green-600">
                    {zoneAnalysis.summary?.safe || 0}
                  </div>
                  <div className="text-xs font-bold text-green-700 mt-1">
                    ✅ Safe Zones
                  </div>
                </div>
                <div className="rounded-xl bg-yellow-50 border-2 border-yellow-200 p-4 text-center">
                  <div className="text-3xl font-black text-yellow-600">
                    {zoneAnalysis.summary?.caution || 0}
                  </div>
                  <div className="text-xs font-bold text-yellow-700 mt-1">
                    👀 Caution Zones
                  </div>
                </div>
                <div className="rounded-xl bg-orange-50 border-2 border-orange-200 p-4 text-center">
                  <div className="text-3xl font-black text-orange-600">
                    {zoneAnalysis.summary?.hazard || 0}
                  </div>
                  <div className="text-xs font-bold text-orange-700 mt-1">
                    ⚠️ Hazard Zones
                  </div>
                </div>
                <div className="rounded-xl bg-red-50 border-2 border-red-200 p-4 text-center">
                  <div className="text-3xl font-black text-red-600">
                    {zoneAnalysis.summary?.danger || 0}
                  </div>
                  <div className="text-xs font-bold text-red-700 mt-1">
                    🚨 Danger Zones
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
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                      Hazard & Danger Zone Details
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
                          className={`flex items-center justify-between rounded-xl p-4 border-2 ${
                            zone.classification === "danger"
                              ? "bg-red-50/80 border-red-200"
                              : "bg-orange-50/80 border-orange-200"
                          }`}
                        >
                          <div>
                            <span
                              className={`text-sm font-black ${zone.classification === "danger" ? "text-red-700" : "text-orange-700"}`}
                            >
                              {zone.classification === "danger" ? "🚨" : "⚠️"}{" "}
                              Grid [{zone.row},{zone.col}]
                            </span>
                            <p className="text-xs text-gray-500 mt-1">
                              {zone.events} collision
                              {zone.events !== 1 ? "s" : ""} • Avg score:{" "}
                              {zone.avgScore} • Max: {zone.maxScore}
                            </p>
                            {zone.objects && zone.objects.length > 0 && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                Objects: {zone.objects.slice(0, 3).join(", ")}
                                {zone.objects.length > 3
                                  ? ` +${zone.objects.length - 3} more`
                                  : ""}
                              </p>
                            )}
                          </div>
                          <div
                            className={`text-lg font-black ${zone.classification === "danger" ? "text-red-600" : "text-orange-600"}`}
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
