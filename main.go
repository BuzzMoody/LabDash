package main

import (
	"context"
	"crypto/tls"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// ── Embedded assets ───────────────────────────────────────────────────────────

//go:embed index.html
var indexHTML string

//go:embed styles.css app.js js-yaml.min.js api-managers
var assets embed.FS

//go:embed VERSION
var versionFile []byte

//go:embed release-notes.md
var changelogFile []byte

// ── Types & globals ───────────────────────────────────────────────────────────

type pageData struct {
	YAMLContent template.JS
	Changelog   template.JS
	Version     string
	AssetVer    string
}

type cachedPing struct {
	status int
	at     time.Time
}

var (
	version    string
	isBeta     bool
	startedAt  int64
	tmpl       *template.Template
	client     *http.Client
	pingCache  sync.Map // map[string]cachedPing
)

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	version   = strings.TrimSpace(string(versionFile))
	isBeta    = os.Getenv("BETA") == "true"
	startedAt = time.Now().Unix()

	tmpl = template.Must(template.New("index").Parse(indexHTML))

	client = &http.Client{
		Timeout: 5 * time.Second,
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
	mux.Handle("GET /logos/",         http.StripPrefix("/logos/", http.FileServer(http.Dir("/config/logos"))))

	staticHandler := http.FileServer(http.FS(assets))
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			handleIndex(w, r)
			return
		}
		staticHandler.ServeHTTP(w, r)
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

// ── Dashboard page ────────────────────────────────────────────────────────────

func handleIndex(w http.ResponseWriter, r *http.Request) {
	yaml, _ := os.ReadFile("/config/services.yaml")

	yamlJSON,      _ := json.Marshal(string(yaml))
	changelogJSON, _ := json.Marshal(string(changelogFile))

	assetVer := version
	if isBeta {
		// New deploy = new binary = new timestamp = cache busted automatically
		assetVer = fmt.Sprintf("%d", startedAt)
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("Pragma",        "no-cache")
		w.Header().Set("Expires",       "0")
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl.Execute(w, pageData{ //nolint:errcheck
		YAMLContent: template.JS(yamlJSON),
		Changelog:   template.JS(changelogJSON),
		Version:     version,
		AssetVer:    assetVer,
	})
}

// ── Status-check endpoints ────────────────────────────────────────────────────

func handlePing(w http.ResponseWriter, r *http.Request) {
	rawURL := r.URL.Query().Get("url")
	if !validURL(rawURL) {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// 5-second in-memory cache shared across all concurrent requests
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
