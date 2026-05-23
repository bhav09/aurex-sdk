"""
Smart Field Mapping System for LLM Usage Data
Handles various field naming conventions across different providers and formats
"""

from typing import Dict, List, Any, Optional, Tuple
import pandas as pd
from datetime import datetime

class FieldMapper:
    """
    Maps various field naming conventions to standardized internal field names.
    Supports fuzzy matching and semantic understanding of field names.
    """
    
    # Field mapping definitions - each key is the standardized field name
    # Values are lists of possible field name variations (case-insensitive)
    FIELD_MAPPINGS = {
        "timestamp": [
            "timestamp", "date", "created", "created_at", "time", 
            "logging_time", "log_time", "event_time", "starting_at", 
            "ending_at", "datetime", "ts", "event_timestamp"
        ],
        "model": [
            "model", "model_id", "modelid", "model_name", "modelname",
            "llm_model", "ai_model", "engine", "deployment"
        ],
        "provider": [
            "provider", "vendor", "service", "platform", "source",
            "api_provider", "llm_provider"
        ],
        "input_tokens": [
            "input_tokens", "prompt_tokens", "prompt_token_count",
            "input_token_count", "inputtokencount", "n_context_tokens_total",
            "context_tokens", "prompttokencount", "prompt_tokens_count"
        ],
        "output_tokens": [
            "output_tokens", "completion_tokens", "completion_token_count",
            "output_token_count", "outputtokencount", "n_generated_tokens_total",
            "generated_tokens", "completiontokencount", "candidates_token_count",
            "completion_tokens_count"
        ],
        "total_tokens": [
            "total_tokens", "tokens", "total_token_count", "totaltokencount",
            "token_count", "all_tokens"
        ],
        "cost": [
            "cost", "cost_usd", "total_cost", "total_cost_usd", "amount",
            "price", "charge", "billing_amount", "spend"
        ],
        "input_cost": [
            "input_cost", "input_cost_usd", "prompt_cost", "prompt_cost_usd",
            "input_price", "prompt_price"
        ],
        "output_cost": [
            "output_cost", "output_cost_usd", "completion_cost", "completion_cost_usd",
            "output_price", "completion_price"
        ],
        "latency_ms": [
            "latency_ms", "latency", "duration", "duration_ms", "response_time",
            "invocationlatency", "invocation_latency", "elapsed_time"
        ],
        "status": [
            "status", "state", "result", "outcome", "finish_reason",
            "stop_reason", "completion_status"
        ],
        "request_id": [
            "request_id", "requestid", "id", "event_id", "log_id",
            "trace_id", "transaction_id", "correlation_id"
        ],
        "user": [
            "user", "user_id", "userid", "username", "user_name",
            "customer", "customer_id", "account"
        ],
        "project": [
            "project", "project_id", "projectid", "workspace", "workspace_id",
            "organization", "organization_id", "org_id", "team"
        ],
        "feature": [
            "feature", "feature_tag", "feature_name", "use_case",
            "application", "app", "service_name"
        ],
        "workflow_id": [
            "workflow_id", "workflow", "workflowid", "session_id",
            "session", "conversation_id", "thread_id"
        ],
        "api_key": [
            "api_key", "apikey", "api_key_id", "api_key_name",
            "api_key_hint", "key_id"
        ],
        "cache_hit": [
            "cache_hit", "cached", "from_cache", "cache_read",
            "cache_used", "is_cached"
        ],
        "cache_read_tokens": [
            "cache_read_tokens", "cache_read_input_tokens",
            "cached_tokens", "cache_tokens_read"
        ],
        "cache_creation_tokens": [
            "cache_creation_tokens", "cache_creation_input_tokens",
            "cache_write_tokens", "tokens_cached"
        ],
        "wasteful_prompt": [
            "wasteful_prompt", "wasteful", "is_wasteful", "waste_detected"
        ]
    }
    
    # Nested field paths for complex JSON structures
    NESTED_PATHS = {
        "input_tokens": [
            ["response", "usageMetadata", "promptTokenCount"],
            ["usage", "prompt_tokens"],
            ["usage", "input_tokens"],
            ["metadata", "usage", "input_tokens"]
        ],
        "output_tokens": [
            ["response", "usageMetadata", "candidatesTokenCount"],
            ["usage", "completion_tokens"],
            ["usage", "output_tokens"],
            ["metadata", "usage", "output_tokens"]
        ],
        "total_tokens": [
            ["response", "usageMetadata", "totalTokenCount"],
            ["usage", "total_tokens"],
            ["metadata", "usage", "total_tokens"]
        ],
        "model": [
            ["request", "model"],
            ["metadata", "model"],
            ["config", "model"]
        ],
        "timestamp": [
            ["metadata", "timestamp"],
            ["metadata", "created_at"],
            ["event", "timestamp"]
        ],
        "cost": [
            ["metadata", "cost_usd"],
            ["billing", "cost"],
            ["usage", "cost"]
        ]
    }
    
    def __init__(self):
        # Create reverse mapping for fast lookup (lowercase field name -> standard name)
        self.reverse_map = {}
        for standard_name, variations in self.FIELD_MAPPINGS.items():
            for variation in variations:
                self.reverse_map[variation.lower()] = standard_name
    
    def find_field(self, row: pd.Series, field_name: str) -> Optional[Any]:
        """
        Find a field value in a row using smart mapping.
        
        Args:
            row: Pandas Series representing a data row
            field_name: Standardized field name to search for
            
        Returns:
            Field value if found, None otherwise
        """
        if field_name not in self.FIELD_MAPPINGS:
            return None
        
        # Try direct column name matches
        for variation in self.FIELD_MAPPINGS[field_name]:
            # Case-insensitive search in row index
            for col in row.index:
                if col.lower() == variation.lower():
                    val = row[col]
                    if pd.notna(val) and not isinstance(val, dict):
                        return val
        
        return None
    
    def find_nested_field(self, data: Dict, field_name: str) -> Optional[Any]:
        """
        Find a field value in nested JSON structure.
        
        Args:
            data: Dictionary representing JSON data
            field_name: Standardized field name to search for
            
        Returns:
            Field value if found, None otherwise
        """
        if field_name not in self.NESTED_PATHS:
            return None
        
        for path in self.NESTED_PATHS[field_name]:
            try:
                value = data
                for key in path:
                    value = value[key]
                if value is not None:
                    return value
            except (KeyError, TypeError):
                continue
        
        return None
    
    def extract_all_fields(self, row: pd.Series) -> Dict[str, Any]:
        """
        Extract all standardized fields from a row.
        
        Args:
            row: Pandas Series representing a data row
            
        Returns:
            Dictionary with standardized field names and their values
        """
        result = {}
        
        for standard_name in self.FIELD_MAPPINGS.keys():
            value = self.find_field(row, standard_name)
            if value is not None:
                result[standard_name] = value
        
        return result
    
    def get_metadata_fields(self, row: pd.Series) -> Dict[str, Any]:
        """
        Extract fields that should go into extra_metadata.
        Excludes core fields that have dedicated columns.
        
        Args:
            row: Pandas Series representing a data row
            
        Returns:
            Dictionary of metadata fields
        """
        # Core fields that have dedicated columns
        core_fields = {
            "timestamp", "model", "provider", "input_tokens", "output_tokens",
            "total_tokens", "cost", "input_cost", "output_cost", "workflow_id",
            "cache_read_tokens", "cache_creation_tokens"
        }
        
        metadata = {}
        
        # Get all field variations that are core fields (lowercase)
        core_variations = set()
        for core_field in core_fields:
            if core_field in self.FIELD_MAPPINGS:
                core_variations.update(v.lower() for v in self.FIELD_MAPPINGS[core_field])
        
        # Extract non-core fields
        for col in row.index:
            col_lower = col.lower()
            
            # Skip if it's a core field
            if col_lower in core_variations:
                continue
            
            # Skip metadata/payload columns (handled separately)
            if col_lower in ["metadata", "jsonpayload", "payload", "labels", "resource"]:
                continue
            
            try:
                val = row[col]
                # Convert to scalar if it's a numpy/pandas type
                if hasattr(val, "item"):
                    val = val.item()
                # Check if value is not null (now it's a scalar)
                if val is not None and not (isinstance(val, float) and pd.isna(val)):
                    metadata[col] = val
            except (KeyError, AttributeError, ValueError):
                pass
        
        return metadata
    
    def normalize_provider_name(self, provider: Optional[str]) -> Optional[str]:
        """
        Normalize provider names to standard format.
        
        Args:
            provider: Raw provider name
            
        Returns:
            Normalized provider name
        """
        if not provider:
            return None
        
        provider_lower = provider.lower().strip()
        
        # Provider name mappings
        provider_map = {
            "openai": ["openai", "open-ai", "open_ai"],
            "anthropic": ["anthropic", "claude"],
            "google": ["google", "gemini", "vertex", "vertexai", "vertex-ai"],
            "aws": ["aws", "bedrock", "amazon"],
            "azure": ["azure", "microsoft"],
            "cohere": ["cohere"],
            "meta": ["meta", "llama"],
            "mistral": ["mistral", "mixtral"]
        }
        
        for standard_name, variations in provider_map.items():
            if any(v in provider_lower for v in variations):
                return standard_name
        
        return provider
    
    def parse_timestamp(self, value: Any) -> Optional[datetime]:
        """
        Parse various timestamp formats.
        
        Args:
            value: Timestamp value in various formats
            
        Returns:
            Parsed datetime object or None
        """
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        
        try:
            return pd.to_datetime(value)
        except:
            return None
    
    def parse_boolean(self, value: Any) -> Optional[bool]:
        """
        Parse various boolean representations.
        
        Args:
            value: Boolean value in various formats
            
        Returns:
            Boolean value or None
        """
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        
        if isinstance(value, bool):
            return value
        
        if isinstance(value, (int, float)):
            return bool(value)
        
        if isinstance(value, str):
            value_lower = value.lower().strip()
            if value_lower in ["true", "yes", "1", "t", "y"]:
                return True
            if value_lower in ["false", "no", "0", "f", "n"]:
                return False
        
        return None


# Global instance
field_mapper = FieldMapper()

# Made with Bob
