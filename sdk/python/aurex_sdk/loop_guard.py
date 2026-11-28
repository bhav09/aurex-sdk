import hashlib
import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from aurex_sdk.semantic import jaccard_ngram_similarity

_DATA_URI_RE = re.compile(r"data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+")


def summarize_content_for_loop(content: Any) -> str:
    """Summarize message content for loop detection, replacing raw base64 images with compact SHA-256 digests."""
    if content is None:
        return ""
    if isinstance(content, str):
        return _DATA_URI_RE.sub(
            lambda m: f"[img:{hashlib.sha256(m.group(0).encode('utf-8')).hexdigest()[:12]}]",
            content,
        )
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(summarize_content_for_loop(block))
            elif isinstance(block, dict):
                btype = block.get("type", "")
                if btype in ("image_url", "input_image"):
                    img_obj = block.get("image_url") or block.get("url") or ""
                    url_str = img_obj.get("url", "") if isinstance(img_obj, dict) else str(img_obj)
                    digest = hashlib.sha256(url_str.encode("utf-8")).hexdigest()[:12]
                    parts.append(f"[img:{digest}]")
                elif btype == "image":
                    src = block.get("source") or {}
                    raw = src.get("data") or src.get("url") or json.dumps(src, sort_keys=True, default=str)
                    digest = hashlib.sha256(str(raw).encode("utf-8")).hexdigest()[:12]
                    parts.append(f"[img:{digest}]")
                elif "text" in block:
                    parts.append(summarize_content_for_loop(block.get("text")))
                else:
                    parts.append(json.dumps(block, sort_keys=True, default=str))
            else:
                parts.append(str(block))
        return " ".join(p for p in parts if p)
    if isinstance(content, dict):
        return json.dumps(content, sort_keys=True, default=str)
    return str(content)


def canonicalize_tool_call_signature(tc: Dict[str, Any]) -> Tuple[str, str, bool]:
    """Return (tool_name, full_signature, has_non_empty_args) for structural loop detection."""
    fn = tc.get("function") if isinstance(tc, dict) else None
    if not isinstance(fn, dict):
        return "", "", False
    name = str(fn.get("name") or "")
    if not name:
        return "", "", False
    raw_args = fn.get("arguments")
    canon_args = ""
    if isinstance(raw_args, dict):
        canon_args = json.dumps(raw_args, sort_keys=True, separators=(",", ":"), default=str)
    elif isinstance(raw_args, str):
        stripped = raw_args.strip()
        if stripped and stripped != "{}":
            try:
                parsed = json.loads(stripped)
                canon_args = json.dumps(parsed, sort_keys=True, separators=(",", ":"), default=str)
            except Exception:
                canon_args = stripped
    elif raw_args is not None:
        canon_args = str(raw_args).strip()
    if canon_args in ("", "{}", "null", "None"):
        return name, name, False
    return name, f"{name}({canon_args})", True


class LoopGuardState:
    def __init__(self) -> None:
        self.history: List[Dict[str, Any]] = []


class LoopGuard:
    def __init__(self, similarity_threshold: float = 0.80, window_seconds: float = 60.0, max_history: int = 5):
        self.similarity_threshold = similarity_threshold
        self.window_seconds = window_seconds
        self.max_history = max_history
        self._states: Dict[str, LoopGuardState] = {}

    def _get_state(self, workflow_id: str) -> LoopGuardState:
        if workflow_id not in self._states:
            self._states[workflow_id] = LoopGuardState()
        return self._states[workflow_id]

    def check_for_loop(
        self,
        workflow_id: str,
        messages: List[Dict[str, Any]],
        similarity_threshold: Optional[float] = None,
    ) -> bool:
        """Return True if a structural or semantic message loop is detected."""
        if not workflow_id or workflow_id == "unknown":
            return False

        thresh = self.similarity_threshold if similarity_threshold is None else float(similarity_threshold)
        state = self._get_state(workflow_id)
        now = time.time()

        state.history = [h for h in state.history if now - h["timestamp"] < self.window_seconds]

        current_text = ""
        current_NonImageText = ""
        if messages and len(messages) > 0:
            last_msg = messages[-1]
            if isinstance(last_msg, dict):
                raw_content = last_msg.get("content", "")
                summarized = summarize_content_for_loop(raw_content)
                tool_calls = last_msg.get("tool_calls", [])
                tc_sigs = [canonicalize_tool_call_signature(tc)[1] for tc in tool_calls if isinstance(tc, dict)]
                current_text = f"{summarized}::{tc_sigs}"
                # Strip [img:...] tags when computing pure text semantic similarity so distinct screenshots don't skew Jaccard
                text_only = re.sub(r"\[img:[0-9a-f]{12}\]", "", summarized).strip()
                current_NonImageText = f"{text_only}::{tc_sigs}" if (text_only or tc_sigs) else ""

        if not current_text or current_text == "::[]":
            return False

        # 1. Exact match (catches identical tool error outputs or identical screenshot + prompt repeats immediately)
        for past in state.history[-3:]:
            if past["text"] == current_text:
                return True

        # 2. Semantic matching on non-base64 text using configured similarity threshold
        if len(state.history) >= 2 and current_NonImageText:
            for past in state.history[-3:]:
                past_clean = past.get("clean_text") or ""
                if past_clean:
                    try:
                        sim = jaccard_ngram_similarity(current_NonImageText, past_clean)
                        if sim >= thresh:
                            return True
                    except Exception:
                        pass

        state.history.append(
            {
                "timestamp": now,
                "text": current_text,
                "clean_text": current_NonImageText,
            }
        )

        if len(state.history) > self.max_history:
            state.history.pop(0)

        return False
