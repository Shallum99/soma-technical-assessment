import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "Things To Do",
  description:
    "Task management with dependencies, scheduling, and image previews",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <NuqsAdapter>
          <ErrorBoundary>{children}</ErrorBoundary>
        </NuqsAdapter>
      </body>
    </html>
  );
}
