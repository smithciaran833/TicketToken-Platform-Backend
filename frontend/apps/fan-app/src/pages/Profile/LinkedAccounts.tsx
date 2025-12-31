import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft} from "lucide-react";

interface LinkedAccount {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  email?: string;
}

const initialAccounts: LinkedAccount[] = [
  { id: "google", name: "Google", icon: "G", connected: true, email: "john@gmail.com" },
  { id: "apple", name: "Apple", icon: "", connected: false },
  { id: "facebook", name: "Facebook", icon: "f", connected: false },
];

export default function LinkedAccounts() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState(initialAccounts);

  const handleToggle = async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    if (account.connected) {
      if (confirm(`Disconnect ${account.name}?`)) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === accountId ? { ...a, connected: false, email: undefined } : a
          )
        );
      }
    } else {
      // Simulate OAuth flow
      await new Promise((resolve) => setTimeout(resolve, 500));
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? { ...a, connected: true, email: `user@${accountId}.com` }
            : a
        )
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Linked Accounts</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        <p className="text-gray-500 mb-6">
          Connect accounts to enable one-click sign in
        </p>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-4 px-5 py-4"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  account.id === "google"
                    ? "bg-red-500"
                    : account.id === "apple"
                    ? "bg-black"
                    : "bg-blue-600"
                }`}
              >
                {account.icon || ""}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{account.name}</p>
                {account.connected && account.email && (
                  <p className="text-sm text-gray-500">{account.email}</p>
                )}
              </div>
              <button
                onClick={() => handleToggle(account.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  account.connected
                    ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                }`}
              >
                {account.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
