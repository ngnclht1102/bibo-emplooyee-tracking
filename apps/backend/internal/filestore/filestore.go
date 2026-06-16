// Package filestore writes and reads screenshot blobs on the local disk.
//
// Every path component is either a UUID (validated by the caller) or a date derived
// from the screenshot timestamp — never a client-supplied string — so path traversal
// is impossible by construction.
package filestore

import (
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// Store roots all screenshot files under a base directory (STORAGE_DIR).
type Store struct {
	root string
}

// New builds a file store rooted at dir.
func New(dir string) *Store {
	return &Store{root: dir}
}

// rel returns the storage-relative path for a screenshot:
//
//	screenshots/<business_id>/<user_id>/<yyyy-mm-dd>/<client_uuid>.webp
//
// It validates that the id components are UUIDs, refusing anything else.
func (s *Store) rel(businessID, userID string, ts int64, clientUUID string) (string, error) {
	for _, id := range []string{businessID, userID, clientUUID} {
		if _, err := uuid.Parse(id); err != nil {
			return "", errors.New("path component is not a uuid")
		}
	}
	date := time.Unix(ts, 0).UTC().Format("2006-01-02")
	return filepath.Join("screenshots", businessID, userID, date, clientUUID+".webp"), nil
}

// Write stores data and returns the storage-relative path recorded in the DB.
// Re-writing the same screenshot (same uuid + ts) overwrites in place.
func (s *Store) Write(businessID, userID string, ts int64, clientUUID string, data []byte) (string, error) {
	rel, err := s.rel(businessID, userID, ts, clientUUID)
	if err != nil {
		return "", err
	}
	abs := filepath.Join(s.root, rel)
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return "", err
	}
	// Write to a temp file then rename for an atomic replace.
	tmp := abs + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return "", err
	}
	if err := os.Rename(tmp, abs); err != nil {
		_ = os.Remove(tmp)
		return "", err
	}
	return rel, nil
}

// Open opens a stored screenshot by its DB-recorded relative path. The path is
// cleaned and confined to the storage root, so a tampered DB value still can't
// escape it.
func (s *Store) Open(rel string) (*os.File, error) {
	abs := filepath.Join(s.root, filepath.Clean("/"+rel))
	root := filepath.Clean(s.root) + string(os.PathSeparator)
	if !hasPrefix(abs, root) {
		return nil, errors.New("path escapes storage root")
	}
	return os.Open(abs)
}

// Remove deletes a stored screenshot by relative path. A missing file is not an error.
func (s *Store) Remove(rel string) error {
	abs := filepath.Join(s.root, filepath.Clean("/"+rel))
	err := os.Remove(abs)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
