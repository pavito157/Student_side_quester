# Deploy Sidequester

The React app is served publicly by Firebase Hosting. The FastAPI backend runs
on the Ubuntu server and is exposed privately to your Tailscale network through
Tailscale Serve. Phones must be signed in to the same tailnet to use API
features. Do not point the HTTPS Firebase site directly at a Tailscale IP over
HTTP: browsers block HTTP API requests from an HTTPS page as mixed content.

## Run the Python API on Ubuntu

Port 4533 is used by Navidrome on the example Ubuntu server. Run Sidequester on
port 8000 bound to loopback; Tailscale Serve will provide HTTPS access to
tailnet devices.

Clone the public repository, create a dedicated system account, and install
the Python dependencies into a virtual environment:

```sh
sudo git clone https://github.com/pavito157/Student_side_quester.git /opt/sidequester
sudo useradd --system --home-dir /opt/sidequester --shell /usr/sbin/nologin sidequester
sudo chown -R sidequester:sidequester /opt/sidequester
sudo -u sidequester python3 -m venv /opt/sidequester/.venv
sudo -u sidequester /opt/sidequester/.venv/bin/pip install -r /opt/sidequester/backend/requirements.txt
sudo install -d -o sidequester -g sidequester -m 700 /opt/sidequester/secrets
```

Copy the backend `.env` and Firebase Admin service-account JSON to the server
using a secure file transfer. Keep both outside Git. Set these values in the
server `.env`:

- `FRONTEND_ORIGINS` must include
  `https://studentsidequest.web.app,https://studentsidequest.firebaseapp.com`.
  Preserve any development origins you still use.
- `GOOGLE_APPLICATION_CREDENTIALS=/opt/sidequester/secrets/firebase-admin.json`
- `GAINESVILLE_BOUNDARY_PATH=/opt/sidequester/backend/data/gainesville-boundary.geojson`

The Firebase service-account key must be readable only by the API service
account:

```sh
sudo chown sidequester:sidequester /opt/sidequester/.env \
  /opt/sidequester/secrets/firebase-admin.json
sudo chmod 600 /opt/sidequester/.env
sudo chmod 400 /opt/sidequester/secrets/firebase-admin.json
```

Create `/etc/systemd/system/sidequester-api.service` with:

```ini
[Unit]
Description=Sidequester FastAPI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=sidequester
Group=sidequester
WorkingDirectory=/opt/sidequester
EnvironmentFile=/opt/sidequester/.env
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/opt/sidequester/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Start the API and check it locally:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now sidequester-api
curl http://127.0.0.1:8000/health
```

The response should be `{"status":"ok"}`. The service account needs Firebase
Authentication and Firestore access, including permission to create custom
tokens. Review errors with
`sudo journalctl -u sidequester-api -n 100 --no-pager`.

## Expose the API over Tailscale HTTPS

Tailscale Serve requires HTTPS certificates to be enabled for the tailnet. Once
the API health check succeeds, configure the private HTTPS proxy:

```sh
tailscale serve --bg --https=443 http://127.0.0.1:8000
tailscale serve status
```

The status output should show
`https://aguy-server.tail8f28f1.ts.net/` proxying to
`http://127.0.0.1:8000`. Use your own server's `*.ts.net` name if it differs.
The service should only be reachable by devices in the tailnet.

## Deploy the frontend

The repository is configured for Firebase project `studentsidequest`. The site
is deployed at `https://studentsidequest.web.app`. Firebase CLI authentication
must be for an account that can deploy Hosting to that project.

The current Hosting build is configured to call
`https://aguy-server.tail8f28f1.ts.net`. If your server's `*.ts.net` address is
different, build and redeploy with the correct HTTPS base URL:

```sh
VITE_API_BASE_URL=https://YOUR_SERVER.YOUR_TAILNET.ts.net \
  npx firebase-tools deploy --only hosting --project studentsidequest
```

The Hosting predeploy check rejects missing or non-HTTPS API URLs. The React
app uses the configured URL for quest, residence, leaderboard, and
Clerk-to-Firebase requests.

## Authentication and access checks

Add both Firebase Hosting domains to the Clerk instance's allowed origins and
Firebase Authentication's authorized domains. The backend checks the browser
origin for CORS and in Clerk's `azp` claim, so keep the same Firebase domains in
`FRONTEND_ORIGINS` on Ubuntu.

Test from a phone with Tailscale connected:

1. Open `https://aguy-server.tail8f28f1.ts.net/health`; expect
   `{"status":"ok"}`.
2. Open `https://studentsidequest.web.app`.
3. Try a guest preview, then sign in and test a saved quest.

The public website shell loads outside the tailnet, but API-backed features are
unavailable unless the device has Tailscale connected and the Ubuntu server is
online.
