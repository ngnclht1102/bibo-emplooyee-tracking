package handlers

import "testing"

func TestNoNUL(t *testing.T) {
	if got := noNUL("Doc\x00ument\x00"); got != "Document" {
		t.Errorf("got %q", got)
	}
	if noNULPtr(nil) != nil {
		t.Error("nil must stay nil")
	}
	s := "a\x00b"
	if got := noNULPtr(&s); *got != "ab" {
		t.Errorf("got %q", *got)
	}
}
