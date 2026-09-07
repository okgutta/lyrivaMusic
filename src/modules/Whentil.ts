export type CancelableTask = {
  Cancel: () => void;
  Reset: () => void;
};

const POLL_INTERVAL_MS = 16;

function reportCallbackError(kind: "When" | "Until", error: unknown): void {
  console.error(`lyrivaMusic: Whentil.${kind} callback failed`, error);
}

function Until<T>(
  statement: T | (() => T),
  callback: () => void,
  maxRepeats: number = Infinity
): CancelableTask {
  let isCancelled = false;
  let executedCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resolveStatement = (): T =>
    typeof statement === "function" ? (statement as () => T)() : statement;

  const schedule = () => {
    if (isCancelled || executedCount >= maxRepeats || timer !== null) return;
    timer = setTimeout(runner, POLL_INTERVAL_MS);
  };

  const runner = () => {
    timer = null;
    if (isCancelled || executedCount >= maxRepeats) return;

    let conditionMet: T;
    try {
      conditionMet = resolveStatement();
    } catch {
      schedule();
      return;
    }

    if (conditionMet) return;
    try {
      callback();
    } catch (error) {
      // A broken callback must not become a permanent 60 FPS exception loop.
      reportCallbackError("Until", error);
    } finally {
      executedCount += 1;
    }
    schedule();
  };

  schedule();

  return {
    Cancel() {
      isCancelled = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    Reset() {
      if (executedCount >= maxRepeats || isCancelled) {
        isCancelled = false;
        executedCount = 0;
        schedule();
      }
    },
  };
}

function When<T>(
  statement: T | (() => T),
  callback: (statement: T) => void,
  repeater: number = 1
): CancelableTask {
  let isCancelled = false;
  let executionsRemaining = repeater;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resolveStatement = (): T =>
    typeof statement === "function" ? (statement as () => T)() : statement;

  const schedule = () => {
    if (isCancelled || executionsRemaining <= 0 || timer !== null) return;
    timer = setTimeout(runner, POLL_INTERVAL_MS);
  };

  const runner = () => {
    timer = null;
    if (isCancelled || executionsRemaining <= 0) return;

    let value: T;
    try {
      value = resolveStatement();
    } catch {
      schedule();
      return;
    }

    if (!value) {
      schedule();
      return;
    }

    try {
      callback(value);
    } catch (error) {
      // Consume this execution even on failure; retrying a deterministic broken
      // callback forever hides the real error and burns a frame every 16 ms.
      reportCallbackError("When", error);
    } finally {
      executionsRemaining -= 1;
    }
    schedule();
  };

  schedule();

  return {
    Cancel() {
      isCancelled = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    Reset() {
      if (executionsRemaining <= 0 || isCancelled) {
        isCancelled = false;
        executionsRemaining = repeater;
        schedule();
      }
    },
  };
}

const Whentil = { When, Until };

export default Whentil;
