package auth

import "testing"

func TestPasswordRoundTrip(t *testing.T) {
	hash, err := HashPassword("supersecret")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "supersecret" {
		t.Fatal("password stored in plaintext")
	}

	ok, err := VerifyPassword(hash, "supersecret")
	if err != nil || !ok {
		t.Fatalf("verify correct password: ok=%v err=%v", ok, err)
	}
	bad, err := VerifyPassword(hash, "wrong")
	if err != nil {
		t.Fatalf("verify wrong password errored: %v", err)
	}
	if bad {
		t.Fatal("wrong password verified")
	}
}

func TestPasswordSaltsDiffer(t *testing.T) {
	a, _ := HashPassword("same")
	b, _ := HashPassword("same")
	if a == b {
		t.Fatal("identical passwords produced identical hashes (salt not random)")
	}
}

func TestTokenKindEnforced(t *testing.T) {
	m := NewManager("test-secret")
	pair, err := m.Issue("user-123")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	uid, err := m.ParseAccess(pair.AccessToken)
	if err != nil || uid != "user-123" {
		t.Fatalf("parse access: uid=%q err=%v", uid, err)
	}
	if _, err := m.ParseRefresh(pair.AccessToken); err == nil {
		t.Fatal("access token accepted as refresh token")
	}
	if _, err := m.ParseAccess(pair.RefreshToken); err == nil {
		t.Fatal("refresh token accepted as access token")
	}
}

func TestTokenWrongSecretRejected(t *testing.T) {
	pair, _ := NewManager("secret-a").Issue("u1")
	if _, err := NewManager("secret-b").ParseAccess(pair.AccessToken); err == nil {
		t.Fatal("token signed with a different secret was accepted")
	}
}
