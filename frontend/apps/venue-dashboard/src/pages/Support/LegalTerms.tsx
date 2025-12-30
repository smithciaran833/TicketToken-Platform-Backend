import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Download, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui";

export default function LegalTerms() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
            <p className="text-gray-500">Last updated: January 1, 2025</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Download PDF
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-8 prose max-w-none">
        <h2>1. Introduction</h2>
        <p>
          Welcome to TicketToken. These Terms of Service ("Terms") govern your use of our platform, 
          website, and services (collectively, the "Service"). By accessing or using the Service, 
          you agree to be bound by these Terms.
        </p>

        <h2>2. Account Registration</h2>
        <p>
          To use certain features of the Service, you must register for an account. You agree to 
          provide accurate, current, and complete information during registration and to update 
          such information to keep it accurate, current, and complete.
        </p>

        <h2>3. Venue Responsibilities</h2>
        <p>As a venue operator using TicketToken, you agree to:</p>
        <ul>
          <li>Provide accurate event information</li>
          <li>Honor all tickets sold through our platform</li>
          <li>Comply with all applicable laws and regulations</li>
          <li>Maintain appropriate insurance coverage</li>
          <li>Handle customer data in accordance with our Privacy Policy</li>
        </ul>

        <h2>4. Fees and Payments</h2>
        <p>
          TicketToken charges fees for ticket sales as outlined in your venue agreement. 
          Fees are deducted from ticket sales before payout. Payout schedules are determined 
          by your account settings and verification status.
        </p>

        <h2>5. Refunds and Cancellations</h2>
        <p>
          Venues are responsible for setting their own refund policies, which must comply 
          with applicable consumer protection laws. TicketToken provides tools to process 
          refunds but is not responsible for refund decisions.
        </p>

        <h2>6. Prohibited Uses</h2>
        <p>You may not use the Service to:</p>
        <ul>
          <li>Violate any applicable laws or regulations</li>
          <li>Sell counterfeit or unauthorized tickets</li>
          <li>Engage in fraudulent activities</li>
          <li>Interfere with the Service's operation</li>
          <li>Collect user data without consent</li>
        </ul>

        <h2>7. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are owned by 
          TicketToken and are protected by international copyright, trademark, and other 
          intellectual property laws.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          TicketToken shall not be liable for any indirect, incidental, special, consequential, 
          or punitive damages resulting from your use of or inability to use the Service.
        </p>

        <h2>9. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. We will notify you of any 
          changes by posting the new Terms on this page and updating the "Last updated" date.
        </p>

        <h2>10. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at{" "}
          <a href="mailto:legal@tickettoken.com">legal@tickettoken.com</a>.
        </p>
      </div>

      {/* Related Links */}
      <div className="mt-6 flex items-center gap-4">
        <Link to="/venue/support/legal/privacy" className="text-purple-600 hover:text-purple-700 flex items-center gap-1">
          Privacy Policy <ExternalLink className="w-4 h-4" />
        </Link>
        <Link to="/venue/support/legal/compliance" className="text-purple-600 hover:text-purple-700 flex items-center gap-1">
          Compliance Guides <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
