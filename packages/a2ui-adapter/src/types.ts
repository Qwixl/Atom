import type { JsonObject, JsonValue } from "@qwixl/shell-core";

/** Raw A2UI component object from updateComponents.components[]. */
export type A2uiComponentRecord = JsonObject & {
  id: string;
  component: string;
};

export interface A2uiCreateSurface {
  surfaceId: string;
  catalogId?: string;
  sendDataModel?: boolean;
  intent?: string;
}

export interface A2uiUpdateComponents {
  surfaceId: string;
  components: A2uiComponentRecord[];
}

export interface A2uiUpdateDataModel {
  surfaceId: string;
  path?: string;
  value?: JsonValue;
}

export interface A2uiDeleteSurface {
  surfaceId: string;
}

export type A2uiEnvelope = {
  version?: string;
  createSurface?: A2uiCreateSurface;
  updateComponents?: A2uiUpdateComponents;
  updateDataModel?: A2uiUpdateDataModel;
  deleteSurface?: A2uiDeleteSurface;
};

export interface A2uiSurfaceState {
  surfaceId: string;
  catalogId?: string;
  intent?: string;
  components: Map<string, A2uiComponentRecord>;
  dataModel: JsonObject;
}
