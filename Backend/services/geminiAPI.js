import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiAPIService {
  
  constructor() {
    this.genAI = null;
    this.model = null;
    this.initialized = false;
    this.modelNames = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash-001',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite-001',
      'gemini-2.0-flash-lite',
      'gemini-pro-latest',
      'gemini-2.5-flash-lite'
    ];
    this.activeModelName = null;
    this.MAX_RETRIES = 3; //  Increased from 2
    this.TIMEOUT_MS = 45000; //  45 seconds (was 20s)
    
    // LRU Cache with size limit
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
        
        // Move to end (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        
        return value;
      },
      
      set(key, value) {
        // Remove if exists
        if (this.cache.has(key)) {
          this.cache.delete(key);
        }
        
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
          console.log(`🗑️ LRU evicted: ${firstKey}`);
        }
        
        this.cache.set(key, value);
      },
      
      has(key) {
        return this.cache.has(key);
      },
      
      clear() {
        this.cache.clear();
      },
      
      size() {
        return this.cache.size;
      }
    };
  }

  async init() {
    if (this.initialized) return;
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not found in .env');
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      
      for (const modelName of this.modelNames) {
        try {
          console.log(`🧪 Trying model: ${modelName}`);
          const testModel = this.genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              temperature: 0.5,
              topK: 20,
              topP: 0.9,
              maxOutputTokens: 4096,
            }
          });
          
          const testResult = await this.withTimeout(
            testModel.generateContent('OK'),
            5000
          );
          await testResult.response.text();
          
          this.model = testModel;
          this.activeModelName = modelName;
          this.initialized = true;
          console.log(`✅ Gemini API initialized with: ${modelName}`);
          return;
          
        } catch (error) {
          console.log(`❌ ${modelName}: ${error.message.substring(0, 100)}`);
          continue;
        }
      }
      
      throw new Error('All Gemini models failed');
      
    } catch (error) {
      console.error('❌ Gemini init failed:', error.message);
    }
  }

  /**
   * Proper timeout with cleanup
   */
  withTimeout(promise, timeoutMs) {
    let timeoutId;
    
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise])
      .finally(() => {
        // Always clear timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
  }

  isAvailable() {
    return this.initialized && this.model !== null;
  }

  /**
   *  Exponential backoff retry strategy
   */
  async generateJSON(prompt, retryCount = 0) {
    if (!this.isAvailable()) {
      throw new Error('Gemini API not available');
    }

    //  Calculate backoff delay: 1s, 2s, 4s, 8s, max 10s
    const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);

    try {
      const result = await this.withTimeout(
        this.model.generateContent(prompt),
        this.TIMEOUT_MS
      );
      
      const response = await result.response;
      const rawText = response.text();
      const jsonText = this.extractJSON(rawText);

      try {
        return JSON.parse(jsonText);
      } catch (parseErr) {
        console.error('❌ JSON parsing failed');
        console.error('   Raw response length:', rawText.length);
        console.error('   Extracted JSON length:', jsonText.length);
        
        if (retryCount < this.MAX_RETRIES) {
          console.log(`🔄 Retrying due to parse error... (${retryCount + 1}/${this.MAX_RETRIES})`);
          console.log(`   Waiting ${backoffDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          return this.generateJSON(prompt, retryCount + 1);
        }
        
        throw parseErr;
      }

    } catch (error) {
      //  Better error handling with exponential backoff
      const shouldRetry = 
        error.message === 'Request timeout' ||
        error.message.includes('429') || // Rate limit
        error.message.includes('503') || // Service unavailable
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT');
      
      if (shouldRetry && retryCount < this.MAX_RETRIES) {
        console.error(`❌ Gemini request failed: ${error.message}`);
        console.log(`🔄 Retrying with exponential backoff... (${retryCount + 1}/${this.MAX_RETRIES})`);
        console.log(`   Waiting ${backoffDelay}ms before retry...`);
        
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return this.generateJSON(prompt, retryCount + 1);
      }
      
      console.error('❌ Gemini request failed after all retries');
      throw error;
    }
  }

  extractJSON(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      throw new Error('Empty Gemini response');
    }

    let text = rawText.trim();
    text = text.replace(/^\uFEFF/, '').trim();

    const fencedMatch = text.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
    if (fencedMatch) text = fencedMatch[1].trim();

    text = text.replace(/^`+/, '').replace(/`+$/, '').trim();

    const firstArrayStart = text.indexOf('[');
    const firstObjStart = text.indexOf('{');

    let start = -1;
    if (firstArrayStart !== -1 && firstObjStart !== -1) {
      start = Math.min(firstArrayStart, firstObjStart);
    } else {
      start = firstArrayStart !== -1 ? firstArrayStart : firstObjStart;
    }

    if (start === -1) {
      throw new Error(`No JSON found in response`);
    }

    const openChar = text[start];
    const closeChar = openChar === '[' ? ']' : '}';

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;

      if (depth === 0 && (ch === closeChar)) {
        end = i;
        break;
      }
    }

    if (end !== -1) {
      return text.slice(start, end + 1).trim();
    }

    console.warn('⚠️ JSON appears truncated, attempting recovery...');
    
    if (openChar === '[') {
      const slice = text.slice(start);
      const lastObjEnd = slice.lastIndexOf('}');
      
      if (lastObjEnd !== -1) {
        let candidate = slice.slice(0, lastObjEnd + 1).trim();
        candidate = candidate.replace(/,\s*$/, '');
        candidate = candidate + ']';
        
        try {
          JSON.parse(candidate);
          console.log('✅ Recovered truncated array');
          return candidate;
        } catch {
          // Recovery failed
        }
      }
      
      return '[]';
    }

    if (openChar === '{') {
      const slice = text.slice(start);
      let candidate = slice.trim().replace(/,\s*$/, '') + '}';
      
      try {
        JSON.parse(candidate);
        console.log('✅ Recovered truncated object');
        return candidate;
      } catch {
        // Recovery failed
      }
    }

    throw new Error('JSON truncated and recovery failed');
  }

  /**
   * Enhanced classification with LRU cache
   */
  async enhanceClassification(objects, ruleBasedClassification) {
    if (!this.isAvailable()) {
      console.log('ℹ️ AI classification skipped (API not available)');
      return ruleBasedClassification;
    }

    const cacheKey = this.getCacheKey(objects);
    
    // Use LRU cache
    const cached = this.behaviorCache.get(cacheKey);
    if (cached) {
      console.log('📦 Using LRU cached classification');
      return cached;
    }

    console.log(`🤖 Gemini: Enhancing ${objects.length} objects...`);

    try {
      const objectsData = ruleBasedClassification
        .sort((a, b) => b.classification.dangerScore - a.classification.dangerScore)
        .slice(0, 10)
        .map((obj, idx) => ({
          index: idx,
          name: obj.name,
          dimensions: {
            w: obj.classification.dimensions.width.toFixed(1),
            h: obj.classification.dimensions.height.toFixed(1),
            d: obj.classification.dimensions.depth.toFixed(1)
          },
          category: obj.classification.category,
          danger: obj.classification.dangerScore
        }));

      const prompt = `Analyze furniture safety for children. Return JSON array only.

Objects: ${JSON.stringify(objectsData)}

For each, return:
{
  "objectIndex": <number>,
  "category": "<type>",
  "canClimb": <bool>,
  "canPull": <bool>,
  "tippingRisk": "low|medium|high",
  "aiDanger": <0-10>
}

JSON array only, no text.`;

      const aiClassifications = await this.generateJSON(prompt);

      if (!Array.isArray(aiClassifications)) {
        throw new Error('Expected array from Gemini');
      }

      const enhanced = ruleBasedClassification.map((obj, idx) => {
        const aiClass = aiClassifications.find(c => c.objectIndex === idx);
        
        if (!aiClass) return obj;

        return {
          ...obj,
          classification: {
            ...obj.classification,
            category: aiClass.category || obj.classification.category,
            aiDangerScore: aiClass.aiDanger,
            dangerScore: Math.round(
              (obj.classification.dangerScore + aiClass.aiDanger) / 2
            ),
            properties: {
              ...obj.classification.properties,
              canClimb: aiClass.canClimb,
              canPull: aiClass.canPull,
              tippingRisk: aiClass.tippingRisk
            },
            method: 'ai-enhanced',
            confidence: 0.85
          }
        };
      });

      // Store in LRU cache
      this.behaviorCache.set(cacheKey, enhanced);

      console.log('✅ Gemini classification complete');
      return enhanced;

    } catch (error) {
      console.error('❌ Gemini classification failed:', error.message);
      return ruleBasedClassification;
    }
  }

  /**
   * Behavior generation with LRU cache
   */
  async generateBehaviorPolicy(sceneData, ageGroup) {
    if (!this.isAvailable()) {
      return this.getDefaultBehaviorPolicy(ageGroup);
    }

    const cacheKey = `behaviors_${sceneData.id}_${ageGroup.id}`;
    
    // Use LRU cache
    const cached = this.behaviorCache.get(cacheKey);
    if (cached) {
      console.log(`📦 Using LRU cached behaviors for ${ageGroup.id}`);
      return cached;
    }

    console.log(`🤖 Generating behaviors for ${ageGroup.name}...`);

    try {
      const objectsList = sceneData.objects
        .filter(obj => obj.classification?.category === 'furniture')
        .sort((a, b) => b.classification.dangerScore - a.classification.dangerScore)
        .slice(0, 8)
        .map(obj => ({
          id: obj.id,
          name: obj.name,
          type: obj.classification.subcategory,
          canClimb: obj.classification.properties?.canClimb,
          danger: obj.classification.dangerScore
        }));

      const prompt = `Generate ${ageGroup.name} behaviors (age ${ageGroup.ageRange}). 
Height: ${ageGroup.height}m, Can climb: ${ageGroup.canClimb}

Objects: ${JSON.stringify(objectsList)}

Return 3-5 behaviors as JSON array:
[{
  "behaviorId": "id",
  "probability": 0.5,
  "sequence": [
    {"action": "walk_to", "targetObjectId": "obj_X", "duration": 2},
    {"action": "reach_up|pull|climb_on", "duration": 1}
  ]
}]

JSON only.`;

      const behaviors = await this.generateJSON(prompt);
      
      // Store in LRU cache
      this.behaviorCache.set(cacheKey, behaviors);
      
      console.log(`✅ Generated ${behaviors.length} behaviors`);
      return behaviors;

    } catch (error) {
      console.error('❌ Behavior generation failed:', error.message);
      return this.getDefaultBehaviorPolicy(ageGroup);
    }
  }

  /**
   * Rare events with LRU cache
   */
  async generateRareEventChains(sceneData, ageGroup) {
    if (!this.isAvailable()) {
      return [];
    }

    const cacheKey = `events_${sceneData.id}_${ageGroup.id}`;
    
    // Use LRU cache
    const cached = this.rareEventCache.get(cacheKey);
    if (cached) {
      console.log(`📦 Using LRU cached rare events for ${ageGroup.id}`);
      return cached;
    }

    console.log(`🤖 Generating rare events for ${ageGroup.name}...`);

    try {
      const dangerousObjects = sceneData.objects
        .filter(obj => obj.classification?.dangerScore >= 6)
        .sort((a, b) => b.classification.dangerScore - a.classification.dangerScore)
        .slice(0, 5)
        .map(obj => ({
          id: obj.id,
          name: obj.name,
          type: obj.classification.subcategory,
          tippingRisk: obj.classification.properties?.tippingRisk
        }));

      if (dangerousObjects.length === 0) {
        return [];
      }

      const prompt = `Generate 2-3 rare accident chains for ${ageGroup.name}.

Objects: ${JSON.stringify(dangerousObjects)}

JSON array:
[{
  "eventChainId": "id",
  "estimatedProbability": 0.001,
  "severity": "critical",
  "chain": [
    {"step": 1, "action": "climb_on", "objectId": "obj_X"},
    {"step": 2, "event": "object_tips"},
    {"step": 3, "event": "falls_on_child"}
  ]
}]

JSON only.`;

      const chains = await this.generateJSON(prompt);
      
      // Store in LRU cache
      this.rareEventCache.set(cacheKey, chains);
      
      console.log(`✅ Generated ${chains.length} rare events`);
      return chains;

    } catch (error) {
      console.error('❌ Rare events failed:', error.message);
      return [];
    }
  }

  getCacheKey(objects) {
    const ids = objects.map(o => o.id).sort().join(',');
    return `cache_${ids.substring(0, 50)}`;
  }

  /**
   * Clear caches properly
   */
  clearCache() {
    this.behaviorCache.clear();
    this.rareEventCache.clear();
    console.log('🗑️ Gemini LRU caches cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      behaviorCache: {
        size: this.behaviorCache.size(),
        maxSize: this.behaviorCache.maxSize
      },
      rareEventCache: {
        size: this.rareEventCache.size(),
        maxSize: this.rareEventCache.maxSize
      },
      timeout: this.TIMEOUT_MS,
      maxRetries: this.MAX_RETRIES
    };
  }

  getDefaultBehaviorPolicy(ageGroup) {
    return [{
      behaviorId: 'random_walk',
      description: 'Random exploration movement',
      probability: 1.0,
      sequence: [{ action: 'walk_random', duration: 10.0 }]
    }];
  }
}

export default new GeminiAPIService();