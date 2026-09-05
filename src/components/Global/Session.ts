import Global from "./Global.ts";

interface Location {
  pathname: string;
  search?: string;
  hash?: string;
  state?: Record<string, any>;
}

// Cap the in-memory navigation log so long sessions don't grow it unboundedly.
const MAX_HISTORY = 50;

let sessionHistory: Location[] = [];

const Session = {
  Navigate: (data: Location) => {
    // History.push triggers the platform listener, which calls
    // RecordNavigation — no double-push here.
    Spicetify.Platform.History.push(data);
  },
  GoBack: () => {
    if (sessionHistory.length > 1) {
      Spicetify.Platform.History.goBack();
    } else {
      Session.Navigate({ pathname: "/" });
    }
  },
  RecordNavigation: (data: Location, action?: string) => {
    // POP = 浏览器后退（History.goBack 也会触发 listen）：是"弹出"而不是
    // 新导航，追加会把历史变成操作日志，GoBack 的 length>1 判据失真。
    // REPLACE 同理是替换栈顶。action 缺失（API 变化）时保持旧的追加行为。
    if (action === "POP") {
      sessionHistory.pop();
    } else if (action !== "REPLACE") {
      Session.PushToHistory(data);
    }
    Global.Event.evoke("session:navigation", data);
  },
  PushToHistory: (data: Location) => {
    sessionHistory.push(data);
    if (sessionHistory.length > MAX_HISTORY) {
      sessionHistory = sessionHistory.slice(-MAX_HISTORY);
    }
  },
};

export default Session;
