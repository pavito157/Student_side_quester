"""Location checks without FastAPI, Firebase, credentials, or database writes."""

from math import atan2, cos, isfinite, radians, sin, sqrt


def valid_number(value):
    # bool is an int subclass; JSON strings and non-finite values are not locations.
    if type(value) not in (int, float):
        return False
    try:
        return isfinite(value)
    except OverflowError:
        return False


def valid_coordinates(latitude, longitude):
    return (
        valid_number(latitude) and -90 <= latitude <= 90
        and valid_number(longitude) and -180 <= longitude <= 180
    )


def calculate_distance(lat1, lon1, lat2, lon2):
    """Return Haversine distance in meters; reject invalid coordinates."""
    if not (valid_coordinates(lat1, lon1) and valid_coordinates(lat2, lon2)):
        raise ValueError("Invalid coordinates.")
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    delta_lat, delta_lon = lat2 - lat1, lon2 - lon1
    a = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    a = max(0, min(1, a))  # Floating point rounding near antipodal points.
    return 6_371_000 * 2 * atan2(sqrt(a), sqrt(1 - a))


def validate_completion(
    user_id, assignment, quest, latitude, longitude, accuracy, max_accuracy=50,
):
    """Validate supplied records without writes. Location readings can be spoofed.

    A database caller must load and recheck these records inside its transaction.
    Keep full distance precision for the decision; round only response diagnostics.
    """
    def reject(reason):
        return {"valid": False, "reason": reason}

    if not isinstance(user_id, str) or not user_id or assignment.get("userId") != user_id:
        return reject("This quest is not assigned to you.")
    if assignment.get("status") == "completed":
        return reject("You already completed this quest.")
    if assignment.get("status") != "assigned":
        return reject("This quest is not currently assigned.")
    if quest.get("isActive") is not True:
        return reject("This quest is no longer active.")
    if not valid_coordinates(latitude, longitude):
        return reject("Invalid user coordinates.")
    if not valid_number(accuracy) or accuracy <= 0:
        return reject("Invalid location accuracy.")
    if not valid_number(max_accuracy) or max_accuracy <= 0:
        return reject("The maximum location accuracy is not configured correctly.")
    if accuracy > max_accuracy:
        return reject(
            "Location reading is too imprecise. "
            "Try again outdoors or with precise location enabled."
        )

    destination_lat, destination_lon = quest.get("latitude"), quest.get("longitude")
    radius = quest.get("radiusMeters")
    if not (
        valid_coordinates(destination_lat, destination_lon)
        and valid_number(radius) and radius > 0
    ):
        return reject("The quest destination is not configured correctly.")

    distance = calculate_distance(latitude, longitude, destination_lat, destination_lon)
    within_radius = distance + accuracy <= radius
    return {
        "valid": within_radius,
        "reason": (
            "Location verified." if within_radius
            else "Move closer to the destination and try again."
        ),
        "distanceMeters": round(distance, 1),
        "accuracyMeters": accuracy,
        "radiusMeters": radius,
    }
