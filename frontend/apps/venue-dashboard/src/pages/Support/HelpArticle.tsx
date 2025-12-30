import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ThumbsUp, ThumbsDown, ChevronRight, MessageCircle } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const article = {
  id: 1,
  title: "How to create your first event",
  category: "Getting Started",
  lastUpdated: "January 10, 2025",
  readTime: "5 min read",
  content: "<h2>Overview</h2><p>Creating an event on TicketToken is simple.</p>",
  relatedArticles: [
    { id: 2, title: "Setting up ticket types and pricing" },
  ],
  tableOfContents: ["Overview", "Step 1", "Step 2"],
};

export default function HelpArticle() {
  const { id: _id } = useParams();
  const toast = useToast();
  const [_feedback, setFeedback] = useState<"helpful" | "not-helpful" | null>(null);

  const handleFeedback = (type: "helpful" | "not-helpful") => {
    setFeedback(type);
    toast.success("Thanks for your feedback!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/venue/support" className="hover:text-purple-600">Help Center</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900">{article.title}</span>
      </div>
      <div className="grid grid-cols-4 gap-8">
        <div className="col-span-3">
          <article className="bg-white rounded-lg border border-gray-200 p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{article.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 pb-8 border-b border-gray-200">
              <span className="text-purple-600 font-medium">{article.category}</span>
              <span>Updated {article.lastUpdated}</span>
            </div>
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: article.content }} />
            <div className="mt-8 pt-8 border-t border-gray-200">
              <p className="text-gray-700 mb-4">Was this article helpful?</p>
              <div className="flex items-center gap-3">
                <button onClick={() => handleFeedback("helpful")} className="flex items-center gap-2 px-4 py-2 rounded-lg border">
                  <ThumbsUp className="w-4 h-4" />Yes
                </button>
                <button onClick={() => handleFeedback("not-helpful")} className="flex items-center gap-2 px-4 py-2 rounded-lg border">
                  <ThumbsDown className="w-4 h-4" />No
                </button>
              </div>
            </div>
          </article>
          <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Related Articles</h2>
            <div className="space-y-3">
              {article.relatedArticles.map((related) => (
                <Link key={related.id} to={"/venue/support/articles/" + related.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50">
                  <span className="text-gray-700">{related.title}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-6 bg-purple-50 rounded-lg border border-purple-200 p-6">
            <div className="flex items-center gap-4">
              <MessageCircle className="w-8 h-8 text-purple-600" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Still need help?</h3>
                <p className="text-sm text-gray-600">Our support team is ready to assist you</p>
              </div>
              <Link to="/venue/support/contact"><Button>Contact Support</Button></Link>
            </div>
          </div>
        </div>
        <div className="col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
            <h3 className="font-semibold text-gray-900 mb-3">On this page</h3>
            <nav className="space-y-2">
              {article.tableOfContents.map((item, idx) => (
                <a key={idx} href="#overview" className="block text-sm text-gray-600 hover:text-purple-600">{item}</a>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
