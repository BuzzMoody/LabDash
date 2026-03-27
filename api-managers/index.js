import { api_qbittorrent } from './qbittorrent.js';
import { api_proxmox } from './proxmox.js';
import { api_glances } from './glances.js';
import { api_immich } from './immich.js';
import { api_pihole } from './pihole.js';
import { api_sonarr } from './sonarr.js';
import { api_radarr } from './radarr.js';
import { api_portainer } from './portainer.js';
import { api_homeassistant } from './homeassistant.js';
import { api_jellyfin } from './jellyfin.js';
import { api_nextcloud } from './nextcloud.js';
import { api_grafana } from './grafana.js';
import { api_adguard } from './adguard.js';
import { api_emby } from './emby.js';
import { api_dispatcharr } from './dispatcharr.js';

export const API_HANDLERS = {
	qbittorrent:   api_qbittorrent,
	proxmox:       api_proxmox,
	glances:       api_glances,
	immich:        api_immich,
	pihole:        api_pihole,
	sonarr:        api_sonarr,
	radarr:        api_radarr,
	portainer:     api_portainer,
	homeassistant: api_homeassistant,
	jellyfin:      api_jellyfin,
	nextcloud:     api_nextcloud,
	grafana:       api_grafana,
	adguard:       api_adguard,
	emby:          api_emby,
	dispatcharr:   api_dispatcharr,
};