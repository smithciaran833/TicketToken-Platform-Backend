import { Link } from "react-router-dom";
import { Ticket } from "lucide-react";
import { Button } from "../../components/ui";

export default function Welcome() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-600 to-purple-800 flex flex-col items-center justify-center px-6">
      <div className="text-center text-white mb-12">
        <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Ticket className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold mb-3">TicketToken</h1>
        <p className="text-purple-200 text-lg">Discover live events</p>
        <p className="text-purple-200">Buy, sell, and transfer tickets</p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Link to="/signup" className="block">
          <Button className="w-full bg-white text-purple-600 hover:bg-gray-100">
            Create Account
          </Button>
        </Link>
        <Link to="/login" className="block">
          <Button variant="secondary" className="w-full border-white/30 text-white hover:bg-white/10">
            Log In
          </Button>
        </Link>
        <Link 
          to="/" 
          className="block text-center text-purple-200 hover:text-white py-2 text-sm"
        >
          Continue as Guest
        </Link>
      </div>
    </div>
  );
}
