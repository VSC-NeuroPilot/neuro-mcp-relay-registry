// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

//import starlightVersions from "starlight-versions";
import starlightUtils from "@lorenzo_lewis/starlight-utils";
import starlightHeadingBadges from "starlight-heading-badges";
import starlightAutoDrafts from "starlight-auto-drafts";
import starlightAutoSidebar from "starlight-auto-sidebar";
import starlightScrollToTop from "starlight-scroll-to-top";
//import starlightShowLatestVersion from 'starlight-plugin-show-latest-version';

import mdx from "@astrojs/mdx";

import preact from "@astrojs/preact";

// https://astro.build/config
export default defineConfig({
  site: "https://vsc-neuropilot.github.io",
  base: "/neuro-mcp-relay-registry",
  integrations: [
    starlight({
      title: "Neuro MCP Relay Registry",
      plugins: [
        /*starlightVersions({
          current: {
            label: "Latest",
          },
          versions: [],
        }),*/
        starlightUtils({
          navLinks: { leading: { useSidebarLabelled: "navLinks" } },
        }),
        starlightAutoDrafts(),
        starlightAutoSidebar(),
        starlightHeadingBadges(),
        starlightScrollToTop(),
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/VSC-NeuroPilot/neuro-mcp-relay-registry",
        },
        {
          icon: "seti:docker",
          label: "Docker image",
          href: "https://hub.docker.com/r/ktrain5369/neuro-mcp-relay-registry",
        },
      ],
      customCss: ["./src/styles/theme.css"],
      sidebar: [
        {
          label: "Guides",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Example Guide", slug: "guides/example" },
          ],
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
        {
          label: "navLinks", // THESE ARE USED FOR NAVLINKS
          items: [
            {
              label: "Issues",
              link: "https://github.com/VSC-NeuroPilot/neuro-mcp-relay-registry/issues",
            },
            {
              label: "Discussions",
              link: "https://github.com/VSC-NeuroPilot/neuro-mcp-relay-registry/discussions",
            },
            {
              label: "NeuroPilot",
              link: "https://vsc-neuropilot.github.io/docs",
            },
            {
              label: "NeuroMCP",
              link: "https://github.com/ECHO-HELLO-WORLD424/NeuroMCP",
            },
          ],
        },
      ],
    }),
    mdx(),
    preact(),
  ],
});
