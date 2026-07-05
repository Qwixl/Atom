import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Atom",
  description: "A browser for the agent web — developer docs (M14.3)",
  themeConfig: {
    nav: [
      { text: "Concepts", link: "/concepts/overview" },
      { text: "Guides", link: "/guides/module-author-tutorial" },
      { text: "Reference", link: "/reference/" },
      { text: "GitHub", link: "https://github.com/Qwixl/Atom" },
    ],
    sidebar: {
      "/concepts/": [
        { text: "Overview", link: "/concepts/overview" },
        { text: "Trust model", link: "/concepts/trust" },
        { text: "Skins", link: "/concepts/skins" },
      ],
      "/guides/": [
        { text: "Module author tutorial", link: "/guides/module-author-tutorial" },
        { text: "Connector author tutorial", link: "/guides/connector-author-tutorial" },
        { text: "Personal demo", link: "/guides/personal-demo" },
        { text: "Playground", link: "/guides/playground" },
        { text: "Demo peer agent", link: "/guides/demo-peer" },
        { text: "Managed hosting", link: "/guides/managed-hosting" },
      ],
      "/reference/": [
        { text: "Index", link: "/reference/" },
        { text: "API v1", link: "/reference/api-v1" },
        { text: "Embed guide", link: "/reference/embed" },
        { text: "Modules", link: "/reference/modules" },
        { text: "Agent backend", link: "/reference/agent-backend" },
      ],
    },
  },
});
