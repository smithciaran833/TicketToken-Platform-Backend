import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Privacy Policy</h1>
        </div>
      </header>

      <div className="px-5 py-6 prose prose-gray max-w-none">
        <p className="text-sm text-gray-500">Effective Date: January 1, 2025</p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">Information We Collect</h2>
        <p className="text-gray-600">
          We collect information you provide directly, including your name, email address, phone number, and payment information. We also collect usage data and device information when you use our Service.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">How We Use Your Information</h2>
        <p className="text-gray-600">
          We use your information to process transactions, provide customer support, personalize your experience, and send relevant communications about events and promotions.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">Information Sharing</h2>
        <p className="text-gray-600">
          We share information with event organizers for entry verification, payment processors for transaction handling, and service providers who assist our operations. We do not sell your personal information.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">Data Security</h2>
        <p className="text-gray-600">
          We implement industry-standard security measures to protect your data. Payment information is encrypted and processed through PCI-compliant providers.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">Your Rights</h2>
        <p className="text-gray-600">
          You may access, update, or delete your personal information through your account settings. California residents have additional rights under the CCPA.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">Cookies</h2>
        <p className="text-gray-600">
          We use cookies and similar technologies to improve functionality, analyze usage, and personalize content. See our Cookie Policy for more details.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">Contact Us</h2>
        <p className="text-gray-600">
          For privacy-related inquiries, contact our Data Protection Officer at privacy@tickettoken.com.
        </p>
      </div>
    </div>
  );
}
