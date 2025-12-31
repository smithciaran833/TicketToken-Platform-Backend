import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Type, Volume2, Eye, Hand } from "lucide-react";

export default function AccessibilitySettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    largeText: false,
    highContrast: false,
    reduceMotion: false,
    screenReader: false,
    hapticFeedback: true,
    autoplayVideos: true,
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const accessibilityOptions = [
    {
      key: "largeText" as const,
      icon: Type,
      label: "Large Text",
      description: "Increase text size throughout the app",
    },
    {
      key: "highContrast" as const,
      icon: Eye,
      label: "High Contrast",
      description: "Increase color contrast for better visibility",
    },
    {
      key: "reduceMotion" as const,
      icon: Hand,
      label: "Reduce Motion",
      description: "Minimize animations and transitions",
    },
    {
      key: "screenReader" as const,
      icon: Volume2,
      label: "Screen Reader Support",
      description: "Optimize for screen reader usage",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Accessibility</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Visual */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Visual
          </h2>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {accessibilityOptions.map((option) => {
              const Icon = option.icon;
              return (
                <div
                  key={option.key}
                  className="flex items-center justify-between px-5 py-4"
                >
                  <div className="flex items-center gap-4">
                    <Icon className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{option.label}</p>
                      <p className="text-sm text-gray-500">{option.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSetting(option.key)}
                    className={`relative w-12 h-7 rounded-full transition-colors ${
                      settings[option.key] ? "bg-purple-600" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        settings[option.key] ? "right-1" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Interaction */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Interaction
          </h2>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium text-gray-900">Haptic Feedback</p>
                <p className="text-sm text-gray-500">Vibration on button presses</p>
              </div>
              <button
                onClick={() => toggleSetting("hapticFeedback")}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  settings.hapticFeedback ? "bg-purple-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.hapticFeedback ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="font-medium text-gray-900">Autoplay Videos</p>
                <p className="text-sm text-gray-500">Automatically play video content</p>
              </div>
              <button
                onClick={() => toggleSetting("autoplayVideos")}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  settings.autoplayVideos ? "bg-purple-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.autoplayVideos ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Note */}
        <p className="text-sm text-gray-500 text-center">
          Some settings may also be controlled by your device's accessibility settings.
        </p>
      </div>
    </div>
  );
}
