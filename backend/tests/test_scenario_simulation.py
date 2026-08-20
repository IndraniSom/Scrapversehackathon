"""Simulation hypothetical labeling and non-mutation."""


from assessment_helpers import AS_OF, certification_leaf, company, group, turnover_leaf

from backend.eligibility import evaluate
from backend.scenario_simulation import (
    select_amendment_version,
    simulate,
    with_resolved_certification,
    with_temporary_turnover,
)


def test_simulation_never_mutates_accepted() -> None:
    """Hypothetical recomputation must leave accepted group and company unchanged."""
    base_group = group(turnover_leaf("120000000"), certification_leaf())
    bidder = company()
    before_group = base_group.model_dump_json()
    before_company = bidder.model_dump_json()
    hypothetical_company = with_temporary_turnover(bidder, {"2022-23": "200000000", "2023-24": "200000000", "2024-25": "200000000"})
    result = simulate(accepted_group=base_group, accepted_company=bidder, as_of=AS_OF, hypothetical_company=hypothetical_company, label="hypothetical")
    assert result.is_hypothetical is True
    assert result.label == "hypothetical"
    assert base_group.model_dump_json() == before_group
    assert bidder.model_dump_json() == before_company


def test_hypothetical_labeled_in_result() -> None:
    """Result must be flagged hypothetical and not overwritten accepted recommendation."""
    base = group(turnover_leaf("120000000"))
    bidder = company()
    accepted = evaluate(base, bidder, AS_OF)
    assert accepted.evaluation == "FAIL"
    sim = simulate(accepted_group=base, accepted_company=bidder, as_of=AS_OF, hypothetical_company=with_temporary_turnover(bidder, {"2022-23": "200000000", "2023-24": "200000000", "2024-25": "200000000"}))
    assert sim.is_hypothetical is True
    assert sim.result.evaluation == "PASS"
    assert accepted.evaluation == "FAIL"


def test_temporary_turnover_changes_outcome() -> None:
    """Temporary turnover patch can flip FAIL to PASS hypothetically."""
    base = group(turnover_leaf("90000000"))
    bidder = company(amounts=("80000000", "80000000", "80000000"))
    assert evaluate(base, bidder, AS_OF).children[0].evaluation == "FAIL"
    patched = with_temporary_turnover(bidder, {"2022-23": "95000000", "2023-24": "95000000", "2024-25": "95000000"})
    sim = simulate(accepted_group=base, accepted_company=bidder, as_of=AS_OF, hypothetical_company=patched)
    assert sim.result.children[0].evaluation == "PASS"


def test_resolve_unknown_flips_result() -> None:
    """Resolving an unknown certification makes hypothetical PASS."""
    from datetime import date

    base = group(certification_leaf())
    # Make bidder cert missing dates -> UNKNOWN
    bidder = company()
    unknown_bidder = bidder.model_copy(update={"certifications": [bidder.certifications[0].model_copy(update={"valid_from": None, "valid_until": None})]})
    assert evaluate(base, unknown_bidder, AS_OF).children[0].evaluation == "UNKNOWN"
    resolved = with_resolved_certification(unknown_bidder, date(2025, 1, 1), date(2027, 1, 1))
    sim = simulate(accepted_group=base, accepted_company=unknown_bidder, as_of=AS_OF, hypothetical_company=resolved)
    assert sim.result.children[0].evaluation == "PASS"


def test_amendment_version_selection() -> None:
    """Selecting amendment version recomputes with different threshold."""
    base = group(turnover_leaf("120000000"))
    amended = group(turnover_leaf("60000000"))
    bidder = company()
    chosen = select_amendment_version(base, amended, use_amended=True)
    assert chosen.model_dump_json() == amended.model_dump_json()
    # Hypothetical using amended should PASS where base FAILS
    sim_base = simulate(accepted_group=base, accepted_company=bidder, as_of=AS_OF)
    sim_amended = simulate(accepted_group=base, accepted_company=bidder, as_of=AS_OF, hypothetical_group=chosen, label="hypothetical-amendment")
    assert sim_base.result.children[0].evaluation == "FAIL"
    assert sim_amended.result.children[0].evaluation == "PASS"
    assert sim_amended.label == "hypothetical-amendment"
