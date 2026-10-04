import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review / Causewayside",
  description: "Flags, photos and reports, for Causewayside reviewers.",
  // Not linked from the app and not for search engines: it is a tool for the people who look after notes.
  robots: { index: false, follow: false },
};

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
