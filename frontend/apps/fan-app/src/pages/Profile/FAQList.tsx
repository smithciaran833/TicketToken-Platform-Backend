import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

const mockFAQs: FAQ[] = [
  {
    id: "1",
    question: "How do I transfer a ticket to someone else?",
    answer: "To transfer a ticket, go to My Tickets, select the ticket you want to transfer, and tap 'Transfer Ticket'. Enter the recipient's email or phone number and confirm. They'll receive a link to claim the ticket.",
  },
  {
    id: "2",
    question: "Can I get a refund for my tickets?",
    answer: "Refund policies vary by event. Generally, refunds are available up to 7 days before the event for a full refund, and 3-7 days for a 50% refund. Some events may have different policies. Check the event page for specific details.",
  },
  {
    id: "3",
    question: "How do I add my tickets to Apple Wallet?",
    answer: "Open your ticket in the app and tap 'Add to Wallet'. You can also find this option in the ticket details screen. Your ticket will be saved to your Apple Wallet and accessible even offline.",
  },
  {
    id: "4",
    question: "What if I can't find my tickets?",
    answer: "First, make sure you're logged into the correct account. Check your email for the order confirmation. If you still can't find them, contact our support team with your order number and we'll help locate your tickets.",
  },
  {
    id: "5",
    question: "How does the resale marketplace work?",
    answer: "You can list tickets you can't use for resale through our marketplace. Set your price (up to 2x face value), and we'll handle the secure transfer to the buyer. You'll receive payment within 3-5 business days after the sale.",
  },
];

export default function FAQList() {
  const { category } = useParams();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categoryTitle = category
    ? category.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    : "FAQ";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{categoryTitle}</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        <div className="space-y-3">
          {mockFAQs.map((faq) => (
            <div key={faq.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-medium text-gray-900">{faq.question}</span>
                {expandedId === faq.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                )}
              </button>
              {expandedId === faq.id && (
                <div className="px-5 pb-4">
                  <p className="text-gray-600">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
