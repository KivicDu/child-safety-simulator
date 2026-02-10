import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Canvas3D from '../components/Canvas3D';

interface CollisionEvent {
  timestamp: number;
  objects: string[];
  position: { x: number; y: number; z: number };
  severity: string;
  type: string;
}

interface SimulationResult {
  id: string;
  progress: number;
  status: 'running' | 'complete' | 'error';
  totalEvents: number;
  events: CollisionEvent[];
  heatmapData?: any;
  timestamp?: number;
}

const Simulator = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<any>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [modelPath, setModelPath] = useState<string>('');
  const [ageGroup, setAgeGroup] = useState<string>('Toddler (1-3y)');
  const [agentCount, setAgentCount] = useState<number>(10);
  const [duration, setDuration] = useState<number>(10);
  const [running, setRunning] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string>('');
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const token = localStorage.getItem('token');

  // Load user on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      setUploadedFile(file);
      setFileName(file.name);
      setError('');
    } else {
      setError('Please upload a valid GLB or GLTF file');
    }
  };

  const uploadModel = async (): Promise<string | null> => {
    if (!uploadedFile) {
      setError('Please select a file');
      return null;
    }

    try {
      const formData = new FormData();
      formData.append('model', uploadedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      const sceneId = data.sceneId;  // Changed from filePath to sceneId
      setModelPath(data.filePath);  // But keep filePath for 3D preview
      return sceneId;
    } catch (err) {
      setError('Failed to upload file: ' + (err instanceof Error ? err.message : 'Unknown error'));
      return null;
    }
  };

  const startSimulation = async () => {
    if (!uploadedFile) {
      setError('Please upload a 3D model first');
      return;
    }

    setError('');
    setRunning(true);

    try {
      // Upload model first
      const sceneId = await uploadModel();
      if (!sceneId) {
        setRunning(false);
        return;
      }

      // Map ageGroup to ageGroupId
      const ageGroupMap: { [key: string]: string } = {
        'Infant (0-1y)': 'infant',
        'Toddler (1-3y)': 'toddler',
        'Preschool (3-5y)': 'preschool',
        'School (6-10y)': 'school',
        'Preteen (10-14y)': 'preteen',
      };

      // Start simulation
      const response = await fetch('/api/simulate/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          sceneId,
          ageGroupId: ageGroupMap[ageGroup] || 'toddler',
          duration,
          agentCount,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start simulation');
      }

      const data = await response.json();
      const simId = data.simulationId;

      // Start polling
      pollSimulation(simId);
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setRunning(false);
    }
  };

  const pollSimulation = (simId: string) => {
    const newPollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/simulate/${simId}/status`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to get status');
        }

        const status = await response.json();

        // Get collision events
        const eventsResponse = await fetch(`/api/simulate/${simId}/events`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        let events: CollisionEvent[] = [];
        if (eventsResponse.ok) {
          events = await eventsResponse.json();
        }

        setSimResult({
          id: simId,
          progress: status.progress || 0,
          status: status.status || 'running',
          totalEvents: events.length,
          events,
          timestamp: Date.now(),
        });

        // Stop polling when complete
        if (status.status === 'complete' || status.progress >= 100) {
          clearInterval(newPollInterval);
          setRunning(false);
          setPollInterval(null);
        }
      } catch (err) {
        console.error('Poll error:', err);
        if (newPollInterval) clearInterval(newPollInterval);
        setRunning(false);
      }
    }, 2000);

    setPollInterval(newPollInterval);
  };

  const exportToExcel = () => {
    if (!simResult) return;

    try {
      const headers = ['Timestamp', 'Objects', 'Position', 'Severity', 'Type'];
      const rows = simResult.events.map((evt) => [
        new Date(evt.timestamp).toLocaleString(),
        evt.objects.join(', '),
        `(${evt.position.x.toFixed(2)}, ${evt.position.y.toFixed(2)}, ${evt.position.z.toFixed(2)})`,
        evt.severity,
        evt.type,
      ]);

      // Create CSV string
      const csv = [headers, ...rows].map((row: any) => row.map((cell: any) => `"${cell}"`).join(',')).join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simulation-${simResult.id}-${Date.now()}.csv`;
      a.click();
    } catch (err) {
      setError('Export failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  return (
    <div className="min-h-screen bg-pink-50 text-gray-700 font-sans selection:bg-pink-200 selection:text-pink-900">
      {/* HEADER */}
      <nav className="fixed top-0 left-0 right-0 z-50 p-6 flex justify-between items-center bg-white/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-rose-500 rounded-xl flex items-center justify-center text-white text-xl shadow-lg">
            🛡️
          </div>
          <span className="font-extrabold text-xl tracking-tight text-slate-700">ChildSafety</span>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="font-bold text-gray-600 hidden md:inline">Hi, {user.name}! 👋</span>
              <button
                onClick={handleLogout}
                className="bg-white/80 hover:bg-rose-50 text-rose-500 font-bold px-5 py-2 rounded-xl transition shadow-sm border border-rose-100"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="px-5 py-2 text-pink-600 font-bold hover:bg-pink-50 rounded-xl transition"
              >
                Login
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-5 py-2 bg-pink-500 hover:bg-pink-600 text-white font-bold rounded-xl shadow-lg shadow-pink-200 transition"
              >
                Get Started
              </button>
            </>
          )}
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="h-screen flex items-center justify-center px-6 pt-20">
        <div className="glass-panel p-14 text-center max-w-4xl backdrop-blur-xl bg-white/60">
          <h1 className="text-6xl font-black bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent mb-6">
            Child Safety Simulator
          </h1>
          <p className="text-xl text-gray-600 font-bold mb-10">
            🎮 Upload 3D models and simulate child safety scenarios with AI-powered behavior analysis
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href="#simulator"
              className="px-8 py-4 bg-pink-500 hover:bg-pink-600 text-white font-bold rounded-2xl shadow-xl shadow-pink-300/50 transition-all hover:scale-105"
            >
              Start Simulation 🚀
            </a>
            <a
              href="http://localhost:3000/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-2xl shadow-xl"
            >
              API Status
            </a>
          </div>
        </div>
      </section>

      {/* MAIN AREA */}
      <section id="simulator" className="min-h-screen py-20 px-8 bg-white/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-black text-slate-700 mb-10">Simulator Controls</h2>

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
                <label className="block text-sm font-bold text-gray-600 mb-2">📂 3D Model (GLB/GLTF)</label>
                <label className="cursor-pointer bg-white px-6 py-3 rounded-xl shadow-sm border-2 border-dashed border-pink-300 hover:border-pink-500 transition font-bold inline-block">
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="text-gray-600">{fileName || '📂 Choose File'}</span>
                </label>
              </div>

              {/* Age Group */}
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">👶 Age Group</label>
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
                <label className="block text-sm font-bold text-gray-600 mb-2">🤖 Agents</label>
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
                <label className="block text-sm font-bold text-gray-600 mb-2">⏱️ Duration (s)</label>
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
                {running ? '⏳ Running...' : '🚀 Run Simulation'}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {running && simResult && (
            <div className="mb-8 p-6 bg-white/60 rounded-2xl shadow-lg backdrop-blur">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-700">Progress</span>
                <span className="font-black text-2xl text-pink-500">{simResult.progress}%</span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-400 to-orange-500 transition-all duration-300"
                  style={{ width: `${simResult.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 3D Canvas Area */}
          <div className="h-[400px] bg-white/60 rounded-3xl border-4 border-white relative overflow-hidden shadow-inner mb-8">
            <Canvas3D modelPath={modelPath} fileName={fileName} />
          </div>

          {/* Results Section */}
          {simResult && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="glass-panel p-6 text-center">
                  <div className="text-4xl font-black text-pink-500">{simResult.progress}%</div>
                  <div className="text-sm font-bold text-gray-600 mt-2">Progress</div>
                </div>
                <div className="glass-panel p-6 text-center">
                  <div className="text-4xl font-black text-blue-500">{simResult.totalEvents}</div>
                  <div className="text-sm font-bold text-gray-600 mt-2">Collision Events</div>
                </div>
                <div className="glass-panel p-6 text-center">
                  <div className={'text-4xl font-black ' + (simResult.status === 'complete' ? 'text-green-500' : 'text-yellow-500')}>
                    {simResult.status === 'complete' ? '✅' : '⏳'}
                  </div>
                  <div className="text-sm font-bold text-gray-600 mt-2 capitalize">{simResult.status}</div>
                </div>
              </div>

              {/* Export Button */}
              {simResult.status === 'complete' && (
                <button
                  onClick={exportToExcel}
                  className="w-full px-6 py-4 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white font-black rounded-2xl shadow-lg transition-all"
                >
                  📊 Export to CSV/Excel
                </button>
              )}

              {/* Collision Events Table */}
              {simResult.events.length > 0 && (
                <div className="glass-panel p-8">
                  <h3 className="text-2xl font-black text-slate-700 mb-4">🎯 Collision Events</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-pink-200">
                          <th className="text-left py-2 px-4 font-black text-gray-700">Time</th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">Objects</th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">Position</th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">Severity</th>
                          <th className="text-left py-2 px-4 font-black text-gray-700">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simResult.events.slice(0, 20).map((evt, idx) => (
                          <tr key={idx} className="border-b border-pink-100 hover:bg-pink-50">
                            <td className="py-3 px-4">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                            <td className="py-3 px-4 font-bold">{evt.objects.join(' + ')}</td>
                            <td className="py-3 px-4 text-xs font-mono">
                              ({evt.position.x.toFixed(1)}, {evt.position.y.toFixed(1)}, {evt.position.z.toFixed(1)})
                            </td>
                            <td className="py-3 px-4">
                              <span className={'px-3 py-1 rounded-full text-xs font-bold ' +
                                (evt.severity === 'HIGH' ? 'bg-red-200 text-red-700' :
                                 evt.severity === 'MEDIUM' ? 'bg-yellow-200 text-yellow-700' :
                                 'bg-green-200 text-green-700')}>
                                {evt.severity}
                              </span>
                            </td>
                            <td className="py-3 px-4">{evt.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {simResult.events.length > 20 && (
                    <p className="text-gray-500 mt-4 font-bold">
                      Showing 20 of {simResult.events.length} events (export to see all)
                    </p>
                  )}
                </div>
              )}

              {/* No Events Message */}
              {simResult.events.length === 0 && simResult.status === 'complete' && (
                <div className="glass-panel p-8 text-center">
                  <p className="text-2xl font-black text-gray-600">✅ No collision events detected</p>
                  <p className="text-gray-500 mt-2">The environment appears safe for this age group</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white/60 backdrop-blur-md border-t border-pink-100 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-8 text-center">
          <p className="font-black text-slate-600">HUTECH University - AI Innovation Contest 2026</p>
          <p className="text-sm text-slate-500 mt-2">
            Đỗ Thư Kỳ (Backend) & Triệu Đoan Kỳ (Frontend)
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Simulator;
