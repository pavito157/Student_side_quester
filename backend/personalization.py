"""One conditional creative hierarchy shared by discovery and generation."""


def personalization_context(preferences):
    if preferences.vibe is not None:
        return {
            "mode": "active_vibe",
            "primary": {"name": preferences.vibe.name, "description": preferences.vibe.preferences},
            "primaryExperience": " — ".join(filter(None, [preferences.vibe.name, preferences.vibe.preferences])),
            "supportingPreferences": preferences.preferences,
            "supportingGoals": preferences.goals,
        }
    if preferences.preferences.strip():
        return {"mode": "preferences", "primary": preferences.preferences,
                "primaryExperience": preferences.preferences, "supportingGoals": preferences.goals}
    if preferences.goals:
        return {"mode": "goals", "primary": preferences.goals,
                "primaryExperience": "; ".join(preferences.goals)}
    return {"mode": "surprise", "primary": "playful local recreation",
            "primaryExperience": "playful local recreation"}
