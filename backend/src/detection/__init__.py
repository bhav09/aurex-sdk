"""
Detection package
"""
from .engine import DetectionEngine, IssueDetection, analyze_workflow, analyze_all
from .enhanced_engine import EnhancedDetectionEngine, ExecutiveSummary, WorkflowAnalysis, EnhancedIssue

__all__ = [
    "DetectionEngine",
    "IssueDetection",
    "analyze_workflow",
    "analyze_all",
    "EnhancedDetectionEngine",
    "ExecutiveSummary",
    "WorkflowAnalysis",
    "EnhancedIssue"
]


