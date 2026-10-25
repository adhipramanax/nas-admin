import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Bot, Boxes, FolderKanban, LayoutDashboard, LogOut, Menu, Network, Server, Settings, X } from 'lucide-react';
import AgentPanel from './AgentPanel.jsx';
import { cx } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Project', icon: FolderKanban },
  { to: '/containers', label: 'Container', icon: Boxes },
  { to: '/ports', label: 'Port', icon: Network },
  { to: '/settings', label: 'Pengaturan', icon: Settings },
];

export default function Layout({ user, onLogout }) {
  const [nav, setNav] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Sidebar */}
      <aside className={cx('fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-800 bg-slate-950 transition-transform lg:translate-x-0', nav ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400"><Server className="h-4 w-4" /></div>
          <div>
            <div className="font-semibold text-white">NAS Admin</div>
            <div className="text-xs text-slate-500">TrueNAS SCALE</div>
          </div>
          <button className="btn-ghost ml-auto p-1 lg:hidden" onClick={() => setNav(false)}><X className="h-4 w-4" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setNav(false)}
              className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-slate-800/80 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200')}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
          <button onClick={() => { setAgentOpen(true); setNav(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10">
            <Bot className="h-4 w-4" /> NAS Assistant
          </button>
        </nav>
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <span className="truncate text-sm text-slate-400">{user.username}</span>
            <button className="btn-ghost p-1.5" title="Keluar" onClick={onLogout}><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      {nav && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={() => setNav(false)} />}

      {/* Topbar mobile */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <button className="btn-ghost p-1.5" onClick={() => setNav(true)}><Menu className="h-5 w-5" /></button>
        <span className="font-semibold text-white">NAS Admin</span>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet context={{ refreshKey, openAgent: () => setAgentOpen(true) }} />
      </main>

      {!agentOpen && (
        <button onClick={() => setAgentOpen(true)} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-900/50 hover:bg-emerald-500">
          <Bot className="h-5 w-5" /> <span className="hidden sm:inline">Tanya AI</span>
        </button>
      )}
      <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} messages={messages} setMessages={setMessages} onDataChanged={() => setRefreshKey((k) => k + 1)} />
    </div>
  );
}
