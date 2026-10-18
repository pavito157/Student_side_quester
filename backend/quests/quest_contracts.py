"""JSON contracts for the planned POST /quests/assign endpoint.

These models do not mount routes, call Gemini, or read/write Firestore.
"""

from typing import Annotated, List, Literal, Optional, Union

from pydantic import (
    AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator,
)


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


DocumentId = Annotated[str, StringConstraints(min_length=1, max_length=128, pattern=r"^[^/]+$")]
GoalText = Annotated[str, StringConstraints(min_length=1, max_length=500)]
StepText = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
MAX_QUEST_STEPS = 10
MAX_QUEST_DESTINATIONS = 10
MAX_DESTINATION_CANDIDATES = 20
PhotoStepIndex = Annotated[int, Field(strict=True, ge=0, le=MAX_QUEST_STEPS - 1)]
DestinationIndex = Annotated[int, Field(strict=True, ge=0, le=MAX_QUEST_DESTINATIONS - 1)]
CandidateIndex = Annotated[int, Field(strict=True, ge=0, le=MAX_DESTINATION_CANDIDATES - 1)]
QuestProofMethod = Literal["location", "photo", "recreation"]


def _validate_step_destinations(step_indexes: list[int], step_count: int, destination_count: int):
    if not step_indexes:
        if destination_count > 1 and step_count == destination_count:
            step_indexes.extend(range(destination_count))
        else:
            step_indexes.extend([0] * step_count)
    if (len(step_indexes) != step_count
            or any(index >= destination_count for index in step_indexes)
            or step_indexes != sorted(step_indexes)
            or set(step_indexes) != set(range(destination_count))):
        raise ValueError("Every destination must have one or more ordered quest steps")


class Coordinates(ContractModel):
    latitude: float = Field(strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(strict=True, ge=-180, le=180, allow_inf_nan=False)


class ResolvedDestination(Coordinates):
    """Server resolver output; scope must be checked against Gainesville city-limit geography."""

    model_config = ConfigDict(revalidate_instances="always")
    locationName: str = Field(min_length=1, max_length=300)
    placeId: Optional[str] = Field(default=None, min_length=1, max_length=300)
    scope: Literal["gainesville_city"]


class AnywhereLocation(ContractModel):
    mode: Literal["anywhere"]


class PlaceLocation(ContractModel):
    mode: Literal["place"]
    label: str = Field(min_length=1, max_length=300)
    placeId: Optional[str] = Field(default=None, min_length=1, max_length=300)
    coordinates: Optional[Coordinates] = None


class CurrentLocation(ContractModel):
    mode: Literal["current"]
    coordinates: Coordinates
    accuracyMeters: float = Field(strict=True, gt=0, allow_inf_nan=False)
    label: Optional[str] = Field(default=None, min_length=1, max_length=300)


Location = Annotated[
    Union[AnywhereLocation, PlaceLocation, CurrentLocation], Field(discriminator="mode"),
]


class TimeConstraints(ContractModel):
    minMinutes: Optional[int] = Field(default=None, strict=True, gt=0)
    maxMinutes: Optional[int] = Field(default=None, strict=True, gt=0)

    @model_validator(mode="after")
    def ordered_bounds(self):
        if (self.minMinutes is not None and self.maxMinutes is not None
                and self.minMinutes > self.maxMinutes):
            raise ValueError("minMinutes cannot exceed maxMinutes")
        return self


class BudgetConstraints(ContractModel):
    minDollars: float = Field(default=0, strict=True, ge=0, allow_inf_nan=False)
    maxDollars: Optional[float] = Field(default=None, strict=True, ge=0, allow_inf_nan=False)
    maxExclusive: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def valid_range(self):
        if self.maxExclusive and self.maxDollars is None:
            raise ValueError("maxExclusive requires maxDollars")
        if self.maxDollars is not None:
            if self.minDollars > self.maxDollars:
                raise ValueError("minDollars cannot exceed maxDollars")
            if self.maxExclusive and self.minDollars == self.maxDollars:
                raise ValueError("The budget range cannot be empty")
        return self


class SelectedVibe(ContractModel):
    id: Optional[DocumentId] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    preferences: str = Field(min_length=1, max_length=4000)


class NormalizedQuestPreferences(ContractModel):
    """Internal constraints; the frontend does not need to construct this shape."""

    location: Location
    time: TimeConstraints
    budget: BudgetConstraints
    preferences: str = Field(default="", max_length=4000)
    goals: List[GoalText] = Field(default_factory=list, max_length=20)
    vibe: Optional[SelectedVibe] = None
    maxDistanceMiles: Optional[float] = Field(default=None, strict=True, gt=0, allow_inf_nan=False)
    multiQuest: bool = False
    proofOptions: List[QuestProofMethod] = Field(default_factory=lambda: ["location"], min_length=1, max_length=3)

    @model_validator(mode="after")
    def distance_needs_origin(self):
        if self.maxDistanceMiles is not None and self.location.mode == "anywhere":
            raise ValueError("A specific location is required when distance is set")
        if (len(set(self.proofOptions)) != len(self.proofOptions)
                or "recreation" in self.proofOptions and len(self.proofOptions) > 1):
            raise ValueError("Proof options must be unique; recreation cannot be combined with XP verification.")
        return self


class ActivityTimeFilter(ContractModel):
    selection: Literal["", "any", "30", "60", "120", "custom"] = "any"
    customMinutes: Optional[int] = Field(default=None, strict=True, gt=0)

    @model_validator(mode="after")
    def custom_value_required(self):
        if self.selection == "custom" and self.customMinutes is None:
            raise ValueError("customMinutes is required for custom activity time")
        return self

    def normalize(self):
        if self.selection in ("", "any"):
            return TimeConstraints()
        if self.selection == "120":
            return TimeConstraints(minMinutes=120)
        return TimeConstraints(maxMinutes=self.customMinutes if self.selection == "custom"
                               else int(self.selection))


class BudgetFilter(ContractModel):
    selection: Literal["", "any", "0", "10", "10-25", "custom"] = "any"
    customDollars: Optional[float] = Field(default=None, strict=True, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def custom_value_required(self):
        if self.selection == "custom" and self.customDollars is None:
            raise ValueError("customDollars is required for a custom budget")
        return self

    def normalize(self):
        if self.selection in ("", "any"):
            return BudgetConstraints()
        if self.selection == "10-25":
            return BudgetConstraints(minDollars=10, maxDollars=25)
        if self.selection == "10":
            return BudgetConstraints(maxDollars=10, maxExclusive=True)
        return BudgetConstraints(maxDollars=self.customDollars if self.selection == "custom" else 0)


Miles = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]


class DistanceFilter(ContractModel):
    maxDistance: Miles
    unit: Literal["miles"]


class AssignQuestRequest(ContractModel):
    """Public request matching the frontend team's JSON; identity is token-only."""

    preferences: str = Field(default="", max_length=4000)
    username: str = Field(default="", max_length=160,
                          description="Untrusted display text; not used for identity or profile updates.")
    location: str = Field(max_length=300)
    time: ActivityTimeFilter
    budget: BudgetFilter
    distance: Optional[Union[Miles, DistanceFilter]] = Field(
        default=None, description="Maximum straight-line miles: number or {maxDistance, unit: miles}; null means no limit.",
    )
    goals: List[GoalText] = Field(default_factory=list, max_length=20)
    vibePreferences: Optional[str] = Field(default="", max_length=4000)
    activeVibe: Optional[SelectedVibe] = None
    multiQuest: bool = Field(default=False, strict=True)
    proofOptions: List[QuestProofMethod] = Field(
        default_factory=lambda: ["location"], min_length=1, max_length=3,
        description="Allowed per-step methods: location/photo can earn XP; recreation is fun-only and awards no XP.",
    )

    def distance_miles(self):
        return self.distance.maxDistance if isinstance(self.distance, DistanceFilter) else self.distance

    def normalized_location(self):
        # Accept the address-label link formatting from the emailed example.
        # Never follow user-supplied URLs or infer trustworthy coordinates here.
        label = self.location
        if label.startswith("[") and label.endswith(")"):
            separator = label.find("](")
            if separator > 1:
                link_label = label[1:separator]
                url = label[separator + 2:-1]
                has_url_content = any(
                    url.startswith(prefix) and len(url) > len(prefix)
                    for prefix in ("https://", "http://")
                )
                if ("]" not in link_label and "\r" not in link_label and "\n" not in link_label
                        and has_url_content and not any(character.isspace() for character in url)):
                    label = link_label
        label = label.strip()
        if label.lower() in ("", "any", "anywhere", "not selected"):
            return AnywhereLocation(mode="anywhere")
        return PlaceLocation(mode="place", label=label)

    @model_validator(mode="after")
    def distance_needs_origin(self):
        if self.distance is not None and self.normalized_location().mode == "anywhere":
            raise ValueError("A specific location is required when distance is set")
        return self

    @model_validator(mode="after")
    def proof_options_are_unique(self):
        if (len(set(self.proofOptions)) != len(self.proofOptions)
                or "recreation" in self.proofOptions and len(self.proofOptions) > 1):
            raise ValueError("Proof options must be unique; recreation cannot be combined with XP verification.")
        return self

    def normalize(self) -> NormalizedQuestPreferences:
        return NormalizedQuestPreferences(
            location=self.normalized_location(), time=self.time.normalize(),
            budget=self.budget.normalize(), maxDistanceMiles=self.distance_miles(),
            preferences=self.preferences, goals=self.goals,
            vibe=(self.activeVibe if "activeVibe" in self.model_fields_set else
                  SelectedVibe(preferences=self.vibePreferences) if self.vibePreferences else None),
            multiQuest=self.multiQuest, proofOptions=self.proofOptions,
        )


class AssignedQuest(ContractModel):
    id: DocumentId
    sourceOrganizationId: Optional[DocumentId] = None
    sourceOrganizationQuestId: Optional[DocumentId] = None
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=4000)
    steps: List[StepText] = Field(min_length=1, max_length=MAX_QUEST_STEPS)
    stepProofMethods: List[QuestProofMethod] = Field(default_factory=list, max_length=MAX_QUEST_STEPS)
    stepDestinationIndexes: List[DestinationIndex] = Field(
        default_factory=list, max_length=MAX_QUEST_STEPS,
    )
    verifiedPhotoSteps: List[PhotoStepIndex] = Field(default_factory=list, max_length=MAX_QUEST_STEPS)
    skippedPhotoSteps: List[PhotoStepIndex] = Field(default_factory=list, max_length=MAX_QUEST_STEPS)
    locationName: str = Field(min_length=1, max_length=300)
    placeId: Optional[str] = Field(default=None, min_length=1, max_length=300)
    latitude: float = Field(strict=True, ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(strict=True, ge=-180, le=180, allow_inf_nan=False)
    destinations: List[ResolvedDestination] = Field(default_factory=list, max_length=MAX_QUEST_DESTINATIONS)
    completedStops: List[int] = Field(default_factory=list, max_length=MAX_QUEST_DESTINATIONS)
    radiusMeters: float = Field(strict=True, gt=0, allow_inf_nan=False)
    xpReward: int = Field(strict=True, ge=0, le=2**63 - 1)
    isActive: bool = Field(strict=True, json_schema_extra={"const": True})
    estimatedMinutes: int = Field(strict=True, gt=0,
                                  description="Estimated activity duration in minutes, excluding travel time.")
    estimatedCostDollars: float = Field(strict=True, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def active_quest(self):
        if not self.isActive:
            raise ValueError("An assigned quest must be active")
        if (self.sourceOrganizationId is None) != (self.sourceOrganizationQuestId is None):
            raise ValueError("Organization quest provenance must include both IDs")
        if self.destinations:
            first = self.destinations[0]
            if (first.locationName != self.locationName or first.placeId != self.placeId
                    or first.latitude != self.latitude or first.longitude != self.longitude):
                raise ValueError("The primary destination must match the first route stop")
            if (len({(stop.latitude, stop.longitude) for stop in self.destinations}) != len(self.destinations)
                    or len({stop.placeId for stop in self.destinations if stop.placeId}) !=
                    len([stop for stop in self.destinations if stop.placeId])):
                raise ValueError("Route stops must be unique")
        destination_count = len(self.destinations) or 1
        _validate_step_destinations(self.stepDestinationIndexes, len(self.steps), destination_count)
        if self.completedStops != list(range(len(self.completedStops))):
            raise ValueError("Completed stops must be sequential")
        if self.destinations and any(index >= len(self.destinations) for index in self.completedStops):
            raise ValueError("Completed stop index is outside the route")
        if self.stepProofMethods and len(self.stepProofMethods) != len(self.steps):
            raise ValueError("Each quest step must have exactly one proof method")
        proof_progress = self.verifiedPhotoSteps + self.skippedPhotoSteps
        if (self.verifiedPhotoSteps != sorted(set(self.verifiedPhotoSteps))
                or self.skippedPhotoSteps != sorted(set(self.skippedPhotoSteps))
                or len(proof_progress) != len(set(proof_progress))
                or any(index >= len(self.steps) or not self.stepProofMethods
                       or self.stepProofMethods[index] != "photo" for index in proof_progress)):
            raise ValueError("Photo proof progress must reference photo-required steps")
        return self


MAX_ACTIVE_QUESTS = 3
MAX_QUEST_REPLACEMENTS = 3  # Legacy response metadata; no longer a generation quota.


class SavedAssignment(ContractModel):
    id: str = Field(min_length=1, max_length=257, pattern=r"^[^/]+$")
    userId: DocumentId
    questId: DocumentId
    status: Literal["assigned"]
    assignedAt: AwareDatetime
    completedAt: None = None
    xpAwarded: int = Field(default=0, strict=True, ge=0, le=0)
    replacementCount: int = Field(default=0, strict=True, ge=0, le=MAX_QUEST_REPLACEMENTS)

    @model_validator(mode="after")
    def matching_document_id(self):
        if self.id != f"{self.userId}_{self.questId}":
            raise ValueError("Assignment id must be {userId}_{questId}")
        return self


class AssignQuestResponse(ContractModel):
    quest: AssignedQuest
    assignment: SavedAssignment
    reusedExisting: bool = Field(strict=True)

    @model_validator(mode="after")
    def matching_quest(self):
        if self.assignment.questId != self.quest.id:
            raise ValueError("Assignment questId must match quest.id")
        return self


class TestQuestPreview(ContractModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=4000)
    steps: List[StepText] = Field(min_length=1, max_length=10)
    locationName: str = Field(min_length=1, max_length=300)
    estimatedMinutes: int = Field(strict=True, gt=0)
    estimatedCostDollars: float = Field(strict=True, ge=0, allow_inf_nan=False)


class QuestPreviewResponse(ContractModel):
    """Task 3 preview. This is deliberately not a saved-assignment response."""

    mode: Literal["test"] = "test"
    saved: Literal[False] = False
    filtersApplied: Literal[False] = False
    message: str
    quest: TestQuestPreview
    normalizedPreferences: NormalizedQuestPreferences


class GenerateQuestRequest(AssignQuestRequest):
    originCoordinates: Optional[Coordinates] = Field(
        default=None, description="Coordinates of the selected search origin; required for distance filtering.",
    )

    @model_validator(mode="after")
    def distance_requires_coordinates(self):
        if self.distance is not None and self.originCoordinates is None:
            raise ValueError("originCoordinates is required when distance is set")
        if self.multiQuest and self.originCoordinates is None:
            raise ValueError("originCoordinates is required for a multi-stop quest")
        if self.originCoordinates is not None and self.normalized_location().mode == "anywhere":
            raise ValueError("originCoordinates requires a specific location")
        return self

    def normalize(self) -> NormalizedQuestPreferences:
        result = super().normalize()
        if self.originCoordinates is not None:
            result.location.coordinates = self.originCoordinates
        return result


ProofObligation = Literal['presence', 'action_completion', 'visible_result']


class StepProofEvidence(ContractModel):
    """Generation-only proof obligations; no planning/review contract is needed."""
    proofObligations: List[ProofObligation] = Field(min_length=1, max_length=3)
    expectedPhotoEvidence: str = Field(default='', max_length=300)


class RouteDependency(ContractModel):
    """Generation-only precedence between positions in the proposed route."""

    before: DestinationIndex
    after: DestinationIndex
    reason: str = Field(min_length=1, max_length=300)


class GeneratedQuestProposal(ContractModel):
    """Gemini proposes content and a place label, never trusted GPS or rewards."""

    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=4000)
    steps: List[StepText] = Field(min_length=1, max_length=MAX_QUEST_STEPS)
    stepProofMethods: List[QuestProofMethod] = Field(default_factory=list, max_length=MAX_QUEST_STEPS)
    stepDestinationIndexes: List[DestinationIndex] = Field(
        default_factory=list, max_length=MAX_QUEST_STEPS,
    )
    routeCandidateIndexes: List[CandidateIndex] = Field(
        default_factory=list, max_length=MAX_QUEST_DESTINATIONS, exclude=True,
    )
    routeDependencies: List[RouteDependency] = Field(default_factory=list, max_length=45, exclude=True)
    completionCriteria: str = Field(default="", max_length=300, exclude=True)
    stepEvidence: List[StepProofEvidence] = Field(default_factory=list, max_length=MAX_QUEST_STEPS, exclude=True)
    locationName: str = Field(min_length=1, max_length=300)
    locationAddress: str = Field(min_length=1, max_length=500)
    estimatedMinutes: int = Field(strict=True, gt=0)
    estimatedCostDollars: float = Field(strict=True, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def proof_methods_match_steps(self):
        if not self.stepProofMethods:
            self.stepProofMethods = ["location"] * len(self.steps)
        if len(self.stepProofMethods) != len(self.steps):
            raise ValueError("Each quest step must have exactly one proof method")
        route_count = (
            len(self.routeCandidateIndexes) if self.routeCandidateIndexes
            else max(self.stepDestinationIndexes, default=0) + 1
        )
        if self.routeCandidateIndexes:
            if len(set(self.routeCandidateIndexes)) != len(self.routeCandidateIndexes):
                raise ValueError("Route candidate indexes must be unique")
            route_count = len(self.routeCandidateIndexes)
        _validate_step_destinations(self.stepDestinationIndexes, len(self.steps), route_count)
        return self


class GeminiActivityDraft(ContractModel):
    """AI writes activity content only when the destination is already verified."""

    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=500,
                             description="A substantive experience with a clear outcome, not repeated thematic gestures or arbitrary counts.")
    steps: List[StepText] = Field(min_length=1, max_length=MAX_QUEST_STEPS)
    stepEvidence: List[StepProofEvidence] = Field(min_length=1, max_length=MAX_QUEST_STEPS)
    stepProofMethods: List[QuestProofMethod] = Field(
        min_length=1, max_length=MAX_QUEST_STEPS,
        description=(
            "Exactly one method per step, in order, chosen from request proofOptions. "
            "Location and photo are XP-eligible verification; photo requires visible "
            "evidence. Recreation is fun-only, requires no proof, and awards no XP."
        ),
    )
    stepDestinationIndexes: List[DestinationIndex] = Field(
        min_length=1, max_length=MAX_QUEST_STEPS,
        description=(
            "One zero-based route-stop index per action step. Keep indexes in "
            "nondecreasing order, start at zero, and use every route stop."
        ),
    )
    estimatedMinutes: int = Field(strict=True, gt=0)
    estimatedCostDollars: float = Field(strict=True, ge=0, allow_inf_nan=False)
    completionCriteria: str = Field(
        min_length=1, max_length=300,
        description="A satisfying concrete endpoint for the experience, without adding an arbitrary count or new filler task.",
    )


class GeminiMultiStopDraft(GeminiActivityDraft):
    routeDependencies: List[RouteDependency] = Field(
        default_factory=list, max_length=45,
        description="Normally empty. Only genuine prerequisite activities justify before/after route-position dependencies. Include a concrete reason, never an arbitrary preferred order.",
    )
    routeCandidateIndexes: List[CandidateIndex] = Field(
        min_length=2, max_length=MAX_QUEST_DESTINATIONS,
        description="Unique zero-based candidate indexes in the chosen route order.",
    )


class GeminiQuestDraft(GeminiActivityDraft):
    """Legacy unsaved draft format, used without destination discovery."""

    locationName: str = Field(min_length=1, max_length=300)
    locationAddress: str = Field(min_length=1, max_length=500)


class SelectedDestination(ResolvedDestination):
    """Internal provider-selected venue; its address is not Gemini-authored."""

    locationAddress: str = Field(min_length=1, max_length=500)
    rating: Optional[float] = Field(default=None, ge=0, le=5, allow_inf_nan=False)
    userRatingCount: Optional[int] = Field(default=None, strict=True, ge=0)
    priceLevel: Optional[str] = Field(default=None, min_length=1, max_length=40)
    discoveryProfiles: List[Literal["popular", "niche", "user", "surprise"]] = Field(default_factory=list)


class GeneratedQuestResponse(ContractModel):
    mode: Literal["generated"] = "generated"
    saved: Literal[False] = False
    filtersApplied: bool = Field(strict=True)
    destinationVerified: bool = Field(strict=True)
    distanceStatus: Literal["not_requested", "pending", "verified"]
    distanceMeters: Optional[float] = Field(default=None, strict=True, ge=0, allow_inf_nan=False)
    destination: Optional[ResolvedDestination] = None
    destinations: List[ResolvedDestination] = Field(
        default_factory=list, max_length=MAX_QUEST_DESTINATIONS,
    )
    message: str
    quest: GeneratedQuestProposal
    normalizedPreferences: NormalizedQuestPreferences

    @model_validator(mode="after")
    def consistent_verification(self):
        if self.destinationVerified != (self.destination is not None):
            raise ValueError("Destination verification requires resolver output")
        if self.destinationVerified and not self.destinations:
            self.destinations = [self.destination]
        if self.destinations and (self.destination is None or self.destinations[0] != self.destination):
            raise ValueError("The first verified stop must match the primary destination")
        if self.destinationVerified:
            expected_stops = (
                2 <= len(self.destinations) <= MAX_QUEST_DESTINATIONS
                if self.normalizedPreferences.multiQuest else len(self.destinations) == 1
            )
            if not expected_stops:
                raise ValueError("Verified destination count must match the requested quest type")
            _validate_step_destinations(
                self.quest.stepDestinationIndexes, len(self.quest.steps), len(self.destinations),
            )
            if (len({(stop.latitude, stop.longitude) for stop in self.destinations}) != len(self.destinations)
                    or len({stop.placeId for stop in self.destinations if stop.placeId}) !=
                    len([stop for stop in self.destinations if stop.placeId])):
                raise ValueError("Verified route stops must be unique")
        if self.filtersApplied != self.destinationVerified:
            raise ValueError("All filters require a verified Gainesville destination")
        expected = ("not_requested" if self.normalizedPreferences.maxDistanceMiles is None
                    else "verified" if self.destinationVerified else "pending")
        if self.distanceStatus != expected:
            raise ValueError("Distance status must reflect destination resolution")
        if (self.distanceMeters is not None) != (self.distanceStatus == "verified"):
            raise ValueError("Distance measurement is required only for a verified distance limit")
        return self


if __name__ == "__main__":
    import json
    from pathlib import Path

    output_directory = Path(__file__).with_name("contracts")
    output_directory.mkdir(exist_ok=True)
    for name, model in [("assignment.request", GenerateQuestRequest),
                        ("assignment.normalized", NormalizedQuestPreferences),
                        ("assignment.preview", QuestPreviewResponse),
                        ("generation.request", GenerateQuestRequest),
                        ("generation.preview", GeneratedQuestResponse),
                        ("assignment.response", AssignQuestResponse)]:
        schema = {"$schema": "https://json-schema.org/draft/2020-12/schema",
                  **model.model_json_schema()}
        (output_directory / f"{name}.schema.json").write_text(
            json.dumps(schema, indent=2) + "\n", encoding="utf-8",
        )
