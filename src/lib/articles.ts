export const ARTICLES = [
  {
    group: "help",
    slug: "publish",
    title: "Publish a site",
    body: [
      "Open the site in Studio and choose Publish. The public copy updates only then.",
      "Free accounts receive a generated slug. Changing it later requires Pro.",
      "If the plan limit is reached, the server refuses another live site. Existing sites stay.",
    ],
  },
  {
    group: "help",
    slug: "plans",
    title: "Plans and limits",
    body: [
      "Limits are read from the plan row on the server for every create, publish, and gated element.",
      "When a subscription expires, sites are not deleted. Extra features stop applying to new actions.",
    ],
  },
  {
    group: "help",
    slug: "templates",
    title: "Template review",
    body: [
      "A designer can draft, import JSON, or upload a ZIP. ZIP files are quarantined and never executed.",
      "Public visitors only see status PUBLISHED. The designer cannot approve their own template.",
    ],
  },
  {
    group: "academy",
    slug: "studio",
    title: "Studio in one sitting",
    body: [
      "Add an element from the left rail. Drag it. Use the property panel for type, color, and box.",
      "Switch to Mobile to write a phone box. Desktop coordinates stay untouched.",
      "Undo is Ctrl+Z. Autosave writes to the server and keeps a local copy if the network drops.",
    ],
  },
  {
    group: "academy",
    slug: "motion",
    title: "Motion without noise",
    body: [
      "Start with fade or slide. Plus adds zoom, rotate, and typewriter. Pro adds timeline, parallax, and particles.",
      "The inspector will flag too many motions. Reduced motion and low-end devices skip the heavy ones.",
    ],
  },
  {
    group: "academy",
    slug: "designer",
    title: "Selling a template",
    body: [
      "Designer plan or designer role is required. Subscription does not grant review or admin rights.",
      "Set a price in cents on the draft. After approval, sales record commission at the platform rate, default 20%.",
      "Payout requests start at $10 and wait for staff review.",
    ],
  },
  {
    group: "legal",
    slug: "privacy",
    title: "Privacy",
    body: [
      "Account data includes name, email, username, and a password hash. Session rows store a hashed token, a coarse IP, and a browser label for security.",
      "Published-site analytics store a daily hash of IP, browser, and site. Raw IP addresses are not kept in analytics.",
      "Form replies and guestbook entries are stored for the site owner. Delete the site and those rows go with it.",
      "Payment rows are kept in anonymized form if you delete your account, so the ledger stays auditable.",
    ],
  },
  {
    group: "legal",
    slug: "terms",
    title: "Terms",
    body: [
      "You own the sites you create. Official catalog templates are licensed for use, and remix only when the license says remix.",
      "You may not upload archives that try to escape their folder, run on the server, or impersonate another person.",
      "Staff may unpublish a public site that breaks these terms. That action is written to the audit log.",
    ],
  },
  {
    group: "legal",
    slug: "cookies",
    title: "Cookies",
    body: [
      "bx_session is an HttpOnly session cookie. bx_csrf is a readable double-submit token. bx_lang stores EN or AR.",
      "A published site may set bx_gate when you pass its password. It expires in 12 hours.",
    ],
  },
  {
    group: "legal",
    slug: "refund",
    title: "Refund policy",
    body: [
      "A payment is recorded as successful only after staff verify the transfer receipt. Staff with refund permission can reverse a verified payment.",
      "Sites are not deleted on refund. Template access is removed and its commission is reversed.",
      "Paid orders are started through the administrator-configured WhatsApp contact. Customers send the order reference and transfer receipt, then staff approve or reject the order.",
    ],
  },
];
