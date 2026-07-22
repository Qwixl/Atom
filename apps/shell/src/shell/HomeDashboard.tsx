import {
  PanelCarousel,
  PanelCarouselCard,
  PanelSectionHeader,
} from "./PanelChrome.js";
import type { ShellNavPanel } from "./ShellSidebar.js";

type StatCard = {
  label: string;
  value: string;
  detail: string;
  panel: ShellNavPanel;
};

const STAT_CARDS: StatCard[] = [
  { label: "Inbox", value: "12", detail: "3 unread", panel: "comms" },
  { label: "Tasks", value: "5", detail: "2 due today", panel: "tasks" },
  { label: "Events", value: "3", detail: "Next in 2h", panel: "calendar" },
  { label: "Balance", value: "$24.50", detail: "Agent spend", panel: "profile" },
];

const ACTIVITY_PLACEHOLDER = [
  { time: "10:42", text: "Agent summarized your inbox and flagged 2 items for review." },
  { time: "09:15", text: "Standing intent ran: daily briefing draft ready." },
  { time: "Yesterday", text: "Calendar connector synced 4 upcoming events." },
];

const SCHEDULE_PLACEHOLDER = [
  { time: "2:00 PM", title: "Team standup", meta: "30 min · Video" },
  { time: "4:30 PM", title: "Design review", meta: "1 hr · Room B" },
  { time: "Tomorrow", title: "Quarterly planning", meta: "All day" },
];

const QUICK_ACTIONS: Array<{
  label: string;
  description: string;
  panel: ShellNavPanel;
  icon: string;
}> = [
  { label: "New chat", description: "Direct your agent", panel: "none", icon: "◆" },
  { label: "Inbox", description: "Messages & contacts", panel: "comms", icon: "✉" },
  { label: "Discover", description: "Agents & communities", panel: "discover", icon: "◎" },
  { label: "Rooms", description: "Join a space", panel: "rooms", icon: "▣" },
  { label: "Calendar", description: "Upcoming events", panel: "calendar", icon: "◷" },
];

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type HomeDashboardProps = {
  onOpenChat?: () => void;
  onNavigate?: (panel: ShellNavPanel) => void;
};

export function HomeDashboard({ onOpenChat, onNavigate }: HomeDashboardProps) {
  const greeting = greetingForHour(new Date().getHours());

  function go(panel: ShellNavPanel) {
    if (panel === "none") {
      onOpenChat?.();
      return;
    }
    onNavigate?.(panel);
  }

  return (
    <div className="home-dashboard shell-panel-view shell-panel-view--inset">
      <div className="home-dashboard-inner">
        <PanelSectionHeader
          eyebrow={greeting}
          title="Home"
          subtitle="Your agent activity at a glance — jump into a section or start a new intent."
          actions={
            onOpenChat ? (
              <button type="button" className="atom-btn atom-btn-primary" onClick={onOpenChat}>
                Open chat
              </button>
            ) : null
          }
        />

        <PanelCarousel label="Quick actions" className="home-dashboard-quick">
          {QUICK_ACTIONS.map((action) => (
            <PanelCarouselCard
              key={action.label}
              title={action.label}
              description={action.description}
              icon={action.icon}
              onClick={() => go(action.panel)}
            />
          ))}
        </PanelCarousel>

        <div className="home-dashboard-stats" role="list">
          {STAT_CARDS.map((card) => (
            <button
              key={card.label}
              type="button"
              className="home-stat-card home-stat-card--action"
              role="listitem"
              onClick={() => go(card.panel)}
            >
              <span className="home-stat-card-label">{card.label}</span>
              <span className="home-stat-card-value">{card.value}</span>
              <span className="home-stat-card-detail">{card.detail}</span>
            </button>
          ))}
        </div>

        <div className="home-dashboard-layout">
          <section className="panel-inset-section" aria-labelledby="home-activity-heading">
            <div className="panel-inset-section-head">
              <h2 id="home-activity-heading" className="panel-inset-section-title">
                Agent activity
              </h2>
            </div>
            <div className="panel-inset-section-body">
              <ul className="home-activity-list">
                {ACTIVITY_PLACEHOLDER.map((item) => (
                  <li key={`${item.time}-${item.text}`} className="home-activity-item">
                    <time className="home-activity-time">{item.time}</time>
                    <p className="home-activity-text">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="panel-inset-section" aria-labelledby="home-schedule-heading">
            <div className="panel-inset-section-head">
              <h2 id="home-schedule-heading" className="panel-inset-section-title">
                Upcoming schedule
              </h2>
            </div>
            <div className="panel-inset-section-body">
              <ul className="home-schedule-list">
                {SCHEDULE_PLACEHOLDER.map((item) => (
                  <li key={`${item.time}-${item.title}`} className="home-schedule-item">
                    <time className="home-schedule-time">{item.time}</time>
                    <div className="home-schedule-body">
                      <span className="home-schedule-title">{item.title}</span>
                      <span className="home-schedule-meta">{item.meta}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
