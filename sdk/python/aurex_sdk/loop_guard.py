import time
from typing import Dict, List, Any, Optional
from aurex_sdk.semantic import jaccard_ngram_similarity

class LoopGuardState:
    def __init__(self):
        self.history: List[Dict[str, Any]] = []

class LoopGuard:
    def __init__(self, similarity_threshold: float = 0.85, window_seconds: float = 60.0, max_history: int = 5):
        self.similarity_threshold = similarity_threshold
        self.window_seconds = window_seconds
        self.max_history = max_history
        self._states: Dict[str, LoopGuardState] = {}

    def _get_state(self, workflow_id: str) -> LoopGuardState:
        if workflow_id not in self._states:
            self._states[workflow_id] = LoopGuardState()
        return self._states[workflow_id]

    def check_for_loop(self, workflow_id: str, messages: List[Dict[str, Any]]) -> bool:
        """
        Returns True if a loop is detected, False otherwise.
        """
        # If no workflow_id is provided, we can't reliably track state
        if not workflow_id or workflow_id == "unknown":
            return False

        state = self._get_state(workflow_id)
        now = time.time()
        
        # Cleanup old history based on time window
        state.history = [h for h in state.history if now - h['timestamp'] < self.window_seconds]

        # Extract representation for the current state
        current_text = ""
        if messages and len(messages) > 0:
            last_msg = messages[-1]
            # Use content or tool_calls for structural tracking
            content = last_msg.get("content", "")
            tool_calls = last_msg.get("tool_calls", [])
            current_text = f"{content}::{tool_calls}"
            
        if not current_text or current_text == "::[]":
            return False

        # 1. Structural matching: check exact repeats in the last few messages
        for past in state.history[-3:]:
            if past['text'] == current_text:
                return True
                
        # 2. Semantic matching: Jaccard similarity > threshold
        if len(state.history) >= 2:
            for past in state.history[-3:]:
                if current_text and past['text']:
                    try:
                        sim = jaccard_ngram_similarity(current_text, past['text'])
                        if sim > self.similarity_threshold:
                            return True
                    except Exception:
                        pass

        # Append to history
        state.history.append({
            'timestamp': now,
            'text': current_text
        })
        
        if len(state.history) > self.max_history:
            state.history.pop(0)

        return False
