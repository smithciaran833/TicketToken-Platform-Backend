import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, ChevronRight } from "lucide-react";

const legalPages = [
  { id: "terms", label: "Terms of Service", path: "/profile/legal/terms" },
  { id: "privacy", label: "Privacy Policy", path: "/profile/legal/privacy" },
  { id: "cookies", label: "Cookie Policy", path: "/profile/legal/cookies" },
  { id: "refund", label: "Refund Policy", path: "/profile/legal/refund" },
  { id: "resale", label: "Resale Terms", path: "/profile/legal/resale" },
  { id: "nft", label: "NFT Terms", path: "/profile/legal/nft" },
  { id: "licenses", label: "Open Source Licenses", path: "/profile/legal/licenses" },
];

export default function LegalPages() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Legal</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {legalPages.map((page) => (
            <Link
              key={page.id}
              to={page.path}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-5 h-5 text-gray-400" />
              <span className="flex-1 font-medium text-gray-900">{page.label}</span>
              <ChevronRight className="w-5 h-5 text-gray-300" />
            </Link>
          ))}
        </div>

        <p className="text-sm text-gray-400 text-center mt-6">
          Last updated: January 1, 2025
        </p>
      </div>
    </div>
  );
}
