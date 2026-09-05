type FrameCallback = () => void;

const subscribers = new Set<FrameCallback>();
let frame: number | null = null;

const tick = (): void => {
  for (const callback of subscribers) {
    // 异常隔离：一个订阅者的错误不能打断同帧的其它订阅者
    try {
      callback();
    } catch (err) {
      console.error("[FrameLoop] subscriber threw:", err);
    }
  }
  if (subscribers.size > 0) {
    frame = requestAnimationFrame(tick);
  } else {
    // 无订阅者时主循环自停；下次 onFrame 重启
    frame = null;
  }
};

/**
 * 共享的 requestAnimationFrame 主循环。
 *
 * 此前动画（LyricsInterval）、滚动跟随（scrollFollowLoop）、滚动条显隐
 * （scrollbarLoop）各自跑一条独立的 rAF 链；合并到这里后整个应用只有
 * 一条 rAF，所有每帧任务作为订阅者挂进来。
 *
 * 用法：返回取消订阅函数。需要"条件不满足就停"的任务在回调里自行调退订——
 * 全部退订后主循环自动停止，不会空转烧帧。
 */
export function onFrame(callback: FrameCallback): () => void {
  subscribers.add(callback);
  if (frame === null) {
    frame = requestAnimationFrame(tick);
  }
  return () => {
    subscribers.delete(callback);
  };
}
