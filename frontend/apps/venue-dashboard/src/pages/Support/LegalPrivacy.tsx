import { Link } from "react-router-dom";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui";

export default function LegalPrivacy() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
            <p className="text-gray-500">Last updated: January 1, 2025</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Download PDF
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8 prose max-w-none">
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly to us, including:</p>
        <ul>
          <li>Account information (name, email, phone number)</li>
          <li>Venue information (name, address, capacity)</li>
          <li>Payment information (processed securely through Stripe)</li>
          <li>Event and ticket data</li>
          <li>Communications with our support team</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, maintain, and improve our services</li>
          <li>Process transactions and send related information</li>
          <li>Send technical notices and support messages</li>
          <li>Respond to your comments and questions</li>
          <li>Analyze usage patterns to improve user experience</li>
        </ul>

        <h2>3. Information Sharing</h2>
        <p>We may share your information with:</p>
        <ul>
          <li>Service providers who assist in our operations</li>
          <li>Payment processors (Stripe) to complete transactions</li>
          <li>Law enforcement when required by law</li>
          <li>Other parties with your consent</li>
        </ul>

        <h2>4. Data Security</h2>
        <p>
          We implement appropriate security measures to protect your personal information, 
          including encryption, secure servers, and regular security audits. However, no 
          method of transmission over the Internet is 100% secure.
        </p>

        <h2>5. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to processing of your data</li>
          <li>Export your data in a portable format</li>
        </ul>

        <h2>6. Cookies and Tracking</h2>
        <p>
          We use cookies and similar tracking technologies to track activity on our Service 
          and hold certain information. You can instruct your browser to refuse all cookies 
          or to indicate when a cookie is being sent.
        </p>

        <h2>7. Third-Party Services</h2>
        <p>
          Our Service may contain links to third-party websites or services. We are not 
          responsible for the privacy practices of these third parties.
        </p>

        <h2>8. Children's Privacy</h2>
        <p>
          Our Service is not intended for children under 13. We do not knowingly collect 
          personal information from children under 13.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          We may update our Privacy Policy from time to time. We will notify you of any 
          changes by posting the new Privacy Policy on this page.
        </p>

        <h2>10. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us at{" "}
          <a href="mailto:privacy@tickettoken.com">privacy@tickettoken.com</a>.
        </p>
      </div>

      {/* Related Links */}
      <div className="mt-6 flex items-center gap-4">
        <Link to="/venue/support/legal/terms" className="text-purple-600 hover:text-purple-700 flex items-center gap-1">
          Terms of Service <ExternalLink className="w-4 h-4" />
        </Link>
        <Link to="/venue/support/legal/compliance" className="text-purple-600 hover:text-purple-700 flex items-center gap-1">
          Compliance Guides <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
