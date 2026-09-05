export type CancelableTask = {
    Cancel: () => void;
    Reset: () => void;
};

// Poll interval (ms). The original `setTimeout(runner, 0)` spun the event loop
// as fast as possible while waiting for a condition; a ~16ms hop (one frame) is
// imperceptible for every current caller (waiting on PlaybackAPI / DOM) and
// costs a fraction of the CPU.
const POLL_INTERVAL_MS = 16;

function Until<T>(
    statement: T | (() => T),
    callback: () => void,
    maxRepeats: number = Infinity
): CancelableTask {
    let isCancelled = false;
    let executedCount = 0;

    const resolveStatement = (): T => (typeof statement === 'function' ? (statement as () => T)() : statement);

    const runner = () => {
        if (isCancelled || executedCount >= maxRepeats) return;

        // 与 When 对齐：statement 抛异常不能让轮询静默停止
        try {
            const conditionMet = resolveStatement();
            if (!conditionMet) {
                callback();
                executedCount++;
                setTimeout(runner, POLL_INTERVAL_MS);
            }
        } catch {
            setTimeout(runner, POLL_INTERVAL_MS);
        }
    };

    setTimeout(runner, POLL_INTERVAL_MS);

    return {
        Cancel() {
            isCancelled = true;
        },
        Reset() {
            if (executedCount >= maxRepeats || isCancelled) {
                isCancelled = false;
                executedCount = 0;
                setTimeout(runner, POLL_INTERVAL_MS);
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

    const resolveStatement = (): T => (typeof statement === 'function' ? (statement as () => T)() : statement);

    const runner = () => {
        if (isCancelled || executionsRemaining <= 0) return;

        try {
            // 只求值一次：判定与回调用同一个值，避免条件有副作用/昂贵时
            // 两次求值结果不一致（如元素在两次求值间被移除）
            const value = resolveStatement();
            if (value) {
                callback(value);
                executionsRemaining--;
                if (executionsRemaining > 0) setTimeout(runner, POLL_INTERVAL_MS);
            } else {
                setTimeout(runner, POLL_INTERVAL_MS);
            }
        } catch {
            setTimeout(runner, POLL_INTERVAL_MS);
        }
    };

    setTimeout(runner, POLL_INTERVAL_MS);

    return {
        Cancel() {
            isCancelled = true;
        },
        Reset() {
            if (executionsRemaining <= 0 || isCancelled) {
                isCancelled = false;
                executionsRemaining = repeater;
                setTimeout(runner, POLL_INTERVAL_MS);
            }
        },
    };
}

const Whentil = {
    When,
    Until,
}

export default Whentil;
