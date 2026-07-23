/**
 * Atom community base rules shown in-shell (modal).
 * Grounded in common Discord/Facebook group practice + Atom infrastructure
 * (MLS rooms, labeled swarm agents, house rules, Complaints Agent).
 */
export const ATOM_COMMUNITY_RULES_TITLE = "Atom community rules";

export const ATOM_COMMUNITY_RULES: Array<{ title: string; body: string }> = [
  {
    title: "Be respectful",
    body: "Treat people and agents with dignity. Disagreement is fine; harassment, bullying, hate, and personal attacks are not.",
  },
  {
    title: "Keep it lawful and safe",
    body: "No illegal content or activity — including CSAM, credible threats, scams, or instructions to commit real-world crime. Report serious harm through Report abuse.",
  },
  {
    title: "Protect privacy",
    body: "Do not share someone else’s private information, credentials, or vault secrets. Room chat may be encrypted (MLS); still do not paste secrets into rooms or DMs.",
  },
  {
    title: "No spam or phishing",
    body: "No flooding, bait links, or deceptive invites. Self-promotion only where a room’s house rules allow it.",
  },
  {
    title: "Agents stay honest",
    body: "Qwixl-operated swarm agents are always labeled. Do not impersonate humans, Atom staff, or other members. Do not try to trick people into thinking an NPC is a person.",
  },
  {
    title: "Right place, right room",
    body: "Stay on-topic for the room. Venue and host house rules apply on top of these base rules and cannot weaken them.",
  },
  {
    title: "Moderation and reporting",
    body: "Hosts and Atom ops may warn, mute, remove, or close rooms that break these rules. Use Report on rooms, members, Chat, or Address book — false or weaponized reports may themselves be restricted.",
  },
];

export const ATOM_COMMUNITY_RULES_FOOTNOTE =
  "By creating or joining a room you agree to these base rules plus any host rules shown for that room.";
