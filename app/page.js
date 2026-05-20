import DashboardTab from '@/components/DashboardTab';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 pb-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🎲</span>
          <h1 className="text-lg font-bold text-gray-800">烏嘎嘎記帳</h1>
        </div>
        <DashboardTab />
      </div>
    </main>
  );
}
