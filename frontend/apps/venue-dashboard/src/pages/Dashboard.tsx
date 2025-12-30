import { TrendingUp, Ticket, Calendar, ShoppingCart } from 'lucide-react';

const stats = [
  { name: 'Total Revenue', value: '$45,678', change: '+12.5%', icon: TrendingUp },
  { name: 'Tickets Sold', value: '1,234', change: '+8.2%', icon: Ticket },
  { name: 'Upcoming Events', value: '8', change: '+2', icon: Calendar },
  { name: 'Active Listings', value: '23', change: '+5', icon: ShoppingCart },
];

const recentActivity = [
  { id: 1, text: 'New ticket purchase for Summer Music Festival', time: '2 minutes ago' },
  { id: 2, text: 'Event "Jazz Night" published', time: '1 hour ago' },
  { id: 3, text: 'Refund processed for Order #1234', time: '3 hours ago' },
  { id: 4, text: 'New team member added: Sarah Johnson', time: '5 hours ago' },
];

export default function Dashboard() {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, John!</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <stat.icon className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <p className="text-sm text-green-600 mt-2">{stat.change} from last month</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {recentActivity.map((activity) => (
            <div key={activity.id} className="px-6 py-4 flex items-center gap-4">
              <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">{activity.text}</p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
