import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Radar — Zahid Sher Sial",
  description: "Daily remote job scanner — Front-End, Webflow, UI/UX, WordPress",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: "#090d13", color: "#e8eaf0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
