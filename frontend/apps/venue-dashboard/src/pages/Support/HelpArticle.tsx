import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock, ThumbsUp, ThumbsDown, ChevronRight, MessageCircle } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const article = {
  id: 1,
  title: "How to create your first event",
  category: "Getting Started",
  lastUpdated: "January 10, 2025",
  readTime: "5 min read",
  content: `
    <h2>Overview</h2>
    <p>Creating an event on TicketToken is simple and straightforward. This guide will walk you through each step of the process, from initial setup to publishing your event.</p>
    
    <h2>Step 1: Navigate to Events</h2>
    <p>From your dashboard, click on "Events" in the sidebar navigation. Then click the "Create Event" button in the top right corner.</p>
    
    <h2>Step 2: Enter Event Details</h2>
    <p>Fill in the basic information about your event:</p>
    <ul>
      <li><strong>Event Name:</strong> Choose a clear, descriptive title</li>
      <li><strong>Date & Time:</strong> Set when your event starts and ends</li>
      <li><strong>Description:</strong> Provide details about what attendees can expect</li>
      <li><strong>Category:</strong> Select the type of event (concert, conference, etc.)</li>
    </ul>
    
    <h2>Step 3: Add Ticket Types</h2>
    <p>Create one or more ticket types for your event. For each ticket type, you'll specify:</p>
    <ul>
      <li>Ticket name (e.g., "General Admission", "VIP")</li>
      <li>Price</li>
      <li>Quantity available</li>
      <li>Sale start and end dates</li>
    </ul>
    
    <h2>Step 4: Configure Settings</h2>
    <p>Review your event settings including refund policy, age restrictions, and any special requirements.</p>
    
    <h2>Step 5: Preview and Publish</h2>
    <p>Use the preview feature to see how your event will appear to buyers. When you're satisfied, click "Publish" to make your event live.</p>
    
    <h2>Tips for Success</h2>
    <ul>
      <li>Add high-quality images to attract more buyers</li>
      <li>Write a compelling description that highlights what makes your event special</li>
      <li>Consider early bird pricing to drive initial sales</li>
      <li>Share your event link on social media</li>
    </ul>
  `,
  relatedArticles: [
    { id: 2, title: "Setting up ticket types and pricing" },
    { id: 7, title: "Creating promo codes and discounts" },
    { id: 5, title: "Understanding your analytics dashboard" },
  ],
  tableOfContents: [
    "Overview",
    "Step 1: Navigate to Events",
    "Step 2: Enter Event Details",
    "Step 3: Add Ticket Types",
    "Step 4: Configure Settings",
    "Step 5: Preview and Publish",
    "Tips for Success",
  ],
};

export default function HelpArticle() {
  const { id } = useParams();
  const toast = useToast();
  const [feedback, setFeedback] = useState<"helpful" | "not-helpful" | null>(null);

  const handleFeedback = (type: "helpful" | "not-helpful") => {
    setFeedback(type);
    toast.success("Thanks for your feedback!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/venue/support" className="hover:text-purple-600">Help Center</Link>
        <ChevronRight className="w-4 h-4" />
        <Link to="/venue/support" className="hover:text-purple-600">{article.category}</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{article.title}</span>
      </div>

      <div className="grid grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="col-span-3">
          <article className="bg-white rounded-lg border border-gray-200 p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{article.title}</h1>
            
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 pb-8 border-b border-gray-200">
              <span className="text-purple-600 font-medium">{article.category}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {article.readTime}
              </div>
              <span>•</span>
              <span>Updated {article.lastUpdated}</span>
            </div>

            <div 
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />

            {/* Feedback */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <p className="text-gray-700 mb-4">Was this article helpful?</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleFeedback("helpful")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    feedback === "helpful" 
                      ? "border-green-500 bg-green-50 text-green-700" 
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  Yes
                </button>
                <button
                  onClick={() => handleFeedback("not-helpful")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                    feedback === "not-helpful" 
                      ? "border-red-500 bg-red-50 text-red-700" 
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  No
                </button>
              </div>
            </div>
          </article>

          {/* Related Articles */}
          <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Related Articles</h2>
            <div className="space-y-3">
              {article.relatedArticles.map((related) => (
                <Link
                  key={related.id}
                  to={`/venue/support/articles/${related.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
                >
                  <span className="text-gray-700">{related.title}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>

          {/* Still Need Help */}
          <div className="mt-6 bg-purple-50 rounded-lg border border-purple-200 p-6">
            <div className="flex items-center gap-4">
              <MessageCircle className="w-8 h-8 text-purple-600" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Still need help?</h3>
                <p className="text-sm text-gray-600">Our support team is ready to assist you</p>
              </div>
              <Link to="/venue/support/contact">
                <Button>Contact Support</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Sidebar - Table of Contents */}
        <div className="col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
            <h3 className="font-semibold text-gray-900 mb-3">On this page</h3>
            <nav className="space-y-2">
              {article.tableOfContents.map((item, index) => (
                
                  key={index}
                  href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
                  className="block text-sm text-gray-600 hover:text-purple-600"
                >
                  {item}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
