# Gainesville municipal boundary

Source: [City of Gainesville CityLimitsResurveyPolygon layer](https://services2.arcgis.com/Zzhtlau4ccHkQgTu/ArcGIS/rest/services/Gainesville_Boundary/FeatureServer/0).
Attribution: Department of Doing - City of Gainesville. Retrieved October 17, 2026;
layer metadata reports its last edit on August 11, 2026. This is the city-limit
area, not a radius around UF, postal Gainesville addresses, or all Alachua County.
Annexations may change the boundary; the bundled data is a snapshot.

`gainesville-boundary.geojson` is a WGS84 GeoJSON Feature with scope
`gainesville_city`. Its properties contain the source query, retrieval date,
attribution, processing description and SHA-256 of the raw export. It contains
public geographic data, not credentials.

The city export returns one MultiPolygon containing nine individually valid
parts. Shapely reported the whole export invalid due to a nested polygon shell.
An offline `unary_union` of those parts dissolved the redundant overlap, producing
eight valid parts. There was no buffer, simplification, or manual drawing. This
preserves the union of areas accepted by the resolver's any-polygon check.
Shapely is a data-preparation tool only, not a backend runtime dependency.

Automated review: checked the export CRS (EPSG:4326), source name (`City of
Gainesville`), individual and combined polygon validity after dissolution,
longitude/latitude ranges, and containment for UF, downtown, outside-city and
boundary-edge test points. The metadata identifies this review as automated;
it does not claim a human GIS or legal survey review.

To refresh, use the source query stored in the file, confirm a complete export,
validate topology, dissolve nested/overlapping polygon parts if necessary, retain
source attribution and record the retrieval/processing details. Run the boundary
and resolver tests before changing deployed data.
