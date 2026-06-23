package obs

import (
	"bufio"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// TestConcurrentNoInterleaving fires many goroutines logging at once through both obs
// (JSON) and the stdlib log package, then proves the on-disk file is intact: every JSON
// record parses (a scrambled/interleaved line would fail to parse), the exact expected
// number of records is present, and each goroutine's own sequence numbers appear in
// increasing order (writes from one source are never reordered).
func TestConcurrentNoInterleaving(t *testing.T) {
	dir := t.TempDir()
	// MaxSizeMB 0 → lumberjack default (100MB): no rotation, one file to inspect.
	if err := Init("test", FileConfig{Dir: dir, MaxSizeMB: 0, MaxBackups: 3, MaxAgeDays: 1}); err != nil {
		t.Fatalf("Init: %v", err)
	}

	const goroutines = 32
	const perG = 500

	var wg sync.WaitGroup
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(gid int) {
			defer wg.Done()
			for i := 0; i < perG; i++ {
				Info("concurrent", "gid", gid, "seq", i, "pad", strings.Repeat("x", 40))
				if i%50 == 0 {
					// stdlib log.Printf must also land in the same file, intact.
					log.Printf("stdlib gid=%d seq=%d", gid, i)
				}
			}
		}(g)
	}
	wg.Wait()
	if err := Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	f, err := os.Open(filepath.Join(dir, "backend.log"))
	if err != nil {
		t.Fatalf("open log: %v", err)
	}
	defer f.Close()

	jsonCount := 0
	lastSeq := make(map[int]int) // gid -> last seq seen; must be strictly increasing
	for k := range lastSeq {
		lastSeq[k] = -1
	}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		if line[0] != '{' {
			// stdlib log line — just confirm it wasn't sliced mid-write.
			if !strings.Contains(line, "stdlib gid=") {
				t.Fatalf("corrupted stdlib line: %q", line)
			}
			continue
		}
		var rec struct {
			Msg string `json:"msg"`
			Gid int    `json:"gid"`
			Seq int    `json:"seq"`
		}
		if err := json.Unmarshal([]byte(line), &rec); err != nil {
			t.Fatalf("interleaved/corrupted JSON line: %v\n%q", err, line)
		}
		if rec.Msg != "concurrent" {
			continue
		}
		jsonCount++
		if prev, ok := lastSeq[rec.Gid]; ok && rec.Seq <= prev {
			t.Fatalf("gid %d out of order: seq %d after %d", rec.Gid, rec.Seq, prev)
		}
		lastSeq[rec.Gid] = rec.Seq
	}
	if err := sc.Err(); err != nil {
		t.Fatalf("scan: %v", err)
	}

	if want := goroutines * perG; jsonCount != want {
		t.Fatalf("record count = %d, want %d (missing or corrupted records)", jsonCount, want)
	}
}

// TestRotation writes past the size cap and confirms lumberjack rolled the file: at least
// one rotated backup exists alongside the active backend.log.
func TestRotation(t *testing.T) {
	dir := t.TempDir()
	if err := Init("test", FileConfig{Dir: dir, MaxSizeMB: 1, MaxBackups: 5, MaxAgeDays: 1}); err != nil {
		t.Fatalf("Init: %v", err)
	}

	// ~1.5MB of records (each line ~200B) to force at least one rotation past the 1MB cap.
	big := strings.Repeat("y", 180)
	for i := 0; i < 8000; i++ {
		Info("rotate", "i", i, "pad", big)
	}
	if err := Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("readdir: %v", err)
	}
	var active, backups int
	for _, e := range entries {
		name := e.Name()
		switch {
		case name == "backend.log":
			active++
		case strings.HasPrefix(name, "backend-"): // backend-<ts>.log or .log.gz
			backups++
		}
	}
	if active != 1 {
		t.Fatalf("expected exactly 1 active backend.log, got %d", active)
	}
	if backups < 1 {
		t.Fatalf("expected >=1 rotated backup file, got %d (rotation did not trigger)", backups)
	}
}
