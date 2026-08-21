/** Persistent organization profile and synchronized member roles. */
"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../../convex/_generated/api";

/** Renders current tenant profile and admin-editable locale settings. */
export default function OrganizationSettingsPage() {
  const organization = useQuery(api.organizations.getOrganization, {});
  const members = useQuery(api.organizations.listMembers, {});
  const update = useMutation(api.organizations.updateOrganization);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [notice, setNotice] = useState("");

  /** Saves only supplied profile fields and supports first-run bootstrap. */
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await update({ displayName: displayName.trim() || undefined, timezone: timezone.trim() || undefined });
    setNotice("Organization settings saved.");
    setDisplayName("");
    setTimezone("");
  }

  return <main className="page-shell" id="main-content"><header className="page-intro"><h1>Organization settings</h1><p>Clerk owns membership identity. BidRadar stores procurement locale and synchronized role snapshots.</p></header>{organization === undefined ? <p role="status">Loading organization…</p> : <dl className="definition-grid"><div><dt>Name</dt><dd>{organization?.displayName ?? "Not configured"}</dd></div><div><dt>Slug</dt><dd>{organization?.slug ?? "Not configured"}</dd></div><div><dt>Timezone</dt><dd>{organization?.timezone ?? "Not configured"}</dd></div></dl>}<form onSubmit={submit} className="filter-rail"><h2>Update profile</h2><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kolkata" /></label><button type="submit" className="primary-action">Save settings</button></form>{notice ? <p role="status">{notice}</p> : null}<section><h2>Members</h2>{members === undefined ? <p role="status">Loading members…</p> : members.length === 0 ? <p className="empty-state">Member sync will appear after onboarding or Clerk webhook delivery.</p> : <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Permissions</th></tr></thead><tbody>{members.map((member) => <tr key={member.clerkUserId}><td>{member.clerkUserId}</td><td>{member.role}</td><td>{member.permissions.join(", ") || "Role defaults"}</td></tr>)}</tbody></table></div>}</section></main>;
}
