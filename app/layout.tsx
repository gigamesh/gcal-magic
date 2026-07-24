import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendar Video Renderer",
  description: "Renders video as Google Calendar events in real time",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
