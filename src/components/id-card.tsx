"use client";

export function IdCardView({ name, username, role, membershipId, joined, status, qr, avatar }: { name: string; username: string; role: string; membershipId: string; joined: string; status: string; qr: string; avatar: string | null }) {
  async function download() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, 1200, 720);
    ctx.fillStyle = "#ff4d1c";
    ctx.fillRect(0, 0, 18, 720);
    ctx.fillStyle = "#fffcf8";
    ctx.font = "700 72px sans-serif";
    ctx.fillText(name, 80, 180);
    ctx.fillStyle = "#ff4d1c";
    ctx.font = "600 28px sans-serif";
    ctx.fillText(role, 80, 240);
    ctx.fillStyle = "#d9d3cb";
    ctx.font = "400 24px sans-serif";
    ctx.fillText(`@${username}`, 80, 300);
    ctx.fillText(membershipId, 80, 350);
    ctx.fillText(`Joined ${new Date(joined).toLocaleDateString()}`, 80, 400);
    ctx.fillText(status, 80, 450);
    ctx.font = "700 22px sans-serif";
    ctx.fillStyle = "#ff4d1c";
    ctx.fillText("BUILDEX", 80, 620);
    const image = new Image();
    image.src = qr;
    await image.decode();
    ctx.drawImage(image, 900, 460, 180, 180);
    if (avatar) {
      const portrait = new Image();
      portrait.src = avatar;
      await portrait.decode();
      ctx.drawImage(portrait, 900, 80, 180, 180);
    }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${membershipId}.png`;
    link.click();
  }
  return (
    <main className="section">
      <h1 className="display">Membership card</h1>
      <p>Rank is assigned by role. You cannot edit it.</p>
      <article className="card" style={{ maxWidth: 720, background: "#121212", color: "white" }}>
        <p className="kicker">BUILDEX</p>
        <h2 className="display">{name}</h2>
        <p>{role}</p>
        <p>@{username}</p>
        <p>{membershipId}</p>
        <p>Joined {new Date(joined).toLocaleDateString()} · {status}</p>
        <img src={qr} alt="Verification QR" width={120} height={120} />
      </article>
      <button className="btn orange" type="button" onClick={download}>Download PNG</button>
    </main>
  );
}
