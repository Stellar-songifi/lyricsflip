import { useUIStore } from "./ui-store";

const resetStore = () => {
  useUIStore.setState({
    activeModal: null,
    modalPayload: null,
    theme: "light",
    usernameDraft: "",
  });
};

describe("ui-store", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("modal slice", () => {
    it("starts with no active modal", () => {
      const state = useUIStore.getState();
      expect(state.activeModal).toBeNull();
      expect(state.modalPayload).toBeNull();
    });

    it("opens a modal with an optional payload", () => {
      useUIStore.getState().openModal("settings", { tab: "audio" });
      const state = useUIStore.getState();
      expect(state.activeModal).toBe("settings");
      expect(state.modalPayload).toEqual({ tab: "audio" });
    });

    it("opens a modal without a payload", () => {
      useUIStore.getState().openModal("help");
      const state = useUIStore.getState();
      expect(state.activeModal).toBe("help");
      expect(state.modalPayload).toBeNull();
    });

    it("closes the active modal and clears the payload", () => {
      useUIStore.getState().openModal("settings", { tab: "audio" });
      useUIStore.getState().closeModal();
      const state = useUIStore.getState();
      expect(state.activeModal).toBeNull();
      expect(state.modalPayload).toBeNull();
    });
  });

  describe("theme slice", () => {
    it("defaults to light theme", () => {
      expect(useUIStore.getState().theme).toBe("light");
    });

    it("toggles between light and dark", () => {
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe("dark");
      useUIStore.getState().toggleTheme();
      expect(useUIStore.getState().theme).toBe("light");
    });

    it("sets an explicit theme", () => {
      useUIStore.getState().setTheme("dark");
      expect(useUIStore.getState().theme).toBe("dark");
      useUIStore.getState().setTheme("light");
      expect(useUIStore.getState().theme).toBe("light");
    });
  });

  describe("profile slice", () => {
    it("starts with an empty username draft", () => {
      expect(useUIStore.getState().usernameDraft).toBe("");
    });

    it("updates the username draft", () => {
      useUIStore.getState().setUsernameDraft("alice");
      expect(useUIStore.getState().usernameDraft).toBe("alice");
    });

    it("clears the username draft", () => {
      useUIStore.getState().setUsernameDraft("alice");
      useUIStore.getState().clearUsernameDraft();
      expect(useUIStore.getState().usernameDraft).toBe("");
    });
  });

  describe("persistence", () => {
    it("persists only preferences (theme and username draft)", () => {
      useUIStore.getState().setTheme("dark");
      useUIStore.getState().setUsernameDraft("alice");
      useUIStore.getState().openModal("settings", { tab: "audio" });

      const persisted = JSON.parse(
        localStorage.getItem("lyricsflip-ui-store") ?? "{}",
      );

      expect(persisted.state).toEqual({
        theme: "dark",
        usernameDraft: "alice",
      });
      expect(persisted.state).not.toHaveProperty("activeModal");
      expect(persisted.state).not.toHaveProperty("modalPayload");
    });
  });

  describe("store boundaries", () => {
    it("contains no chain or game state fields", () => {
      const state = useUIStore.getState();
      const forbiddenKeys = [
        "game",
        "gameId",
        "gameState",
        "players",
        "score",
        "scores",
        "round",
        "rounds",
        "currentRound",
        "lyrics",
        "song",
        "songs",
        "chain",
        "chainId",
        "contract",
        "contractAddress",
        "wallet",
        "walletAddress",
        "balance",
        "account",
        "user",
        "profile",
        "leaderboard",
        "transactions",
      ];

      for (const key of forbiddenKeys) {
        expect(state).not.toHaveProperty(key);
      }
    });

    it("exposes only UI actions", () => {
      const state = useUIStore.getState();
      const actionKeys = Object.keys(state).filter(
        (key) => typeof (state as unknown as Record<string, unknown>)[key] === "function",
      );

      expect(actionKeys.sort()).toEqual(
        [
          "clearUsernameDraft",
          "closeModal",
          "openModal",
          "setTheme",
          "setUsernameDraft",
          "toggleTheme",
        ].sort(),
      );
    });
  });
});