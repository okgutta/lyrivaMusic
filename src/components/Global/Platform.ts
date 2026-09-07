import Whentil from "../../modules/Whentil.ts";

// Spotify Types
type TokenProviderResponse = {
  accessToken: string;
  expiresAtTime: number;
  tokenType: "Bearer";
};

// Store all our Spotify Services
const Spotify: typeof Spicetify = (globalThis as any).Spicetify;
let SpotifyPlatform: typeof Spicetify.Platform;
let SpotifyInternalFetch: typeof Spicetify.CosmosAsync;

// Spotify Ready Promise — waits (16ms polling via Whentil) until both services
// exist. The previous rAF + setTimeout(0) chain is replaced by Whentil, which
// also swallows transient getter throws and keeps polling.
const OnSpotifyReady = new Promise<void>((resolve) => {
  Whentil.When(
    () => Spotify.Platform && Spotify.CosmosAsync,
    () => {
      SpotifyPlatform = Spotify.Platform;
      SpotifyInternalFetch = Spotify.CosmosAsync;
      resolve();
    }
  );
});

// Get Spotify Access Token Function
let tokenProviderResponse: TokenProviderResponse | undefined;
let accessTokenPromise: Promise<string> | undefined;

const GetSpotifyAccessToken = (): Promise<string> => {
  if (accessTokenPromise) return accessTokenPromise;

  accessTokenPromise = (async () => {
    // Reuse the current token while it still has life left.
    // 60s 缓冲：只留 2ms 会取到临近过期的 token，边界时刻偶发 401
    const cached = tokenProviderResponse;
    if (cached && cached.expiresAtTime - Date.now() > 60_000) {
      return cached.accessToken;
    }

    tokenProviderResponse = undefined;

    try {
      tokenProviderResponse = await SpotifyInternalFetch.get("sp://oauth/v2/token");
    } catch (error) {
      // "Resolver not found" means the Cosmos endpoint is unavailable — fall
      // back to the Session access token when Spotify exposes one.
      if (!(error instanceof Error) || !error.message.includes("Resolver not found")) {
        throw error;
      }
      if (!SpotifyPlatform.Session) {
        console.warn("Failed to find SpotifyPlatform.Session for fetching token");
        throw error;
      }
      tokenProviderResponse = {
        accessToken: SpotifyPlatform.Session.accessToken,
        expiresAtTime: SpotifyPlatform.Session.accessTokenExpirationTimestampMs,
        tokenType: "Bearer",
      };
    }

    const response = tokenProviderResponse;
    if (!response) {
      throw new Error("Spotify token provider returned no access token");
    }
    return response.accessToken;
  })().finally(() => {
    accessTokenPromise = undefined;
  });

  return accessTokenPromise;
};

const Platform = {
  OnSpotifyReady,
  GetSpotifyAccessToken,
  get SpotifyVersion(): number[] {
    return Spicetify.Platform.version.split(".").map((i: string) => Number.parseInt(i, 10));
  },
};

export default Platform;
