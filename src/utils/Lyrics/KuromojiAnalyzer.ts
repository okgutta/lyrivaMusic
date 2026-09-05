// deno-lint-ignore-file no-async-promise-executor no-explicit-any
import { RetrievePackage } from "../ImportPackage.ts";

RetrievePackage("Kuromoji", "1.0.0", "js")
  .catch(() => {});

let Analyzer: any;
// 初始化失败时间戳：60s 内拒绝重试（防反复打网），之后允许恢复——否则启动
// 瞬间的网络抖动会让罗马音沉默失效到重载插件
let initFailedAt = 0;
// 共享 in-flight Promise：并发调用 init() 只构建一次分析器
let inFlightInit: Promise<void> | null = null;

const MAX_WAIT_MS = 15000;
const RETRY_COOLDOWN_MS = 60_000;

export const init = (): Promise<void> => {
  if (Analyzer !== undefined) return Promise.resolve();
  if (initFailedAt > 0) {
    if (Date.now() - initFailedAt < RETRY_COOLDOWN_MS) {
      return Promise.reject(new Error("Kuromoji 初始化失败（冷却中）"));
    }
    initFailedAt = 0; // 冷却已过：允许重试
  }
  if (inFlightInit) return inFlightInit;

  inFlightInit = new Promise<void>((resolve, reject) => {
    (async () => {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        await RetrievePackage("Kuromoji", "1.0.0", "js");
        // 包加载成功但全局未挂载时最多等 15s，避免永久空转
        const deadline = Date.now() + MAX_WAIT_MS;
        while (!(window as any).kuromoji) {
          if (Date.now() > deadline) {
            throw new Error("等待 kuromoji 全局挂载超时");
          }
          await new Promise((r) => setTimeout(r, 50));
        }
        await new Promise<void>((res, rej) => {
          timeout = setTimeout(() => rej(new Error("kuromoji.builder 超时")), MAX_WAIT_MS);
          (window as any).kuromoji.builder({
            dicPath: "https://kuromoji.pkgs.spikerko.org",
          }).build((error: any, analyzer: any) => {
            if (timeout) clearTimeout(timeout);
            if (error) return rej(error);
            Analyzer = analyzer;
            res();
          });
        });
        resolve();
      } catch (err) {
        initFailedAt = Date.now();
        reject(err);
      } finally {
        inFlightInit = null;
      }
    })();
  });

  return inFlightInit;
};
export const parse = (text = ""): Promise<any> => {
  if (text.trim() === "" || Analyzer === undefined) {
    return Promise.resolve([]);
  }

  const result = Analyzer.tokenize(text) as any[];
  for (const token of result) {
    token.verbose = {
      word_id: token.word_id,
      word_type: token.word_type,
      word_position: token.word_position,
    };
    delete token.word_id;
    delete token.word_type;
    delete token.word_position;
  }

  return Promise.resolve(result);
};
