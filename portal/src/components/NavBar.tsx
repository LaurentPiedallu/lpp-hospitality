import Link from "next/link";
import type { SessionPayload } from "@/lib/auth";

export default function NavBar({ session }: { session: SessionPayload }) {
  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-400">
            LPP Hospitality
          </span>
        </Link>
        <div className="flex items-center gap-5">
          <span className="text-sm text-gray-500 hidden sm:block">{session.email}</span>
          <a
            href="/api/auth/logout"
            className="text-xs font-medium text-gray-400 hover:text-gray-700 transition"
          >
            Sign out
          </a>
        </div>
      </div>
    </header>
  );
}
