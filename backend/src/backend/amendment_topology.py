"""Recursive authority-change topology and unchanged-node validation."""

from backend.contracts.evaluation import (
    RuleGroup,
    RuleLeaf,
    UnsupportedRuleLeaf,
)


def validate_single_change(
    base: RuleGroup, amendment: RuleGroup, changed_rule_id: str
) -> None:
    """Reject missing, extra, reordered, reparented, or mutated unchanged inputs."""
    base_leaves = leaf_map(base)
    amendment_leaves = leaf_map(amendment)
    if base_leaves.keys() != amendment_leaves.keys() or changed_rule_id not in base_leaves:
        raise ValueError("amendment does not preserve stable rule IDs")
    _validate_topology(base, amendment, changed_rule_id)
    old = base_leaves[changed_rule_id]
    new = amendment_leaves[changed_rule_id]
    if old.kind != new.kind or old == new:
        raise ValueError("changed rule must replace the same predicate kind")


def _validate_topology(
    base: RuleGroup | RuleLeaf,
    amendment: RuleGroup | RuleLeaf,
    changed_rule_id: str,
) -> None:
    """Compare recursive IDs, order, parentage, operators, minima, and fixed nodes."""
    if isinstance(base, RuleGroup) != isinstance(amendment, RuleGroup):
        raise ValueError("amendment rule topology changed")
    if isinstance(base, RuleGroup) and isinstance(amendment, RuleGroup):
        old_shape = (base.id, base.operator, base.minimum_matches, len(base.children))
        new_shape = (
            amendment.id,
            amendment.operator,
            amendment.minimum_matches,
            len(amendment.children),
        )
        if old_shape != new_shape:
            raise ValueError("amendment rule topology changed")
        for old_child, new_child in zip(base.children, amendment.children, strict=True):
            if isinstance(old_child, UnsupportedRuleLeaf) or isinstance(
                new_child, UnsupportedRuleLeaf
            ):
                raise TypeError("unsupported rule cannot enter judge-facing assessment")
            _validate_topology(old_child, new_child, changed_rule_id)
        return
    assert isinstance(base, RuleLeaf) and isinstance(amendment, RuleLeaf)
    if base.id != amendment.id:
        raise ValueError("amendment rule topology changed")
    if base.id == changed_rule_id:
        old_fixed = base.model_dump(exclude={"predicate", "evidence"})
        new_fixed = amendment.model_dump(exclude={"predicate", "evidence"})
        if old_fixed != new_fixed:
            raise ValueError("amendment changed non-predicate rule metadata")
    elif base != amendment:
        raise ValueError("only changed rule may differ")


def leaf_map(group: RuleGroup) -> dict[str, RuleLeaf]:
    """Flatten supported leaves and reject duplicates or unsupported persisted input."""
    found: dict[str, RuleLeaf] = {}
    for child in group.children:
        if isinstance(child, RuleGroup):
            nested = leaf_map(child)
            if found.keys() & nested.keys():
                raise ValueError("duplicate rule ID")
            found.update(nested)
        elif isinstance(child, UnsupportedRuleLeaf):
            raise TypeError("unsupported rule cannot enter judge-facing assessment")
        elif child.id in found:
            raise ValueError("duplicate rule ID")
        else:
            found[child.id] = child
    return found
