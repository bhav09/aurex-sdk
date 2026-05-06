import { pipeline, TextGenerationPipeline, env } from '@huggingface/transformers';

// Skip local model check since we are running in browser
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1; // Sometimes helps with stability in browsers

let generator: TextGenerationPipeline | null = null;
let isModelLoading = false;

// We use Qwen2.5-0.5B-Instruct as it's small and very capable for instruction following
// Or we could use Xenova/Qwen1.5-0.5B-Chat. Let's use HuggingFaceTB/SmolLM-135M-Instruct
const MODEL_NAME = 'HuggingFaceTB/SmolLM-135M-Instruct';

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  if (type === 'load_model') {
    if (generator || isModelLoading) return;
    
    isModelLoading = true;
    try {
      self.postMessage({ status: 'loading', message: 'Downloading model (this may take a while on first load)...' });
      
      generator = await pipeline('text-generation', MODEL_NAME, {
        dtype: 'q4', // 4-bit quantization to save memory
        progress_callback: (x: any) => {
          self.postMessage({ status: 'progress', data: x });
        }
      });
      
      self.postMessage({ status: 'ready', message: 'Model loaded successfully!' });
    } catch (err: any) {
      self.postMessage({ status: 'error', message: err?.message || 'Error loading model' });
    } finally {
      isModelLoading = false;
    }
  }

  if (type === 'generate') {
    if (!generator) {
      self.postMessage({ status: 'error', message: 'Model not loaded yet' });
      return;
    }

    try {
      const { prompt } = data;
      self.postMessage({ status: 'generating' });

      // Using an async generator for streaming output is possible, or we can use the callback
      // We'll use the callback to stream tokens back
      
      const messages = [
        { role: 'system', content: 'You are an expert data analyst.' },
        { role: 'user', content: prompt }
      ];

      // Format with chat template if supported, otherwise just concat
      // SmolLM supports chat template
      const formattedPrompt = generator.tokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      }) as string;

      const output = await generator(formattedPrompt, {
        max_new_tokens: 500,
        temperature: 0.7,
        do_sample: true,
        repetition_penalty: 1.1,
        // @ts-ignore - The callback is supported but types might not perfectly align
        callback_function: (beams: any[]) => {
          const decodedText = generator?.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
          // Send the current text update
          // We need to extract just the generated part, after the prompt
          self.postMessage({ status: 'update', output: decodedText });
        }
      });

      const finalOutput = Array.isArray(output) ? output[0].generated_text : output.generated_text;
      
      self.postMessage({ 
        status: 'complete', 
        output: finalOutput 
      });
      
    } catch (err: any) {
      self.postMessage({ status: 'error', message: err?.message || 'Error generating insights' });
    }
  }
});
