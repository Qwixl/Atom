import type { Composition } from "@qwixl/shell-core";

export type CompositionExample = {
  id: string;
  label: string;
  description: string;
  composition: Composition;
};

export const COMPOSITION_EXAMPLES: CompositionExample[] = [
  {
    id: "starter",
    label: "Starter card",
    description: "Minimal core/card + core/text",
    composition: {
      version: 1,
      surfaceId: "playground",
      intent: "Starter",
      root: {
        id: "root",
        component: "core/card",
        props: { title: "Playground", subtitle: "Edit JSON or pick an example" },
        children: [
          {
            id: "text",
            component: "core/text",
            props: { text: "Change this composition and click Render." },
          },
        ],
      },
    },
  },
  {
    id: "schedule",
    label: "Schedule timeline",
    description: "D055 primitive composition — core/card + nested core/stack",
    composition: {
      version: 1,
      surfaceId: "schedule-today",
      intent: "Today's calendar events",
      root: {
        id: "schedule-card",
        component: "core/card",
        semanticRole: "container/card",
        props: { title: "Today", subtitle: "Tue, Jul 8" },
        children: [
          {
            id: "schedule-events",
            component: "core/stack",
            semanticRole: "container/stack",
            props: { direction: "vertical" },
            children: [
              {
                id: "event-1",
                component: "core/stack",
                props: { direction: "horizontal" },
                children: [
                  { id: "event-1-time", component: "core/text", props: { text: "9:00 AM" } },
                  {
                    id: "event-1-body",
                    component: "core/stack",
                    props: { direction: "vertical" },
                    children: [
                      {
                        id: "event-1-title",
                        component: "core/heading",
                        props: { text: "Team standup", level: 3 },
                      },
                      {
                        id: "event-1-span",
                        component: "core/text",
                        props: { text: "9:00 AM – 9:30 AM" },
                      },
                    ],
                  },
                ],
              },
              {
                id: "event-2",
                component: "core/stack",
                props: { direction: "horizontal" },
                children: [
                  { id: "event-2-time", component: "core/text", props: { text: "2:00 PM" } },
                  {
                    id: "event-2-body",
                    component: "core/stack",
                    props: { direction: "vertical" },
                    children: [
                      {
                        id: "event-2-title",
                        component: "core/heading",
                        props: { text: "Reminder", level: 3 },
                      },
                      {
                        id: "event-2-span",
                        component: "core/text",
                        props: { text: "2:00 PM – 3:00 PM" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  },
  {
    id: "form",
    label: "Preference form",
    description: "core/form with scoped core/choice fields",
    composition: {
      version: 1,
      surfaceId: "prefs",
      intent: "Gather preferences",
      root: {
        id: "form-card",
        component: "core/card",
        props: { title: "Trip preferences" },
        children: [
          {
            id: "form",
            component: "core/form",
            semanticRole: "input/form",
            events: ["submitted"],
            props: { submitLabel: "Save" },
            children: [
              {
                id: "seat",
                component: "core/choice",
                props: {
                  name: "seat",
                  label: "Seat preference",
                  options: [
                    { id: "window", label: "Window", recommended: true },
                    { id: "aisle", label: "Aisle" },
                  ],
                },
              },
              {
                id: "notes",
                component: "core/text-field",
                props: { name: "notes", label: "Notes", placeholder: "Optional" },
              },
            ],
          },
        ],
      },
    },
  },
];

export function compositionToJson(composition: Composition): string {
  return JSON.stringify(composition, null, 2);
}
