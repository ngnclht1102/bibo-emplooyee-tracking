import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createBusiness,
  createEmployee,
  listBusinessEmployees,
} from "../api/endpoints";
import { ApiError, type Employee } from "../api/types";
import { BusinessPicker } from "../components/BusinessPicker";
import { Empty, Field, Modal, Notice, Spinner } from "../components/ui";
import { useBusinesses } from "../useBusinesses";

export function Employees() {
  const {
    businesses,
    selected,
    selectedId,
    setSelectedId,
    loading: bizLoading,
    reload: reloadBiz,
  } = useBusinesses();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [showBiz, setShowBiz] = useState(false);
  const [showEmp, setShowEmp] = useState(false);
  const [autoCreatedNote, setAutoCreatedNote] = useState<string | null>(null);

  function loadEmployees(id: string) {
    setLoading(true);
    setListError(null);
    listBusinessEmployees(id)
      .then((r) => setEmployees(r.employees))
      .catch(() => setListError("Could not load employees."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (selectedId) loadEmployees(selectedId);
    else setEmployees([]);
  }, [selectedId]);

  const hasBusiness = businesses.length > 0;

  return (
    <div>
      <div className="toolbar spread" style={{ justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "var(--fz-lg)", margin: 0 }}>Employees</h1>
        <div className="row" style={{ gap: 8 }}>
          <BusinessPicker businesses={businesses} selectedId={selectedId} onChange={setSelectedId} />
          <button className="btn" onClick={() => setShowBiz(true)}>
            New business
          </button>
          <button className="btn btn-primary" onClick={() => setShowEmp(true)}>
            Add employee
          </button>
        </div>
      </div>

      {!hasBusiness && !bizLoading && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="info">
            You don't own a business yet. Adding your first employee will automatically create one
            (<em>"&lt;your name&gt;'s Team"</em>). You can also create one explicitly with "New
            business".
          </Notice>
        </div>
      )}

      {autoCreatedNote && (
        <div style={{ marginBottom: 16 }}>
          <Notice kind="success">{autoCreatedNote}</Notice>
        </div>
      )}

      {bizLoading && <Spinner label="Loading…" />}
      {selected && (
        <div className="caption" style={{ marginBottom: 8 }}>
          Roster for <strong>{selected.name}</strong>
        </div>
      )}

      {listError && <Notice kind="danger">{listError}</Notice>}
      {loading && <Spinner label="Loading employees…" />}

      {!loading && selectedId && employees.length === 0 && !listError && (
        <Empty>No employees in this business yet.</Empty>
      )}

      {employees.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 500 }}>{e.display_name}</td>
                <td className="muted">{e.email}</td>
                <td style={{ textAlign: "right" }}>
                  <Link to={`/employees/${e.id}?business=${selectedId}`}>View reports</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showBiz && (
        <NewBusinessModal
          onClose={() => setShowBiz(false)}
          onCreated={async (id) => {
            setShowBiz(false);
            await reloadBiz();
            setSelectedId(id);
          }}
        />
      )}

      {showEmp && (
        <NewEmployeeModal
          businessId={selectedId}
          onClose={() => setShowEmp(false)}
          onCreated={async (newBusinessId, wasAutoCreated) => {
            setShowEmp(false);
            if (wasAutoCreated) {
              await reloadBiz();
              setSelectedId(newBusinessId);
              setAutoCreatedNote(
                "No business existed, so a default one was created automatically and your employee was added to it.",
              );
            } else if (selectedId) {
              loadEmployees(selectedId);
            }
          }}
        />
      )}
    </div>
  );
}

function NewBusinessModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const biz = await createBusiness(name.trim());
      onCreated(biz.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create business.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New business" onClose={onClose}>
      <form onSubmit={submit}>
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="danger">{error}</Notice>
          </div>
        )}
        <Field label="Business name">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewEmployeeModal({
  businessId,
  onClose,
  onCreated,
}: {
  businessId: string | null;
  onClose: () => void;
  onCreated: (businessId: string, wasAutoCreated: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await createEmployee({
        email: email.trim(),
        display_name: displayName.trim(),
        password,
        // Omit business_id when none is selected: backend auto-creates one.
        business_id: businessId ?? undefined,
      });
      onCreated(res.business.id, businessId === null);
    } catch (err) {
      if (err instanceof ApiError) {
        // Map well-known validation cases inline; otherwise show a banner.
        if (err.status === 409) {
          setFieldErrors({ email: "An account with this email already exists." });
        } else if (/password/i.test(err.message)) {
          setFieldErrors({ password: err.message });
        } else {
          setError(err.message);
        }
      } else {
        setError("Could not create employee.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add employee" onClose={onClose}>
      <form onSubmit={submit}>
        {!businessId && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="info">
              No business selected — a default one will be created automatically for this employee.
            </Notice>
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Notice kind="danger">{error}</Notice>
          </div>
        )}
        <Field label="Display name">
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Temporary password" error={fieldErrors.password}>
          <input
            className="input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <div className="caption">
          Share these credentials with the employee; they sign in from the desktop app's login
          picker.
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add employee"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
