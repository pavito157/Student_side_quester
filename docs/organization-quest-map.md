# Quest map location data

The single campus map is driven by scheduled events in
`GlobalQuests/{eventId}`. Event latitude and longitude are read directly from
Firestore, along with `locationName` for the pin label:

```json
{
  "locationName": "A named event venue",
  "latitude": 29.6516,
  "longitude": -82.3248
}
```

Use the venue's actual WGS84 coordinates, preferably from a selected Google
Places result. Do not use the visitor's location for these fields. The public
event-feed endpoint returns only the event details needed by the map, including
its location, schedule, and XP reward. The map adds the visitor's current
position when browser location permission is available.

Reusable activities under `Organizations/{organizationId}/quests/{questId}`
are separate from scheduled events and are not shown as pins on this map. Their
legacy `mapLocation` or top-level coordinate fields may still be used to show a
venue label on an activity card. Listings without those fields remain browsable.
