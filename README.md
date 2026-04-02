# LabDash

A clean, fast, self-hosted homelab dashboard. Monitor all your services at a glance with real-time status checks and live stats pulled directly from each service's API.

![LabDash Preview](labdash-preview.png)

> **Security notice:** LabDash is designed for use on your **internal/local network only**. API credentials are stored in `services.yaml` and used only by the Go server to proxy requests — they are never sent to the browser or exposed through the dashboard. There is no built-in authentication on the dashboard itself, so do not expose it to the public internet.

---

## Features

- **Live status indicators** — every service is polled on a configurable interval and shown as Online, Offline, or Checking
- **Live stats** — 18 supported services expose real-time data directly on their card (media counts, CPU/RAM, torrent speeds, DNS stats, and more)
- **Emoji stat chips** — optionally replace stat label text with emojis, globally or per service
- **Per-service refresh rates** — fast-changing services like Glances can refresh every 5 seconds while slower ones like Immich refresh every 5 minutes
- **Category grouping** — services are colour-coded and grouped by category with a filterable sidebar
- **Search** — filter services by name, category, or description in real time
- **Scrollable stat chips** — stats sit on a single draggable/swipeable row at the bottom of each card
- **Flat or grouped view** — toggle between a single grid or sections grouped by category
- **Custom logos** — drop your own SVG/PNG logos into `config/logos/`
- **Custom CSS** — drop a `custom.css` into `config/` to override any built-in styles without touching the source
- **Icons-only mode** — hide service names and show only icons for a compact layout
- **Hide descriptions** — strip description text from all cards for a cleaner look
- **Docker-first** — single container, one config file, done

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/BuzzMoody/LabDash.git
cd LabDash

# 2. Start the container
docker compose up -d

# 3. Open the dashboard
# http://localhost:6969
```

On first run an example `services.yaml` is automatically created at `./config/services.yaml`. Edit it to add your services, then restart:

```bash
docker compose restart
```

### Pulling from the container registry

```yaml
services:
  labdash:
    image: ghcr.io/buzzmoody/labdash:latest
    container_name: LabDash
    ports:
      - "6969:6969"
    volumes:
      - ./config:/config
    restart: unless-stopped
```

---

## Configuration

All configuration lives in a single YAML file at `./config/services.yaml`.

### Global Settings

```yaml
settings:
  title: "My Homelab"         # dashboard title (displayed top-left)
  subtitle: "Home Server"     # subtitle line below the title
  refresh_interval: 30        # default seconds between service refreshes
  emoji_stats: true           # show emoji instead of text labels on all stat chips
  icons_only: true            # hide service names — show icons only
  hide_descriptions: true     # hide description text on all cards
```

All settings are optional. `emoji_stats`, `icons_only`, and `hide_descriptions` default to `false`.

### Service Fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Display name for the service |
| `url` | Yes | URL opened when the card is clicked |
| `category` | No | Groups the service and applies a colour |
| `description` | No | Short description shown on the card |
| `icon` | No | Emoji used when no logo is set |
| `logo` | No | Filename of an image in `config/logos/` |
| `endpoint` | No | Override URL used for status checks and API calls (useful when the API lives at a different path than the UI) |
| `api_type` | No | Enables live stats for supported services (see below) |
| `api_key` | No | API key or token for authenticated services |
| `username` | No | Username for services that use login-based auth |
| `password` | No | Password for services that use login-based auth |
| `args` | No | Comma-separated list of stat keys to display (see Live Services) |
| `refresh` | No | Per-service refresh interval in seconds, overrides the global setting |
| `emoji_stats` | No | Show emoji instead of text labels on this service's stat chips |

### Minimal service example

```yaml
- name: My Service
  url: "http://192.168.1.10:8080"
  category: Infrastructure
  icon: "⚙️"
  description: "Does a thing"
```

### Full service example

```yaml
- name: Jellyfin
  url: "http://192.168.1.10:8096"
  category: Media
  logo: jellyfin.svg
  icon: "🎦"
  description: "Open-source media server"
  api_type: jellyfin
  api_key: "your-jellyfin-api-key"
  args: "movies, series, episodes"
  refresh: 300
  emoji_stats: true
```

---

## Categories & Colours

Categories are defined by the `category:` field on each service. The name is case-insensitive. Services without a category are grouped under **Other**.

The default view is grouped by category. Categories are sorted alphabetically in the sidebar and in the grouped grid view.

| Category | Colour |
|---|---|
| Media | Pink `#f472b6` |
| Downloads | Amber `#fbbf24` |
| Infrastructure | Green `#4ade80` |
| Network | Cyan `#22d3ee` |
| Storage | Purple `#c084fc` |
| Monitoring | Blue `#60a5fa` |
| Smart Home | Violet `#a78bfa` |
| Security | Rose `#fb7185` |
| *(anything else)* | Slate `#94a3b8` |

Any category name you use that isn't in the list above will display in slate grey. The colour is applied to the card accent bar, stat chip values, category badge, and sidebar indicator.

---

## Filtering & Views

Use the **search bar** to filter by name, category, or description in real time. Click any **category** in the sidebar to show only that group, or **All Services** to reset. The **Online / Offline / Total** pills in the topbar filter by current status — click an active pill again to clear it. The two icons top-right toggle between **Grouped** (default, by category) and **Flat** (single grid) views; your preference is saved in `localStorage`.

---

## Live Services

Services with an `api_type` display live data chips at the bottom of their card. Stats are fetched on the same schedule as the status check (or their own `refresh:` interval if set).

The `args:` field is a comma-separated list of stat keys. Only the keys you list will appear on the card. **If `args:` is omitted, no stats are shown at all.**

Stats appear in the order you list them on a horizontally scrollable row — drag or swipe to see more if they overflow the card width.

When `emoji_stats: true` is set (globally in `settings:` or on an individual service), stat chips display an emoji instead of a text label. Hovering over a chip shows the original label as a tooltip. Per-service `emoji_stats` takes precedence over the global setting.

### Supported services

| Service | `api_type` | Auth | Available `args` |
|---|---|---|---|
| Jellyfin | `jellyfin` | `api_key` | `movies`, `series`, `episodes` |
| Emby | `emby` | `api_key` | `movies`, `series`, `episodes` |
| Sonarr | `sonarr` | `api_key` | `series`, `monitored` |
| Radarr | `radarr` | `api_key` | `movies`, `downloaded` |
| qBittorrent | `qbittorrent` | none | `active`, `dl`, `ul` |
| Immich | `immich` | `api_key` | `photos`, `videos`, `usage` |
| Proxmox VE | `proxmox` | `api_key` ¹ | `vms`, `lxcs` |
| Portainer | `portainer` | `api_key` | `endpoints`, `running`, `stacks` |
| Glances | `glances` | none | `cpu`, `ram`, `swap`, `load` |
| Grafana | `grafana` | `api_key` | `dashboards`, `sources` |
| Pi-hole v6 | `pihole` | `api_key` ² | `total`, `blocked`, `percent_blocked`, `frequency` |
| AdGuard Home | `adguard` | `api_key` ³ | `blocked`, `queries` |
| Nextcloud | `nextcloud` | `api_key` ⁴ | `files`, `users`, `php` |
| Home Assistant | `homeassistant` | `api_key` | `entities`, `active` |
| Vaultwarden | `vaultwarden` | none | `version` |
| Nginx Proxy Manager | `nginxproxymanager` | `username` + `password` | `proxy`, `redirection`, `stream`, `dead`, `certs`, `version` |
| Dispatcharr | `dispatcharr` | `username` + `password` | `channels` |
| Speedtest Tracker | `speedtesttracker` | `api_key` (optional) | `ping`, `download`, `upload` |

> ¹ Proxmox `api_key` format: `PVEAPIToken=user@pam!token=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
> ² Pi-hole: generate an App Password in the Pi-hole web UI under **Settings → API**
> ³ AdGuard `api_key` format: `username:password`
> ⁴ Nextcloud `api_key` format: `username:app-password`

---

## Adding Your Own API Manager

Adding support for a new service requires two things: registering an auth method in Go (if the service needs credentials), and creating a JS handler that fetches and formats the stats.

### 1. Add auth to Go (if needed)

API requests are proxied through the Go server, which attaches credentials before forwarding. If your service uses a standard auth method already covered (Bearer token, API key header, Basic auth), add a `case` for your `api_type` to the `addAuth()` function in `main.go`:

```go
case "myservice":
    req.Header.Set("Authorization", "Bearer "+svc.APIKey)
```

If your service uses a login flow (username+password → session token), add a `login*` function and wire it into `handleProxy()`, following the pattern used by Dispatcharr or Nginx Proxy Manager.

### 2. Create the handler file

Add a new file to `api-managers/` named after your service (lowercase, no spaces):

```
api-managers/myservice.js
```

### 3. Write the handler function

The function must be a named export following the pattern `api_<name>`. It receives three arguments:

- `svc` — the service object from `services.yaml`. Contains `svc.name`, `svc.args`, etc. Credentials (`api_key`, `username`, `password`) are stripped before the config reaches the browser and are handled server-side.
- `timedFetch` — a `fetch` wrapper with a built-in timeout. Use this instead of `fetch` directly.
- `utils` — helper functions: `utils.fmtNum(n)` (locale-formatted number) and `utils.fmtBytes(b)` (auto-scaled bytes string)

The function must return an array of stat objects, or `null` if the fetch fails. Each stat object has:

| Field | Required | Description |
|---|---|---|
| `label` | Yes | Text shown on the chip (also the tooltip when `emoji_stats` is on) |
| `value` | Yes | Value shown on the chip |
| `emoji` | No | Emoji shown instead of the label when `emoji_stats` is enabled |

Call the proxy endpoint to make authenticated requests — do not fetch the service URL directly:

```js
export async function api_myservice(svc, timedFetch, utils) {
    const args = (svc.args ?? '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
    if (!args.length) return null;

    try {
        const res = await timedFetch(`/proxy?svc=${encodeURIComponent(svc.name)}&path=${encodeURIComponent('/api/stats')}`);
        if (!res.ok) return null;

        const data = await res.json();

        const available = {
            users:  () => ({ label: 'Users',  value: utils.fmtNum(data.userCount), emoji: '👤' }),
            uptime: () => ({ label: 'Uptime', value: `${data.uptimeDays}d`,         emoji: '⏱️' }),
        };

        return args.map(a => available[a]?.()).filter(Boolean);
    } catch { return null; }
}
```

### 4. Register the handler

Open `api-managers/index.js` and add your handler to the imports and the `API_HANDLERS` map:

```js
import { api_myservice } from './myservice.js';

export const API_HANDLERS = {
    // ... existing handlers ...
    myservice: api_myservice,
};
```

### 5. Use it in services.yaml

```yaml
- name: My Service
  url: "http://192.168.1.10:1234"
  category: Infrastructure
  api_type: myservice
  api_key: "your-api-key"
  args: "users, uptime"
```

That's it. The `emoji_stats` feature works automatically for any stat that includes an `emoji` field.

---

## Logos

### Where to get icons

**[Dashboard Icons](https://dashboardicons.com/)** is the recommended source for service logos. It provides a large, actively maintained library of high-quality SVG icons for virtually every self-hosted application. Search for your service, download the SVG, and drop it straight into your config directory. SVG format is preferred as it scales perfectly at any size.

### Where to put them

Place your logo files in `./config/logos/` — the same directory as your `services.yaml`:

```
config/
├── services.yaml
└── logos/
    ├── jellyfin.svg
    ├── sonarr.svg
    ├── radarr.svg
    └── ...
```

### How to reference them

Add the `logo:` field to your service entry with just the filename (no path needed):

```yaml
- name: Jellyfin
  url: "http://192.168.1.10:8096"
  logo: jellyfin.svg
  icon: "🎦"           # fallback if logo fails to load
```

Both `.svg` and `.png` are supported. If `logo:` is not set, the `icon:` emoji is used as a fallback. If neither is set, a default ⚙️ is shown.

---

## Custom CSS

You can override any built-in style by placing a `custom.css` file in your config directory:

```
config/
├── services.yaml
├── custom.css        ← add this
└── logos/
    └── ...
```

LabDash loads `styles.css` first (the built-in stylesheet), then `custom.css` immediately after. Because of CSS cascade order, any rule in `custom.css` that targets the same selector will take priority — no `!important` needed in most cases.

**No restart required.** The server checks for the file on every page load, so you can add, edit, or remove `custom.css` and just refresh your browser to see the result.

### Example

```css
/* Change the dashboard background */
body {
  background: #0f0f0f;
}

/* Make card titles larger */
.service-name {
  font-size: 1rem;
}

/* Adjust the sidebar width */
#sidebar {
  width: 220px;
}
```

If `custom.css` does not exist, LabDash falls back to the built-in styles with no errors.

---

## Security

- LabDash is intended for **local network use only**
- `services.yaml` stores API keys, usernames, and passwords in plain text — keep this file private
- Credentials are used exclusively by the Go server to proxy API requests and are **never sent to the browser**
- Services using login-based auth (Nginx Proxy Manager, Dispatcharr, Pi-hole v6) have their session tokens cached in memory only — never written to disk
- There is no built-in authentication on the dashboard itself — if you need to access it remotely, place it behind a VPN or an authenticated reverse proxy

---

## Project Structure

```
LabDash/
├── api-managers/          # One JS file per supported service integration (18 total)
│   └── index.js           # Registers all API handlers
├── js/                    # Frontend ES modules
│   ├── config.js          # Global config constants
│   ├── state.js           # Shared runtime state
│   ├── services.js        # Service loading, polling, and refresh logic
│   ├── render.js          # Card and grid rendering
│   ├── ui.js              # Sidebar, search, filters, and view toggles
│   ├── stats.js           # Stat chip scroll/drag behaviour
│   ├── utils.js           # Shared helpers (formatting, fetch, chips)
│   ├── counters.js        # Online/offline/total counters
│   └── updates.js         # Update checker and changelog modal
├── config/                # Mounted volume — your config lives here
│   ├── services.yaml      # Your service definitions
│   ├── custom.css         # Optional — overrides built-in styles
│   └── logos/             # Your custom logo images
├── app.js                 # Entry point — wires up all modules
├── styles.css             # All styles
├── index.html             # Dashboard shell and template
├── main.go                # Go HTTP server — serves assets, proxies status checks and API calls
├── docker-compose.yml
└── VERSION                # Current version number
```

---

*Made by Buzz — built for homelabbers, by a homelabber.*
