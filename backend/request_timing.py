"""Per-request durations only; never log tokens, account IDs or prompt contents."""

from contextlib import contextmanager
from time import perf_counter


@contextmanager
def record_timing(timings, name):
    started = perf_counter()
    try:
        yield
    finally:
        if timings is not None:
            timings[name] = (perf_counter() - started) * 1000


async def measure_quest_request(request, call_next):
    if request.url.path not in ("/quests/generate", "/quests/assign", "/me/quest"):
        return await call_next(request)
    request.state.quest_timings = timings = {}
    with record_timing(timings, "total"):
        response = await call_next(request)
    response.headers["Server-Timing"] = ", ".join(
        f"{name};dur={duration:.1f}" for name, duration in timings.items()
    )
    return response
