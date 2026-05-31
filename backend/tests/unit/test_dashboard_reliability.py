"""Dashboard overview reliability rollup."""

from src.api.dashboard import _overview_from_events


class _Ev:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_overview_reliability_metrics():
    events = [
        _Ev(cost=0.02, outcome="degraded", cost_type="unfulfilled_spend", retry_count=0, model="gpt-4o", workflow_id="w1"),
        _Ev(cost=0.01, outcome="recovered", cost_type="inference", retry_count=1, model="gpt-4o-mini", workflow_id="w1", projected_cost=0.05, extra_metadata={"loss_avoided": 0.03}),
        _Ev(cost=0.0, outcome="success", cost_type="inference", retry_count=0, model="gpt-4o-mini", workflow_id="w1"),
    ]
    overview = _overview_from_events(events)
    assert overview["billed_but_failed_cost"] >= 0.02
    assert overview["loss_avoided"] >= 0.03
    assert "recovery_rate" in overview
