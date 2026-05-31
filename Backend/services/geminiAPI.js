import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiAPIService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.initialized = false;

    this.modelNames = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];
    this.activeModelName = null;
    this.MAX_RETRIES = 3; 
    this.TIMEOUT_MS = 45000; 
    
    this.behaviorCache = this.createLRUCache(50);
    this.rareEventCache = this.createLRUCache(50);
  }

  /**
   * LRU Cache implementation
   */
  createLRUCache(maxSize) {
    return {
      cache: new Map(),
      maxSize,
      get(key) {
        if (!this.cache.has(key)) return null;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
      },
      set(key, value) {
        if (this.cache.has(key)) {
          this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
      },
      clear() {
        this.cache.clear();
      },
      size() {
        return this.cache.size;
      }
    };
  }

  /**
   * Khởi tạo kết nối an toàn với Google Generative AI
   */
  async init() {
    if (this.initialized) return true;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY is missing in environment variables');
      return false;
    }

    // Khởi tạo SDK chính thức của Google
    this.genAI = new GoogleGenerativeAI(apiKey);

    console.log('🧪 Testing Gemini endpoint stability...');
    
    // Vòng lặp quét tìm model phản hồi nhanh nhất và không bị lỗi endpoint
    for (const modelName of this.modelNames) {
      try {
        console.log(`   Trying model: ${modelName}...`);
        
        // CẤU HÌNH ĐỊNH TUYẾN AN TOÀN: Ép model chạy qua phiên bản api chính thức v1 thay vì v1beta bị lỗi
        const testModel = this.genAI.getGenerativeModel(
          { model: modelName },
          { apiVersion: 'v1' } // Khóa chặt phiên bản endpoint v1 để tránh lỗi fetching
        );

        // Gọi một lệnh test siêu ngắn để kiểm tra độ thông suốt của mạng/proxy
        const result = await Promise.race([
          testModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 1 }
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000))
        ]);

        if (result && result.response) {
          this.model = testModel;
          this.activeModelName = modelName;
          this.initialized = true;
          console.log(`🚀 Gemini Init successful. Active model: ${modelName}`);
          return true;
        }
      } catch (error) {
        console.warn(`   ⚠️ ${modelName} failed endpoint test: ${error.message}`);
      }
    }

    console.error('❌ Init failed: All Gemini models failed endpoint connectivity tests');
    return false;
  }

  isAvailable() {
    return this.initialized && this.model !== null;
  }

  /**
   * Gọi AI sinh luật hành vi động cho đứa trẻ dựa theo bối cảnh phòng 3D
   */
  async generateBehaviorPolicy(sceneData, ageGroupConfig) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not available or failed endpoint initialization');
    }

    const cacheKey = this.getCacheKey(sceneData.objects || []);
    const cached = this.behaviorCache.get(cacheKey);
    if (cached) return cached;

    // [CONTEXT RICHNESS] Calculate realistic constraints based on age group
    const avgSpeed = ageGroupConfig.kinematics?.speed || 0.15;
    const SIM_TIME = 25; // Typical simulation duration
    const MAX_TRAVEL_DIST = (avgSpeed * (SIM_TIME - 3)).toFixed(2);
    const locomotionMode = ageGroupConfig.canWalk ? 'walk/run' : 'crawl';
    const maxDurationPerBehavior = (SIM_TIME - 2).toFixed(1); // Leave 2s buffer

    const prompt = `You are a physics-based child behavior simulator for REALISTIC safety analysis.

## SIMULATION CONSTRAINTS (IMPORTANT)
- Simulation Duration: ${SIM_TIME}s (time budget is TIGHT)
- Age Group: "${ageGroupConfig.name}" (Height: ${ageGroupConfig.height}m, Locomotion: ${locomotionMode})
- Average Movement Speed: ${avgSpeed} m/s
- Max Travel Distance This Sim: ${MAX_TRAVEL_DIST}m
- Max Duration Per Behavior: ${maxDurationPerBehavior}s

## SCENE OBJECTS TO ANALYZE
${JSON.stringify(sceneData.objects || [], null, 2)}

## REQUIREMENTS FOR EACH BEHAVIOR
1. "duration" field = TOTAL time for complete behavior sequence
   - Must be ≤ ${maxDurationPerBehavior}s
   - Must include ALL action durations (walk_to + reach + grab + etc)
   - Example: walk_to (5s) + reach (0.5s) + grab (0.5s) = 6.0s duration
2. Target distance must be ≤ ${MAX_TRAVEL_DIST}m from room center (realistic)
3. Generate 4-6 behaviors, varied probabilities
4. Include both common behaviors (prob 0.3-0.4) and risky ones (prob 0.1-0.15)

## RETURN FORMAT (JSON ONLY - NO MARKDOWN)
[{
  "behaviorId": "unique_behavior_id",
  "description": "What the child does",
  "probability": 0.35,
  "action": "walk_to",
  "sequence": [
    {"action": "walk_to", "duration": 4.0, "target": "object_id_or_random"},
    {"action": "reach_up", "duration": 0.5, "target": "object_id"}
  ]
}]

STRICT JSON ONLY. No text before/after.`;

    let policies = await this.generateJSON(prompt);
    
    // [VALIDATION & NORMALIZATION] Ensure behaviors are realistic
    if (Array.isArray(policies)) {
      policies = policies.map(behavior => {
        // Validate & fix duration
        if (!behavior.duration && behavior.sequence) {
          behavior.duration = behavior.sequence.reduce((sum, act) => sum + (act.duration || 0), 0);
        }
        behavior.duration = Math.max(0.5, Math.min(behavior.duration || 5, SIM_TIME - 2));
        
        // Ensure sequence has durations
        if (behavior.sequence) {
          behavior.sequence = behavior.sequence.map(act => ({
            ...act,
            duration: Math.max(0.2, act.duration || 0.5)
          }));
        }
        
        return behavior;
      });
    }
    
    this.behaviorCache.set(cacheKey, policies);
    return policies;
  }

  /**
   * Sinh chuỗi sự kiện tai nạn hiếm gặp dựa trên phân tích rủi ro vật lý đồ nội thất
   */
  async generateRareEventChains(sceneData, ageGroupConfig) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not available or failed endpoint initialization');
    }

    const cacheKey = `rare_${this.getCacheKey(sceneData.objects || [])}`;
    const cached = this.rareEventCache.get(cacheKey);
    if (cached) return cached;

    const prompt = `Analyze these 3D objects for high-risk accidents: ${JSON.stringify(sceneData.objects || [])}.
      Target age: "${ageGroupConfig.name}".
      Generate rare event chains (probability < 0.005) like furniture toppling or ingestion.
      Return a strict JSON array format:
      [{
        "eventId": "event_id",
        "description": "Description",
        "probability": 0.002,
        "triggerConditions": ["cabinet"],
        "chain": [
          {"step": 1, "action": "climb_on", "objectId": "obj_X"},
          {"step": 2, "event": "object_tips"},
          {"step": 3, "event": "falls_on_child"}
        ]
      }]
      JSON only.`;

    const chains = await this.generateJSON(prompt);
    this.rareEventCache.set(cacheKey, chains);
    return chains;
  }

  /**
   * Hàm bổ trợ thực thi gọi text và ép kiểu phân tách JSON an toàn
   */
  async generateJSON(prompt) {
    let attempts = 0;
    while (attempts < this.MAX_RETRIES) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('API_TIMEOUT')), this.TIMEOUT_MS)
        );

        const apiCall = this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4
          }
        });

        const result = await Promise.race([apiCall, timeoutPromise]);
        const text = result.response.text();
        
        return JSON.parse(text.trim());
      } catch (error) {
        attempts++;
        console.error(`⚠️ Gemini prompt attempt ${attempts} failed: ${error.message}`);
        if (attempts >= this.MAX_RETRIES) throw error;
        await new Promise(res => setTimeout(res, 2000 * attempts));
      }
    }
    return [];
  }

  getCacheKey(objects) {
    const ids = objects.map(o => o.id || o.objectId || 'unknown').sort().join(',');
    return `cache_${ids.substring(0, 50)}`;
  }

  clearCache() {
    this.behaviorCache.clear();
    this.rareEventCache.clear();
    console.log('🗑️ Gemini LRU caches cleared');
  }

  getCacheStats() {
    return {
      behaviorCacheSize: this.behaviorCache.size(),
      rareEventCacheSize: this.rareEventCache.size()
    };
  }
}

export default new GeminiAPIService();