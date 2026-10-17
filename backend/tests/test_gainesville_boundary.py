"""Offline containment checks using the downloaded municipal geometry."""
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.destination_resolver import _load_boundary, _inside_boundary


class GainesvilleBoundaryTests(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).resolve().parents[1] / 'data/gainesville-boundary.geojson'
        self.env = patch.dict(os.environ, {'GAINESVILLE_BOUNDARY_PATH': str(path)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.polygons = _load_boundary()

    def test_uf_and_downtown_points_are_allowed(self):
        for latitude, longitude in [(29.6463, -82.347), (29.6519, -82.3248)]:
            with self.subTest(latitude=latitude, longitude=longitude):
                self.assertTrue(_inside_boundary(self.polygons, latitude, longitude))

    def test_distant_and_nearby_outside_points_are_rejected(self):
        for latitude, longitude in [(28.54, -81.38), (29.5297, -82.5169)]:
            with self.subTest(latitude=latitude, longitude=longitude):
                self.assertFalse(_inside_boundary(self.polygons, latitude, longitude))

    def test_boundary_vertex_is_conservatively_excluded(self):
        longitude, latitude = self.polygons[0][0][0]
        self.assertFalse(_inside_boundary(self.polygons, latitude, longitude))
