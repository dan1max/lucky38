import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lucky 38 Casino",
  description: "Welcome to the Lucky 38. Mr. House extends his greetings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=VT323&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}