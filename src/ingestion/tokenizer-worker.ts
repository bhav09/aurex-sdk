import { env, AutoTokenizer } from '@xenova/transformers';

env.allowLocalModels = false;

let tokenizerPromise: Promise<any> | null = null;

self.onmessage = async (e) => {
  if (e.data.type === 'init') {
    if (!tokenizerPromise) {
      tokenizerPromise = AutoTokenizer.from_pretrained('Xenova/gpt-4');
    }
    try {
      await tokenizerPromise;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err) });
    }
  } else if (e.data.type === 'tokenize') {
    try {
      const tokenizer = await tokenizerPromise;
      const { text, id } = e.data;
      if (!tokenizer) throw new Error("Tokenizer not initialized");
      
      const { input_ids } = await tokenizer(text);
      self.postMessage({ type: 'tokenized', id, count: input_ids.size });
    } catch (err) {
      self.postMessage({ type: 'error', id: e.data.id, message: String(err) });
    }
  }
};
