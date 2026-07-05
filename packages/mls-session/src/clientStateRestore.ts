import {
  defaultAuthenticationService,
  defaultKeyPackageEqualityConfig,
  defaultKeyRetentionConfig,
  defaultLifetimeConfig,
  defaultPaddingConfig,
  type ClientConfig,
  type ClientState,
} from "ts-mls";

const restoredClientConfig: ClientConfig = {
  keyRetentionConfig: defaultKeyRetentionConfig,
  lifetimeConfig: defaultLifetimeConfig,
  keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,
  paddingConfig: defaultPaddingConfig,
  authService: defaultAuthenticationService,
};

/** decodeGroupState omits runtime-only fields; restore them before commits/joins. */
export function hydrateClientState(state: ClientState): ClientState {
  if (!state.clientConfig?.keyPackageEqualityConfig) {
    state.clientConfig = restoredClientConfig;
  }
  return state;
}
