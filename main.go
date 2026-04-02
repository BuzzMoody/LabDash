package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"gopkg.in/yaml.v3"
)

// ── Embedded assets ───────────────────────────────────────────────────────────

//go:embed index.html
var indexHTML string

//go:embed styles.css app.js js-yaml.min.js api-managers js
var assets embed.FS

//go:embed VERSION
var versionFile []byte

//go:embed release-notes.md
var changelogFile []byte

// ── Types & globals ───────────────────────────────────────────────────────────

type pageData struct {
	YAMLContent  template.JS
	Changelog    template.JS
	Version      string
	AssetVer     string
	HasCustomCSS bool
}

type cachedPing struct {
	status int
	at     time.Time
}

// Service mirrors the per-service fields in services.yaml that the proxy needs.
type Service struct {
	Name     string `yaml:"name"`
	URL      string `yaml:"url"`
	Endpoint string `yaml:"endpoint"`
	APIType  string `yaml:"api_type"`
	APIKey   string `yaml:"api_key"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type dashConfig struct {
	Services []Service `yaml:"services"`
}

// credRe strips credential fields from the YAML string injected into the page,
// so api_key / username / password never reach the browser.
var credRe = regexp.MustCompile(`(?m)^\s*(api_key|username|password)\s*:.*$`)

// hostRe validates ICMP ping destinations — only hostnames and IP addresses.
var hostRe = regexp.MustCompile(`^[a-zA-Z0-9.\-:]{1,255}$`)

// pingRe extracts the RTT from ping output: "time=8.452 ms"
var pingRe = regexp.MustCompile(`time=(\d+\.?\d*)\s*ms`)

var (
	version    string
	isBeta     bool
	startedAt  int64
	tmpl       *template.Template
	client     *http.Client
	pingCache  sync.Map // map[string]cachedPing
	piholeCache sync.Map // map[string]string  — service name → Pi-hole SID
	jwtCache    sync.Map // map[string]string  — service name → Bearer token
)

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	version   = strings.TrimSpace(string(versionFile))
	isBeta    = os.Getenv("BETA") == "true"
	startedAt = time.Now().Unix()

	tmpl = template.Must(template.New("index").Parse(indexHTML))

	client = &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, //nolint:gosec — self-signed certs common in homelabs
			MaxIdleConns:        50,
			MaxIdleConnsPerHost: 5,
			IdleConnTimeout:     30 * time.Second,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 2 {
				return http.ErrUseLastResponse
			}
			return nil
		},
	}

	ensureConfig()

	mux := http.NewServeMux()

	mux.HandleFunc("GET /ping",       handlePing)
	mux.HandleFunc("GET /batch-ping", handleBatchPing)
	mux.HandleFunc("GET /proxy",      handleProxy)
	mux.HandleFunc("GET /icmp-ping",  handleICMPPing)
	mux.Handle("GET /logos/",      cacheMiddleware(http.StripPrefix("/logos/", http.FileServer(http.Dir("/config/logos")))))
	mux.HandleFunc("GET /custom.css", func(w http.ResponseWriter, r *http.Request) {
		cacheMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, "/config/custom.css")
		})).ServeHTTP(w, r)
	})

	staticHandler := http.FileServer(http.FS(assets))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			handleIndex(w, r)
			return
		}
		cacheMiddleware(staticHandler).ServeHTTP(w, r)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "6969"
	}
	log.Printf("[dashboard] Listening on http://0.0.0.0:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

// ── First-run setup ───────────────────────────────────────────────────────────

func ensureConfig() {
	os.MkdirAll("/config/logos", 0755)
	if _, err := os.Stat("/config/services.yaml"); os.IsNotExist(err) {
		if src, err := os.ReadFile("/example.services.yaml"); err == nil {
			os.WriteFile("/config/services.yaml", src, 0644)
			log.Println("[dashboard] No services.yaml found — created example config at /config/services.yaml")
		}
	}
}

// ── Cache middleware ──────────────────────────────────────────────────────────

func cacheMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isBeta {
			w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		} else if r.URL.Query().Get("v") != "" {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "public, max-age=600, must-revalidate")
		}
		next.ServeHTTP(w, r)
	})
}

// ── Dashboard page ────────────────────────────────────────────────────────────

func handleIndex(w http.ResponseWriter, r *http.Request) {
	raw, _ := os.ReadFile("/config/services.yaml")

	// Strip credentials before injecting into the page — they are only needed
	// server-side by the /proxy handler.
	safeYAML := credRe.ReplaceAllString(string(raw), "")

	yamlJSON,      _ := json.Marshal(safeYAML)
	changelogJSON, _ := json.Marshal(string(changelogFile))

	_, statErr := os.Stat("/config/custom.css")
	hasCustomCSS := statErr == nil

	assetVer := version
	if isBeta {
		assetVer = fmt.Sprintf("%d", startedAt)
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Pragma",        "no-cache")
		w.Header().Set("Expires",       "0")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl.Execute(w, pageData{ //nolint:errcheck
		YAMLContent:  template.JS(yamlJSON),
		Changelog:    template.JS(changelogJSON),
		Version:      version,
		AssetVer:     assetVer,
		HasCustomCSS: hasCustomCSS,
	})
}

// ── Status-check endpoints ────────────────────────────────────────────────────

func handlePing(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if !validURL(rawURL) {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if v, ok := pingCache.Load(rawURL); ok {
		if e := v.(cachedPing); time.Since(e.at) < 5*time.Second {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]int{"status": e.status}) //nolint:errcheck
			return
		}
	}

	status := headRequest(rawURL)
	pingCache.Store(rawURL, cachedPing{status: status, at: time.Now()})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"status": status}) //nolint:errcheck
}

func handleBatchPing(w http.ResponseWriter, r *http.Request) {
	rawURLs := r.URL.Query()["urls[]"]
	results := make(map[string]int, len(rawURLs))
	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, rawURL := range rawURLs {
		if !validURL(rawURL) {
			continue
		}
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			status := headRequest(u)
			mu.Lock()
			results[u] = status
			mu.Unlock()
		}(rawURL)
	}
	wg.Wait()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results) //nolint:errcheck
}

// ── API proxy ─────────────────────────────────────────────────────────────────
//
// GET /proxy?svc=<service-name>&path=<url-path-with-optional-query>
//
// Resolves the base URL and credentials for the named service from
// services.yaml, then proxies the request server-side so credentials never
// reach the browser.

func handleProxy(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	svcName := q.Get("svc")
	path    := q.Get("path")

	if svcName == "" || path == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	services, err := loadServiceMap()
	if err != nil {
		http.Error(w, "config unavailable", http.StatusInternalServerError)
		return
	}

	svc, ok := services[svcName]
	if !ok {
		http.Error(w, "unknown service", http.StatusNotFound)
		return
	}

	base := strings.TrimRight(svc.Endpoint, "/")
	if base == "" {
		base = strings.TrimRight(svc.URL, "/")
	}
	targetURL := base + path

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	switch svc.APIType {
	case "pihole":
		proxyPihole(w, ctx, svc, base, targetURL)
	case "dispatcharr":
		proxyJWT(w, ctx, svc, targetURL, loginDispatcharr)
	case "nginxproxymanager":
		proxyJWT(w, ctx, svc, targetURL, loginNPM)
	default:
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			http.Error(w, "bad target URL", http.StatusBadRequest)
			return
		}
		addAuth(req, svc)
		proxyResponse(w, req)
	}
}

// addAuth attaches credentials to req based on the service's api_type.
func addAuth(req *http.Request, svc Service) {
	if svc.APIKey == "" {
		return
	}
	switch svc.APIType {
	case "jellyfin", "emby":
		q := req.URL.Query()
		q.Set("api_key", svc.APIKey)
		req.URL.RawQuery = q.Encode()
	case "sonarr", "radarr":
		req.Header.Set("X-Api-Key", svc.APIKey)
	case "portainer", "immich":
		req.Header.Set("x-api-key", svc.APIKey)
	case "grafana", "homeassistant", "speedtesttracker":
		req.Header.Set("Authorization", "Bearer "+svc.APIKey)
	case "proxmox":
		req.Header.Set("Authorization", "PVEAPIToken="+svc.APIKey)
	case "adguard":
		parts := strings.SplitN(svc.APIKey, ":", 2)
		if len(parts) == 2 {
			req.SetBasicAuth(parts[0], parts[1])
		}
	case "nextcloud":
		parts := strings.SplitN(svc.APIKey, ":", 2)
		if len(parts) == 2 {
			req.SetBasicAuth(parts[0], parts[1])
		}
		req.Header.Set("OCS-APIRequest", "true")
	}
}

// proxyResponse executes req and writes the upstream response to w.
func proxyResponse(w http.ResponseWriter, req *http.Request) {
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
}

// ── Multi-step auth: Pi-hole (password → SID) ─────────────────────────────────

func proxyPihole(w http.ResponseWriter, ctx context.Context, svc Service, base, targetURL string) {
	reqWithSID := func(sid string) (*http.Response, error) {
		u := targetURL
		if sid != "" {
			parsed, err := url.Parse(targetURL)
			if err != nil {
				return nil, err
			}
			pq := parsed.Query()
			pq.Set("sid", sid)
			parsed.RawQuery = pq.Encode()
			u = parsed.String()
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		return client.Do(req)
	}

	// Try cached SID first
	if v, ok := piholeCache.Load(svc.Name); ok {
		resp, err := reqWithSID(v.(string))
		if err == nil && resp.StatusCode != http.StatusUnauthorized {
			defer resp.Body.Close()
			proxyWriteResponse(w, resp)
			return
		}
		if resp != nil {
			resp.Body.Close()
		}
		piholeCache.Delete(svc.Name)
	}

	// No api_key — try unauthenticated (Pi-hole v5 or open instance)
	if svc.APIKey == "" {
		resp, err := reqWithSID("")
		if err != nil {
			http.Error(w, "upstream error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		proxyWriteResponse(w, resp)
		return
	}

	// POST to /api/auth to get a new SID
	body, _ := json.Marshal(map[string]string{"password": svc.APIKey})
	authReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/auth", bytes.NewReader(body))
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	authReq.Header.Set("Content-Type", "application/json")

	authResp, err := client.Do(authReq)
	if err != nil || authResp.StatusCode >= 400 {
		if authResp != nil {
			authResp.Body.Close()
		}
		http.Error(w, "pihole auth failed", http.StatusUnauthorized)
		return
	}

	var authData struct {
		Session struct {
			SID string `json:"sid"`
		} `json:"session"`
		SID string `json:"sid"` // some versions return sid at top level
	}
	json.NewDecoder(authResp.Body).Decode(&authData) //nolint:errcheck
	authResp.Body.Close()

	sid := authData.Session.SID
	if sid == "" {
		sid = authData.SID
	}
	if sid == "" {
		http.Error(w, "pihole auth failed: no SID in response", http.StatusUnauthorized)
		return
	}
	piholeCache.Store(svc.Name, sid)

	resp, err := reqWithSID(sid)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	proxyWriteResponse(w, resp)
}

// ── Multi-step auth: JWT (username+password → Bearer token) ──────────────────

type loginFn func(ctx context.Context, svc Service) (string, error)

func proxyJWT(w http.ResponseWriter, ctx context.Context, svc Service, targetURL string, login loginFn) {
	makeReq := func(token string) (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			return nil, err
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		return client.Do(req)
	}

	// Try cached token first
	if v, ok := jwtCache.Load(svc.Name); ok {
		resp, err := makeReq(v.(string))
		if err == nil && resp.StatusCode != http.StatusUnauthorized {
			defer resp.Body.Close()
			proxyWriteResponse(w, resp)
			return
		}
		if resp != nil {
			resp.Body.Close()
		}
		jwtCache.Delete(svc.Name)
	}

	// Get a fresh token
	token, err := login(ctx, svc)
	if err != nil {
		http.Error(w, "auth failed", http.StatusUnauthorized)
		return
	}
	jwtCache.Store(svc.Name, token)

	resp, err := makeReq(token)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	proxyWriteResponse(w, resp)
}

func loginDispatcharr(ctx context.Context, svc Service) (string, error) {
	base := strings.TrimRight(svc.Endpoint, "/")
	if base == "" {
		base = strings.TrimRight(svc.URL, "/")
	}
	body, _ := json.Marshal(map[string]string{"username": svc.Username, "password": svc.Password})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/accounts/token/", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var data struct {
		Access string `json:"access"`
	}
	json.NewDecoder(resp.Body).Decode(&data) //nolint:errcheck
	if data.Access == "" {
		return "", fmt.Errorf("dispatcharr: no access token in response")
	}
	return data.Access, nil
}

func loginNPM(ctx context.Context, svc Service) (string, error) {
	base := strings.TrimRight(svc.Endpoint, "/")
	if base == "" {
		base = strings.TrimRight(svc.URL, "/")
	}
	body, _ := json.Marshal(map[string]string{"identity": svc.Username, "secret": svc.Password})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/tokens", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var data struct {
		Token string `json:"token"`
	}
	json.NewDecoder(resp.Body).Decode(&data) //nolint:errcheck
	if data.Token == "" {
		return "", fmt.Errorf("nginxproxymanager: no token in response")
	}
	return data.Token, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func proxyWriteResponse(w http.ResponseWriter, resp *http.Response) {
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body) //nolint:errcheck
}

// loadServiceMap reads services.yaml and returns a map keyed by service name.
// Called on every proxy request — the file is small so the overhead is minimal.
func loadServiceMap() (map[string]Service, error) {
	data, err := os.ReadFile("/config/services.yaml")
	if err != nil {
		return nil, err
	}
	var cfg dashConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	m := make(map[string]Service, len(cfg.Services))
	for _, s := range cfg.Services {
		if s.Name != "" {
			m[s.Name] = s
		}
	}
	return m, nil
}

// ── ICMP ping ─────────────────────────────────────────────────────────────────
//
// GET /icmp-ping?host=<hostname-or-ip>
//
// Runs one ICMP ping via the system ping binary and returns the round-trip time
// in milliseconds. Returns {"ms":-1} if the host is unreachable or times out.

func handleICMPPing(w http.ResponseWriter, r *http.Request) {
	host := r.URL.Query().Get("host")
	if host == "" || !hostRe.MatchString(host) {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "ping", "-c", "1", "-W", "2", host).Output()

	ms := -1.0
	if err == nil {
		if m := pingRe.FindSubmatch(out); len(m) >= 2 {
			if v, e := strconv.ParseFloat(string(m[1]), 64); e == nil {
				ms = v
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]float64{"ms": ms}) //nolint:errcheck
}

func validURL(rawURL string) bool {
	if rawURL == "" {
		return false
	}
	u, err := url.Parse(rawURL)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

func headRequest(rawURL string) int {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, rawURL, nil)
	if err != nil {
		return 0
	}
	req.Header.Set("User-Agent", "LabDash/1.0 (status-check)")

	resp, err := client.Do(req)
	if err != nil {
		return 0
	}
	resp.Body.Close()
	return resp.StatusCode
}
