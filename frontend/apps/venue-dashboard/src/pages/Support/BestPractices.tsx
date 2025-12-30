import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronDown, Calendar, DollarSign, Megaphone, Users, HeartHandshake } from "lucide-react";

const topics = [
  {
    id: 1,
    title: "Event Creation Tips",
    icon: Calendar,
    content: [
      { title: "Write compelling event descriptions", description: "Include what makes your event unique, who should attend, and what they'll experience." },
      { title: "Use high-quality images", description: "Events with professional photos sell 3x more tickets on average." },
      { title: "Set the right event duration", description: "Be accurate with start and end times to set proper expectations." },
      { title: "Add detailed FAQs", description: "Answer common questions upfront to reduce support inquiries." },
    ],
    relatedArticles: [1, 2],
  },
  {
    id: 2,
    title: "Pricing Strategies",
    icon: DollarSign,
    content: [
      { title: "Offer early bird pricing", description: "Create urgency and reward early buyers with 10-20% discounts." },
      { title: "Create tiered ticket options", description: "Offer GA, VIP, and premium options to capture different price points." },
      { title: "Use dynamic pricing strategically", description: "Increase prices as the event approaches and tickets become scarce." },
      { title: "Bundle tickets with add-ons", description: "Increase average order value with parking, merchandise, or F&B credits." },
    ],
    relatedArticles: [2, 7],
  },
  {
    id: 3,
    title: "Marketing Your Events",
    icon: Megaphone,
    content: [
      { title: "Share on social media", description: "Post your event link on all your social channels with engaging visuals." },
      { title: "Send email campaigns", description: "Notify your mailing list with compelling subject lines and clear CTAs." },
      { title: "Create urgency", description: "Use countdown timers and limited-time offers to drive action." },
      { title: "Leverage past attendees", description: "Email previous event attendees who are more likely to buy again." },
    ],
    relatedArticles: [5],
  },
  {
    id: 4,
    title: "Day-of Operations",
    icon: Users,
    content: [
      { title: "Brief your team", description: "Ensure all staff know their roles and have access to the scanner app." },
      { title: "Set up multiple entry points", description: "Reduce wait times with parallel check-in lines for different ticket types." },
      { title: "Have a backup plan", description: "Prepare for Wi-Fi issues with offline scanning capabilities." },
      { title: "Monitor real-time attendance", description: "Use the dashboard to track check-ins and identify bottlenecks." },
    ],
    relatedArticles: [4],
  },
  {
    id: 5,
    title: "Customer Service Excellence",
    icon: HeartHandshake,
    content: [
      { title: "Respond quickly to inquiries", description: "Aim to respond to customer questions within 2-4 hours." },
      { title: "Have a clear refund policy", description: "Set expectations upfront to avoid disputes." },
      { title: "Follow up after events", description: "Send thank you emails and ask for feedback or reviews." },
      { title: "Handle complaints gracefully", description: "Turn negative experiences into positive ones with quick resolution." },
    ],
    relatedArticles: [6],
  },
];

export default function BestPractices() {
  const [expandedTopic, setExpandedTopic] = useState<number | null>(1);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Best Practices</h1>
          <p className="text-gray-500">Tips and strategies for successful events</p>
        </div>
      </div>

      {/* Topics */}
      <div className="space-y-4">
        {topics.map((topic) => {
          const Icon = topic.icon;
          const isExpanded = expandedTopic === topic.id;

          return (
            <div key={topic.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-purple-600" />
                </div>
                <span className="flex-1 font-medium text-gray-900">{topic.title}</span>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="pt-4 space-y-4">
                    {topic.content.map((item, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs font-medium text-green-600">{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{item.title}</p>
                          <p className="text-sm text-gray-600">{item.description}</p>
                        </div>
                      </div>
                    ))}

                    {topic.relatedArticles.length > 0 && (
                      <div className="pt-4 border-t border-gray-100">
                        <p className="text-sm text-gray-500 mb-2">Related articles:</p>
                        <div className="flex flex-wrap gap-2">
                          {topic.relatedArticles.map((articleId) => (
                            <Link
                              key={articleId}
                              to={`/venue/support/articles/${articleId}`}
                              className="text-sm text-purple-600 hover:text-purple-700"
                            >
                              View article →
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
