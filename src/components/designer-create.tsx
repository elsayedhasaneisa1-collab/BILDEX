"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function DesignerCreate() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="grid-2">
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        try {
          const row = await api<{ id: string }>("/api/templates", { name: data.name, description: data.description, price: Number(data.price || 0), tier: data.tier, license: data.license, categoryKey: data.categoryKey });
          router.push(`/studio/template/${row.id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create");
        }
      }}>
        <h2>Create in the editor</h2>
        {error && <div className="form-error">{error}</div>}
        <label className="field"><span>Name</span><input name="name" required /></label>
        <label className="field"><span>Description</span><textarea name="description" /></label>
        <label className="field"><span>Price in cents</span><input name="price" type="number" defaultValue={0} /></label>
        <label className="field"><span>Tier</span><select name="tier"><option>free</option><option>plus</option><option>pro</option></select></label>
        <label className="field"><span>License</span><select name="license"><option value="use">use</option><option value="remix">remix</option></select></label>
        <label className="field"><span>Category key</span><input name="categoryKey" placeholder="portfolio" /></label>
        <button className="btn orange" type="submit">Open studio</button>
      </form>
      <form className="card" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = new FormData(form);
        try {
          const row = await api<{ id: string }>("/api/templates", body);
          router.push(`/designer/templates`);
          void row;
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload rejected");
        }
      }}>
        <h2>Upload ZIP</h2>
        <p>The archive is inspected and quarantined. It is not executed or published.</p>
        <input name="name" placeholder="Template name" />
        <input name="file" type="file" accept=".zip,application/zip" required />
        <button className="btn" type="submit">Quarantine ZIP</button>
      </form>
      <JsonImport />
    </div>
  );
}

function JsonImport() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        const document = JSON.parse(String(data.get("json") || ""));
        const row = await api<{ id: string }>("/api/templates", { import: true, name: data.get("name"), document });
        router.push(`/studio/template/${row.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid JSON");
      }
    }}>
      <h2>Import JSON</h2>
      {error && <div className="form-error">{error}</div>}
      <input name="name" placeholder="Name" required />
      <textarea name="json" rows={8} placeholder="Paste a BUILDEX document" required />
      <button className="btn" type="submit">Import as draft</button>
    </form>
  );
}

export function DesignerProfileForm({ user, profile }: {
  user: { bio: string; headline: string };
  profile: {
    coverUrl: string | null;
    skills: string[];
    specialties: string[];
    socialLinks: Record<string, string>;
    visibility: Record<string, boolean>;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const socialLinks = Object.fromEntries(["instagram", "behance", "dribbble", "linkedin", "website"].map((key) => [key, String(form.get(key) || "").trim()]));
      const visibility = Object.fromEntries(["bio", "skills", "socialLinks", "posts", "portfolio"].map((key) => [key, form.get(`show_${key}`) === "on"]));
      try {
        await api("/api/account", {
          designerProfile: {
            coverUrl: String(form.get("coverUrl") || "").trim(),
            skills: String(form.get("skills") || "").split(",").map((item) => item.trim()).filter(Boolean),
            specialties: String(form.get("specialties") || "").split(",").map((item) => item.trim()).filter(Boolean),
            socialLinks,
            visibility,
          },
        }, "PATCH");
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save profile");
      }
    }}>
      <h1 className="display">Public designer profile</h1>
      <p>Your public profile is linked to your BUILDEX membership card. Only published templates appear in your portfolio.</p>
      {error && <div className="form-error">{error}</div>}
      {saved && <div className="notice">Profile settings saved.</div>}
      <label className="field"><span>Cover image URL</span><input name="coverUrl" type="text" defaultValue={profile.coverUrl || ""} placeholder="https://... or /images/..." /></label>
      <label className="field"><span>Skills, separated by commas</span><input name="skills" defaultValue={profile.skills.join(", ")} placeholder="UI Design, Branding, Web Design" /></label>
      <label className="field"><span>Specialties, separated by commas</span><input name="specialties" defaultValue={profile.specialties.join(", ")} placeholder="Portfolio, Business, E-commerce" /></label>
      <div className="grid-2">
        {(["instagram", "behance", "dribbble", "linkedin", "website"] as const).map((key) => <label key={key} className="field"><span>{key[0].toUpperCase() + key.slice(1)}</span><input name={key} type="url" defaultValue={profile.socialLinks[key] || ""} /></label>)}
      </div>
      <h3>Profile privacy</h3>
      <div className="grid-2">
        {(["bio", "skills", "socialLinks", "posts", "portfolio"] as const).map((key) => <label key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}><input name={`show_${key}`} type="checkbox" defaultChecked={profile.visibility[key] !== false} />Show {key}</label>)}
      </div>
      <p className="muted">Your account name, username, membership verification and public profile link remain visible while your profile is active.</p>
      <button className="btn orange" type="submit">Save public profile</button>
      <a className="btn line" href="/designers">Open designer directory</a>
      <small>Account bio: {user.bio ? "Set in account settings" : "Add a bio in account settings"}. {user.headline ? `Headline: ${user.headline}` : ""}</small>
    </form>
  );
}
