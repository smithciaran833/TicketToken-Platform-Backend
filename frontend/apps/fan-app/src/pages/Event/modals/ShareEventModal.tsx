import { X, Link, MessageCircle, Mail, Twitter, Facebook,  Check } from "lucide-react";
import { useState } from "react";

interface ShareEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: {
    title: string;
    date: string;
    venue: string;
    url?: string;
  };
}

const shareOptions = [
  { name: "Copy Link", icon: Link, action: "copy" },
  { name: "Messages", icon: MessageCircle, action: "sms" },
  { name: "Email", icon: Mail, action: "email" },
  { name: "Twitter", icon: Twitter, action: "twitter" },
  { name: "Facebook", icon: Facebook, action: "facebook" },
];

export default function ShareEventModal({ isOpen, onClose, event }: ShareEventModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const eventUrl = event.url || `https://tickettoken.com/event/${encodeURIComponent(event.title)}`;
  const shareText = `Check out ${event.title} at ${event.venue} on ${event.date}!`;

  const handleShare = async (action: string) => {
    switch (action) {
      case "copy":
        await navigator.clipboard.writeText(eventUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        break;
      case "sms":
        window.open(`sms:?body=${encodeURIComponent(shareText + " " + eventUrl)}`);
        break;
      case "email":
        window.open(`mailto:?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(shareText + "\n\n" + eventUrl)}`);
        break;
      case "twitter":
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(eventUrl)}`);
        break;
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(eventUrl)}`);
        break;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Share Event</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5">
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-gray-900">{event.title}</h3>
            <p className="text-sm text-gray-500 mt-1">{event.date}</p>
            <p className="text-sm text-gray-500">{event.venue}</p>
          </div>

          <div className="grid grid-cols-5 gap-4">
            {shareOptions.map((option) => {
              const Icon = option.icon;
              const isCopyOption = option.action === "copy";
              return (
                <button
                  key={option.name}
                  onClick={() => handleShare(option.action)}
                  className="flex flex-col items-center gap-2"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                    isCopyOption && copied
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                    {isCopyOption && copied ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-xs text-gray-600">
                    {isCopyOption && copied ? "Copied!" : option.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
              <input
                type="text"
                value={eventUrl}
                readOnly
                className="flex-1 bg-transparent text-sm text-gray-600 outline-none truncate"
              />
              <button
                onClick={() => handleShare("copy")}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
