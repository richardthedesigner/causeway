import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "v3 lab / Causewayside",
  description: "A test page for the design v3 components.",
  // Not linked from the app and not for search engines: it is a bench for whoever builds v3.
  robots: { index: false, follow: false },
};

export default function V3LabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
