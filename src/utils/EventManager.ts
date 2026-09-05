// Event bus used across the extension. `listen` returns a stable id that
// `unListen` must be given to remove the callback; a reverse map keeps that
// removal O(1) instead of scanning every event name.
type EventCallback = (...args: any[]) => void;
type EventId = number;
type EventListeners = Map<EventId, EventCallback>;

const eventRegistry = new Map<string, EventListeners>();
const idToEventName = new Map<EventId, string>();

let nextId = 1;

const listen = (eventName: string, callback: EventCallback): EventId => {
  let listeners = eventRegistry.get(eventName);
  if (!listeners) {
    listeners = new Map();
    eventRegistry.set(eventName, listeners);
  }

  const id = nextId++;
  listeners.set(id, callback);
  idToEventName.set(id, eventName);
  return id;
};

const unListen = (id: EventId): boolean => {
  const eventName = idToEventName.get(id);
  if (eventName === undefined) return false;
  idToEventName.delete(id);

  const listeners = eventRegistry.get(eventName);
  if (listeners) {
    listeners.delete(id);
    if (listeners.size === 0) {
      eventRegistry.delete(eventName);
    }
  }
  return true;
};

const evoke = (eventName: string, ...args: any[]): void => {
  const listeners = eventRegistry.get(eventName);
  if (listeners) {
    for (const callback of listeners.values()) {
      // 异常隔离：一个坏订阅者不能打断其余监听器（onprogress 等高频事件
      // 每 500ms 派发一次，一次抛错会让同事件的其他订阅者全部收不到）
      try {
        callback(...args);
      } catch (err) {
        console.error(`[EventManager] listener for "${eventName}" threw:`, err);
      }
    }
  }
};

const Event = {
  listen,
  unListen,
  evoke,
};

export default Event;
