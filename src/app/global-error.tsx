"use client";

/**
 * Last-resort boundary, for an error thrown in the root layout itself — the one
 * place the dashboard's own error.tsx can't cover, since it lives inside that
 * layout. Replaces the whole document, so it has to render <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: "#0B0B0B", color: "#ffffff", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
          <h1 style={{ fontSize: 16, fontWeight: 600 }}>CowryPay Admin failed to load</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#888888" }}>
            {error.message || "No message was attached to the error."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "8px 14px",
              fontSize: 13,
              borderRadius: 10,
              border: "1px solid #242424",
              background: "transparent",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
