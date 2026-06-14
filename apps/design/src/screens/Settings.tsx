import { useState } from "react";
import { Segmented } from "../ui";

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-row">
      <div>
        <div className="set-title">{title}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function Settings({ onOpenPermissions }: { onOpenPermissions: () => void }) {
  const [theme, setTheme] = useState("System");
  const [domainOnly, setDomainOnly] = useState(false);

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 24 }}>
      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Appearance</div>
        <div className="set-group">
          <Row title="Theme" desc="Follow macOS or force a mode">
            <Segmented options={["Light", "Dark", "System"]} value={theme} onChange={setTheme} />
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Capture</div>
        <div className="set-group">
          <Row title="Screenshot interval" desc="How often screens are captured">
            <select className="btn">
              <option>5 min</option>
              <option selected>10 min</option>
              <option>15 min</option>
            </select>
          </Row>
          <Row title="Idle threshold" desc="No input for this long pauses time counting">
            <select className="btn">
              <option selected>60 sec</option>
              <option>3 min</option>
              <option>5 min</option>
            </select>
          </Row>
          <Row title="Screenshot retention" desc="Auto-delete old captures">
            <select className="btn">
              <option>7 days</option>
              <option selected>30 days</option>
              <option>90 days</option>
            </select>
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Privacy</div>
        <div className="set-group">
          <Row title="Store domain only" desc="Record example.com instead of the full URL">
            <button
              className={`switch ${domainOnly ? "" : "off"}`}
              onClick={() => setDomainOnly((v) => !v)}
            />
          </Row>
          <Row title="Permissions" desc="Accessibility, Input Monitoring, Screen Recording">
            <button className="btn" onClick={onOpenPermissions}>
              Manage →
            </button>
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Browser link</div>
        <div className="set-group">
          <Row title="Ingest port" desc="Extension auto-discovers this">
            <span className="num muted">127.0.0.1 : 47615</span>
          </Row>
          <Row title="Pairing token" desc="Shared secret for the extension">
            <span className="pill pill-success">● Active</span>
          </Row>
        </div>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Export</div>
        <div className="row">
          <button className="btn btn-primary">Export CSV</button>
          <button className="btn">Export JSON</button>
        </div>
      </section>
    </div>
  );
}
