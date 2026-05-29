import { CreateMLCEngine, MLCEngine } from '@mlc-ai/web-llm';

let engine: MLCEngine | null = null;
let isModelLoading = false;

// We use a tiny and fast SmolLM2-135M model optimized for WebGPU
const MODEL_NAME = 'SmolLM2-135M-Instruct-q4f16_1-MLC';

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  if (type === 'load_model') {
    if (engine || isModelLoading) return;
    
    isModelLoading = true;
    try {
      self.postMessage({ status: 'loading', message: 'Downloading tiny SmolLM2 model via WebGPU (first load)...' });
      
      engine = await CreateMLCEngine(MODEL_NAME, {
        initProgressCallback: (report) => {
          self.postMessage({ status: 'loading', message: report.text });
        }
      });
      
      self.postMessage({ status: 'ready', message: 'Local WebGPU model loaded successfully!' });
    } catch (err: any) {
      console.error(err);
      self.postMessage({ status: 'error', message: err?.message || 'Error loading model (requires WebGPU-enabled browser)' });
    } finally {
      isModelLoading = false;
    }
  }

  if (type === 'generate') {
    if (!engine) {
      self.postMessage({ status: 'error', message: 'Model not loaded yet' });
      return;
    }

    try {
      const { prompt } = data;
      self.postMessage({ status: 'generating' });

      const messages = [
        { role: 'system', content: 'You are an expert data analyst.' },
        { role: 'user', content: prompt }
      ];

      const chunks = await engine.chat.completions.create({
        messages: messages as any,
        temperature: 0.7,
        stream: true,
      });

      let text = "";
      for await (const chunk of chunks) {
        const curText = chunk.choices[0]?.delta?.content || "";
        text += curText;
        self.postMessage({ status: 'update', output: text });
      }

      self.postMessage({ 
        status: 'complete', 
        output: text 
      });
      
    } catch (err: any) {
      self.postMessage({ status: 'error', message: err?.message || 'Error generating insights' });
    }
  }
});
