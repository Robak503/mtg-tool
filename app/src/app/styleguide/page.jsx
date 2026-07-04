/* LEYLINE styleguide — the living reference for the design system.
   Hidden surface: reachable only at /styleguide (not linked from nav).
   Every later wave composes from what this page demonstrates; if a
   pattern isn't here, it isn't in the system. */

export const metadata = { title: "LEYLINE — styleguide" };

const SURFACES = [
  ["--ley-bg", "bg"],
  ["--ley-surface-0", "surface-0"],
  ["--ley-surface-1", "surface-1"],
  ["--ley-surface-2", "surface-2"],
  ["--ley-surface-3", "surface-3"],
  ["--ley-surface-4", "surface-4"],
];

const GREENS = [
  ["--ley-green", "green (accent)"],
  ["--ley-green-bright", "green-bright (hot)"],
  ["--ley-green-deep", "green-deep (pressed)"],
  ["--ley-green-dim", "green-dim (tint)"],
  ["--ley-green-faint", "green-faint (wash)"],
  ["--ley-green-text", "green-text (copy)"],
];

const STATUS = [
  ["--ley-gold", "gold (warn)"],
  ["--ley-red", "red (danger)"],
  ["--ley-blue", "blue (info)"],
  ["--ley-text", "text"],
  ["--ley-text-dim", "text-dim"],
  ["--ley-text-faint", "text-faint"],
];

function Swatch({ token, label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 130 }}>
      <div
        style={{
          height: 56,
          borderRadius: "var(--r-md)",
          background: `var(${token})`,
          border: "1px solid var(--ley-line)",
        }}
      />
      <div style={{ fontSize: 11, color: "var(--ley-text-dim)", fontFamily: "var(--font-mono)" }}>
        {label}
        <br />
        <span style={{ color: "var(--ley-text-faint)" }}>{token}</span>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          color: "var(--ley-green)",
          margin: "0 0 4px",
        }}
      >
        {title}
      </h2>
      <div style={{ height: 1, background: "var(--ley-line)", marginBottom: 18 }} />
      {children}
    </section>
  );
}

function ButtonRow({ label, cls }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
      <span style={{ width: 110, fontSize: 11, color: "var(--ley-text-faint)", fontFamily: "var(--font-mono)" }}>
        {label}
      </span>
      <button className={`btn ${cls} btn-sm`}>Small</button>
      <button className={`btn ${cls}`}>Default</button>
      <button className={`btn ${cls} btn-lg`}>Large</button>
      <button className={`btn ${cls}`} disabled>
        Disabled
      </button>
      <button className={`btn ${cls} btn-loading`}>Loading</button>
      <button className={`btn ${cls} btn-icon`} aria-label="icon">
        ✦
      </button>
    </div>
  );
}

export default function Styleguide() {
  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "48px 32px 120px",
        fontFamily: "var(--font-body)",
        color: "var(--ley-text)",
      }}
    >
      <header style={{ marginBottom: 48 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "var(--ley-green-text)",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          MTG Tool design system
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 44,
            margin: 0,
            color: "var(--ley-text)",
            textShadow: "0 0 24px var(--ley-green-glow)",
          }}
        >
          LEYLINE
        </h1>
        <p style={{ color: "var(--ley-text-dim)", maxWidth: 560, lineHeight: 1.55 }}>
          Green energy through dark glass. True-black surfaces, phosphor-green accents, glow as
          hierarchy. Compose from tokens — never hand-hex. One primary action per surface. Only
          primary actions, live states, and focus glow.
        </p>
      </header>

      <Section title="Surface ramp">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {SURFACES.map(([t, l]) => (
            <Swatch key={t} token={t} label={l} />
          ))}
        </div>
      </Section>

      <Section title="The green ramp">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {GREENS.map(([t, l]) => (
            <Swatch key={t} token={t} label={l} />
          ))}
        </div>
      </Section>

      <Section title="Status + text">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {STATUS.map(([t, l]) => (
            <Swatch key={t} token={t} label={l} />
          ))}
        </div>
      </Section>

      <Section title="The button system">
        <ButtonRow label="btn-primary" cls="btn-primary" />
        <ButtonRow label="btn-secondary" cls="btn-secondary" />
        <ButtonRow label="btn-ghost" cls="btn-ghost" />
        <ButtonRow label="btn-danger" cls="btn-danger" />
        <p style={{ fontSize: 12, color: "var(--ley-text-faint)", maxWidth: 560, lineHeight: 1.5 }}>
          Primary = THE action (one per surface, the only button that glows). Secondary = supporting
          actions on glass. Ghost = utility. Danger = destructive, never glows. Labels say what
          happens: &ldquo;Import deck&rdquo;, never &ldquo;OK&rdquo;.
        </p>
      </Section>

      <Section title="Glass panels">
        <div
          style={{
            position: "relative",
            padding: 28,
            borderRadius: "var(--r-lg)",
            background:
              "radial-gradient(600px 200px at 20% 0%, rgba(86,214,93,0.14), transparent), var(--ley-surface-1)",
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div className="ley-glass" style={{ padding: 20, width: 260 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 6 }}>
              ley-glass
            </div>
            <div style={{ fontSize: 12, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
              Standard panel: blur {`14px`}, translucent green-black, 1px luminous hairline.
            </div>
          </div>
          <div className="ley-glass-strong ley-glass-lit" style={{ padding: 20, width: 260 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 6 }}>
              ley-glass-strong + lit
            </div>
            <div style={{ fontSize: 12, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
              Elevated glass for modals and sheets — lit top edge, deep drop shadow.
            </div>
          </div>
          <div
            className="ley-card ley-glass"
            style={{ padding: 20, width: 260, cursor: "pointer" }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, marginBottom: 6 }}>
              ley-card (hover me)
            </div>
            <div style={{ fontSize: 12, color: "var(--ley-text-dim)", lineHeight: 1.5 }}>
              Interactive card — green glow edge on hover, nothing at rest.
            </div>
          </div>
        </div>
      </Section>

      <Section title="Type scale">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 34 }}>Display 34 — Space Grotesk</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>Title 22 — Space Grotesk</div>
          <div style={{ fontSize: 15 }}>Body 15 — Inter</div>
          <div style={{ fontSize: 13, color: "var(--ley-text-dim)" }}>Secondary 13 — Inter, text-dim</div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--ley-green-text)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Label 12 — JetBrains Mono, tracked caps
          </div>
        </div>
      </Section>

      <Section title="Motion">
        <p style={{ fontSize: 12, color: "var(--ley-text-dim)", maxWidth: 560, lineHeight: 1.6 }}>
          <code style={{ fontFamily: "var(--font-mono)", color: "var(--ley-green-text)" }}>
            --t-fast 100ms · --t-snap 160ms · --ease-snap cubic-bezier(.2,.9,.3,1)
          </code>
          <br />
          Kiosk-snappy: state changes land under 160ms, buttons press down 1px, nothing floats or
          drifts. Reserve <code style={{ fontFamily: "var(--font-mono)" }}>.ley-live</code> pulse
          for genuinely live states (a running sim, a streaming answer).
        </p>
      </Section>
    </main>
  );
}
