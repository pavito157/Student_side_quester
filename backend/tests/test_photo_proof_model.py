"""Photo review must share the configured Gemini Flash model."""

import json
import os
import unittest
from unittest.mock import patch

import httpx

from backend import photo_proof


class PhotoProofModelTests(unittest.TestCase):
    def test_default_model_is_gemini_flash_with_low_thinking(self):
        requests = []
        body = {"candidates": [{
            "finishReason": "STOP",
            "content": {"parts": [{"text": json.dumps({
                "accepted": True,
                "feedback": "The requested diagram is visible.",
            })}]},
        }]}

        def respond(request):
            requests.append(request)
            return httpx.Response(200, json=body)

        client = httpx.Client(transport=httpx.MockTransport(respond))
        self.addCleanup(client.close)
        with patch.dict(os.environ, {
            "GEMINI_API_KEY": "test-key",
            "GEMINI_TIMEOUT_SECONDS": "20",
        }, clear=True), patch.object(photo_proof, "get_gemini_http_client", return_value=client):
            result = photo_proof.evaluate_photo("Draw a diagram.", b"\xff\xd8\xfftest", "image/jpeg")

        self.assertTrue(result.accepted)
        self.assertIn("/models/gemini-3.8-flash:generateContent", str(requests[0].url))
        generation_config = json.loads(requests[0].content)["generationConfig"]
        self.assertEqual(generation_config["thinkingConfig"], {"thinkingLevel": "LOW"})
