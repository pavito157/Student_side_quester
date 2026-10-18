"""Order NEW quests by straight-line distance, never claimed walking time.

At most ten stops: subset dynamic programming minimizes the open path from the
submitted origin while respecting genuine prerequisite edges. No return trip is
assumed. Without an origin, retain the proposed activity order.
"""
from functools import lru_cache

from backend.quests.quest_contracts import GeneratedQuestProposal, MAX_QUEST_DESTINATIONS
from backend.quests.quest_validation import calculate_distance


def geographic_order(stops, origin, dependencies=()):
    count = len(stops)
    if not 1 <= count <= MAX_QUEST_DESTINATIONS:
        raise ValueError("Invalid route size")
    required = [0] * count
    for dependency in dependencies:
        before, after = dependency.before, dependency.after
        # Original activity groups must already respect stated prerequisites.
        # This rejects self-dependencies, cycles and contradictory draft order.
        if not 0 <= before < after < count:
            raise ValueError("Invalid activity dependency")
        required[after] |= 1 << before
    if origin is None or count == 1:
        return list(range(count))
    distances = [[calculate_distance(a.latitude, a.longitude, b.latitude, b.longitude)
                  for b in stops] for a in [*stops, origin]]
    complete = (1 << count) - 1

    @lru_cache(maxsize=None)
    def visit(mask, previous):
        if mask == complete:
            return 0.0, ()
        options = []
        for index in range(count):
            if mask & (1 << index) or required[index] & mask != required[index]:
                continue
            cost, path = visit(mask | (1 << index), index)
            options.append((distances[previous][index] + cost, (index, *path)))
        return min(options)

    return list(visit(0, count)[1])


def order_new_quest(proposal, stops, origin):
    order = geographic_order(stops, origin, proposal.routeDependencies)
    if order == list(range(len(stops))):
        return proposal, stops
    step_order = [index for old_stop in order
                  for index, stop_index in enumerate(proposal.stepDestinationIndexes)
                  if stop_index == old_stop]
    steps = list(proposal.steps)
    suffix = f" You're done when {proposal.completionCriteria}" if proposal.completionCriteria else ""
    if suffix and steps[-1].endswith(suffix):
        steps[-1] = steps[-1][:-len(suffix)]
    steps = [steps[index] for index in step_order]
    if suffix:
        steps[-1] += suffix
    inverse = {old: new for new, old in enumerate(order)}
    ordered_stops = [stops[index] for index in order]
    # Validate the whole remapped proposal in one operation, before persistence.
    ordered = GeneratedQuestProposal.model_validate({
        **proposal.model_dump(),
        "steps": steps,
        "stepProofMethods": [proposal.stepProofMethods[index] for index in step_order],
        "stepEvidence": [proposal.stepEvidence[index] for index in step_order] if proposal.stepEvidence else [],
        "stepDestinationIndexes": [inverse[proposal.stepDestinationIndexes[index]] for index in step_order],
        "locationName": ordered_stops[0].locationName,
        "locationAddress": ordered_stops[0].locationAddress,
    })
    return ordered, ordered_stops
